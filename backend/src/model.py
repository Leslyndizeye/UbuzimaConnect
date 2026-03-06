# src/model.py
# Model architecture — matches Ubuzima Connect Training notebook (4-class version)
# ResNet50 base → GAP → Dense(512) → BN → Dropout(0.4)
#              → Dense(256) → BN → Dropout(0.3) → Dense(4, softmax)

import os
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models, optimizers, callbacks
from tensorflow.keras.applications import ResNet50
from pathlib import Path
from datetime import datetime

CLASSES        = ["Normal", "Pneumonia", "Tuberculosis", "Unknown"]
NUM_CLASSES    = 4
IMG_SHAPE      = (224, 224, 3)
LEARNING_RATE  = 1e-4
BATCH_SIZE     = 32
EPOCHS_PHASE1  = 15
EPOCHS_PHASE2  = 10
MODEL_DIR      = Path(__file__).parent.parent / "models"
LOG_DIR        = Path(__file__).parent.parent / "logs"

MODEL_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)

PRODUCTION_MODEL = MODEL_DIR / "ubuzima_model_production.keras"
CHECKPOINT_MODEL = MODEL_DIR / "ubuzima_model_checkpoint.keras"

# BUILD


def build_clinical_model(freeze_base: bool = True):
    """
    Build the ResNet50-based clinical model matching training notebook.
    4 classes: Normal, Pneumonia, Tuberculosis, Unknown
    """
    base = ResNet50(weights="imagenet", include_top=False, input_shape=IMG_SHAPE)
    base.trainable = not freeze_base

    inputs  = tf.keras.Input(shape=IMG_SHAPE, name='xray_input')
    x       = base(inputs, training=False)
    x       = layers.GlobalAveragePooling2D(name='gap')(x)
    x       = layers.Dense(512, activation='relu', name='dense_512')(x)
    x       = layers.BatchNormalization(name='bn_1')(x)
    x       = layers.Dropout(0.4, name='drop_1')(x)
    x       = layers.Dense(256, activation='relu', name='dense_256')(x)
    x       = layers.BatchNormalization(name='bn_2')(x)
    x       = layers.Dropout(0.3, name='drop_2')(x)
    outputs = layers.Dense(NUM_CLASSES, activation='softmax', name='predictions')(x)

    model = tf.keras.Model(inputs, outputs, name='ubuzima_resnet50')
    model.compile(
        optimizer=optimizers.Adam(learning_rate=LEARNING_RATE),
        loss="categorical_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )
    return model, base


# 
# RETRAIN (loads production model and continues training)
# 

def retrain_model(train_ds, val_ds, class_weights: dict, epochs: int = EPOCHS_PHASE2) -> dict:
    """
    Retrain starting from the current production model.
    Used when new labelled data is uploaded via the API.
    Overwrites production model only if val_auc improves.
    """
    if not PRODUCTION_MODEL.exists():
        raise FileNotFoundError(
            f"Production model not found at {PRODUCTION_MODEL}. "
            "Run full training first."
        )

    print(f"\n🔄 Loading production model from {PRODUCTION_MODEL}…")
    model = tf.keras.models.load_model(str(PRODUCTION_MODEL), compile=False)

    # Unfreeze last 30 layers of ResNet base for fine-tuning
    for layer in model.layers:
        if hasattr(layer, 'layers'):   # ResNet base
            layer.trainable = True
            for sub in layer.layers[:-30]:
                sub.trainable = False
    print(f"  Trainable params: {sum([np.prod(v.shape) for v in model.trainable_variables]):,}")

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )

    retrain_ckpt = MODEL_DIR / "ubuzima_retrain_checkpoint.keras"
    cb = [
        callbacks.EarlyStopping(
            monitor="val_loss", patience=4, restore_best_weights=True, verbose=1
        ),
        callbacks.ModelCheckpoint(
            str(retrain_ckpt),
            monitor="val_auc",
            save_best_only=True,
            mode="max",
            verbose=1,
        ),
    ]

    print(f"\n🚀 Retraining for up to {epochs} epochs…")
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs,
        class_weight=class_weights,
        callbacks=cb,
    )

    # Only overwrite production if retrained model is better
    if retrain_ckpt.exists():
        import shutil
        shutil.copy(str(retrain_ckpt), str(PRODUCTION_MODEL))
        print(f" Production model updated → {PRODUCTION_MODEL}")

    _save_training_log(history.history, "retrain")
    return history.history


# 
# LOAD PRODUCTION MODEL
# 

_cached_model = None

def load_production_model():
    """Load (and cache) the production model."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model
    if not PRODUCTION_MODEL.exists():
        print(f"  No production model found at {PRODUCTION_MODEL}")
        return None
    print(f" Loading production model: {PRODUCTION_MODEL}")
    _cached_model = tf.keras.models.load_model(str(PRODUCTION_MODEL), compile=False)
    print(f" Model loaded. Output shape: {_cached_model.output_shape}")
    return _cached_model


def invalidate_model_cache():
    """Call after retraining to force reload."""
    global _cached_model
    _cached_model = None

# HELPERS

def _save_training_log(history: dict, run_type: str):
    log_path = LOG_DIR / f"{run_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(log_path, "w") as f:
        serializable = {k: [float(x) for x in v] for k, v in history.items()}
        json.dump({
            "run_type":  run_type,
            "timestamp": str(datetime.now()),
            "history":   serializable,
        }, f, indent=2)
    print(f"  Training log saved → {log_path}")


def get_latest_training_log() -> dict | None:
    logs = sorted(LOG_DIR.glob("*.json"), reverse=True)
    if not logs:
        return None
    with open(logs[0]) as f:
        return json.load(f)


def get_model_info() -> dict:
    """Return metadata about the current production model."""
    if not PRODUCTION_MODEL.exists():
        return {"status": "not_found", "path": str(PRODUCTION_MODEL)}
    stat = PRODUCTION_MODEL.stat()
    return {
        "status":       "loaded" if _cached_model is not None else "on_disk",
        "path":         str(PRODUCTION_MODEL),
        "size_mb":      round(stat.st_size / 1_048_576, 1),
        "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        "classes":      CLASSES,
        "architecture": "ResNet50 → GAP → Dense(512) → BN → Dropout → Dense(256) → BN → Dropout → Dense(4)",
        "input_shape":  list(IMG_SHAPE),
    }