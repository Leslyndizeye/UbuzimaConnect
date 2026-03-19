# src/model.py
# ResNet50 — 4-class: Normal, Pneumonia, Tuberculosis, Unknown
# Optimized for high-accuracy retraining with 100-1000 images per class

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
MODEL_DIR      = Path(__file__).parent.parent / "models"
LOG_DIR        = Path(__file__).parent.parent / "logs"

MODEL_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)

PRODUCTION_MODEL = MODEL_DIR / "ubuzima_model_production.keras"
CHECKPOINT_MODEL = MODEL_DIR / "ubuzima_model_checkpoint.keras"

# ─────────────────────────────────────────────────────────────
# RETRAIN — 3-phase strategy for maximum accuracy
# ─────────────────────────────────────────────────────────────

def retrain_model(train_ds, val_ds, class_weights: dict) -> dict:
    """
    3-phase retraining strategy:

    Phase 1 — Warm up head only (10 epochs, LR=1e-4)
      Freeze entire ResNet base, train only Dense layers.
      Fast convergence, prevents destroying pretrained features.

    Phase 2 — Fine-tune top ResNet layers (20 epochs, LR=1e-5)
      Unfreeze last 50 layers of ResNet base.
      Adapts high-level features to chest X-ray domain.

    Phase 3 — Deep fine-tune (15 epochs, LR=1e-6)
      Unfreeze last 100 layers.
      Squeezes final accuracy gains.

    Total: up to 45 epochs with early stopping.
    EarlyStopping patience=6 per phase — stops early if no improvement.
    Best weights always restored before next phase.
    """
    # ── Try .keras first, fall back to .h5 ──
    prod_path = PRODUCTION_MODEL
    if not prod_path.exists():
        h5_path = MODEL_DIR / "ubuzima_model_production.h5"
        if h5_path.exists():
            prod_path = h5_path
        else:
            raise FileNotFoundError(
                f"Production model not found. Run full training first."
            )

    print(f"\nLoading production model from {prod_path}...")
    model = tf.keras.models.load_model(str(prod_path), compile=False)

    resnet_base = None
    for layer in model.layers:
        if "resnet" in layer.name.lower():
            resnet_base = layer
            break

    all_history = {}
    phase_summaries = []

    # ═══ PHASE 1 — Head only (10 epochs, LR=1e-4) ═══════════
    print("\n" + "="*50)
    print("PHASE 1 — Warming up head (base frozen)")
    print("="*50)

    if resnet_base:
        resnet_base.trainable = False
    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-4),
        loss="categorical_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )

    ckpt1 = MODEL_DIR / "ckpt_phase1.keras"
    cb1 = [
        callbacks.EarlyStopping(
            monitor="val_auc", patience=6,
            restore_best_weights=True, mode="max", verbose=1
        ),
        callbacks.ModelCheckpoint(
            str(ckpt1), monitor="val_auc",
            save_best_only=True, mode="max", verbose=1
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.3,
            patience=3, min_lr=1e-8, verbose=1
        ),
    ]

    h1 = model.fit(
        train_ds, validation_data=val_ds,
        epochs=10, class_weight=class_weights, callbacks=cb1,
    )
    all_history["phase1"] = {k: [float(v) for v in vals] for k, vals in h1.history.items()}
    best_auc_p1 = max(h1.history.get("val_auc", [0]))
    best_idx_p1 = int(np.argmax(h1.history.get("val_auc", [0])))
    best_acc_p1 = h1.history.get("val_accuracy", [0])[best_idx_p1] if h1.history.get("val_accuracy") else 0
    phase_summaries.append(("phase1", ckpt1, float(best_auc_p1), float(best_acc_p1)))
    print(f"\nPhase 1 complete. Best val_auc: {best_auc_p1:.4f}")

    # ═══ PHASE 2 — Fine-tune top 50 layers (20 epochs, LR=1e-5) ══
    print("\n" + "="*50)
    print("PHASE 2 — Fine-tuning top 50 ResNet layers")
    print("="*50)

    if resnet_base:
        resnet_base.trainable = True
        for layer in resnet_base.layers[:-50]:
            layer.trainable = False
        trainable = sum(np.prod(v.shape) for v in model.trainable_variables)
        print(f"  Trainable params: {trainable:,}")

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )

    ckpt2 = MODEL_DIR / "ckpt_phase2.keras"
    cb2 = [
        callbacks.EarlyStopping(
            monitor="val_auc", patience=6,
            restore_best_weights=True, mode="max", verbose=1
        ),
        callbacks.ModelCheckpoint(
            str(ckpt2), monitor="val_auc",
            save_best_only=True, mode="max", verbose=1
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.3,
            patience=3, min_lr=1e-8, verbose=1
        ),
    ]

    h2 = model.fit(
        train_ds, validation_data=val_ds,
        epochs=20, class_weight=class_weights, callbacks=cb2,
    )
    all_history["phase2"] = {k: [float(v) for v in vals] for k, vals in h2.history.items()}
    best_auc_p2 = max(h2.history.get("val_auc", [0]))
    best_idx_p2 = int(np.argmax(h2.history.get("val_auc", [0])))
    best_acc_p2 = h2.history.get("val_accuracy", [0])[best_idx_p2] if h2.history.get("val_accuracy") else 0
    phase_summaries.append(("phase2", ckpt2, float(best_auc_p2), float(best_acc_p2)))
    print(f"\nPhase 2 complete. Best val_auc: {best_auc_p2:.4f}")

    # ═══ PHASE 3 — Deep fine-tune (15 epochs, LR=1e-6) ══════════
    print("\n" + "="*50)
    print("PHASE 3 — Deep fine-tuning top 100 layers")
    print("="*50)

    if resnet_base:
        resnet_base.trainable = True
        for layer in resnet_base.layers[:-100]:
            layer.trainable = False
        trainable = sum(np.prod(v.shape) for v in model.trainable_variables)
        print(f"  Trainable params: {trainable:,}")

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-6),
        loss="categorical_crossentropy",
        metrics=["accuracy", tf.keras.metrics.AUC(name="auc")],
    )

    ckpt3 = MODEL_DIR / "ckpt_phase3.keras"
    cb3 = [
        callbacks.EarlyStopping(
            monitor="val_auc", patience=6,
            restore_best_weights=True, mode="max", verbose=1
        ),
        callbacks.ModelCheckpoint(
            str(ckpt3), monitor="val_auc",
            save_best_only=True, mode="max", verbose=1
        ),
        callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.3,
            patience=3, min_lr=1e-9, verbose=1
        ),
    ]

    h3 = model.fit(
        train_ds, validation_data=val_ds,
        epochs=15, class_weight=class_weights, callbacks=cb3,
    )
    all_history["phase3"] = {k: [float(v) for v in vals] for k, vals in h3.history.items()}
    best_auc_p3 = max(h3.history.get("val_auc", [0]))
    best_idx_p3 = int(np.argmax(h3.history.get("val_auc", [0])))
    best_acc_p3 = h3.history.get("val_accuracy", [0])[best_idx_p3] if h3.history.get("val_accuracy") else 0
    phase_summaries.append(("phase3", ckpt3, float(best_auc_p3), float(best_acc_p3)))
    print(f"\nPhase 3 complete. Best val_auc: {best_auc_p3:.4f}")

    # ═══ Save best model across all phases ═══════════════════
    # Pick the checkpoint with the highest val_auc
    best_auc = 0.0
    best_acc = 0.0
    best_phase = None
    best_ckpt = None
    for phase_name, ckpt, auc, acc in phase_summaries:
        if ckpt.exists() and auc > best_auc:
            best_auc = auc
            best_acc = acc
            best_phase = phase_name
            best_ckpt = ckpt

    if best_ckpt and best_ckpt.exists():
        import shutil
        shutil.copy(str(best_ckpt), str(PRODUCTION_MODEL))
        print(f"\nBest model ({best_phase}, val_auc={best_auc:.4f}) saved -> {PRODUCTION_MODEL}")
    else:
        # Fallback — save current model state
        model.save(str(PRODUCTION_MODEL))
        print(f"\nModel saved -> {PRODUCTION_MODEL}")

    # Cleanup phase checkpoints
    for ckpt in [ckpt1, ckpt2, ckpt3]:
        if ckpt.exists():
            ckpt.unlink()

    # Flatten history for return (API expects flat dict)
    flat_history = {}
    for phase, hist in all_history.items():
        for metric, values in hist.items():
            flat_history[f"{phase}_{metric}"] = values
    # Add summary
    flat_history["val_auc"] = [float(best_auc)]
    flat_history["val_accuracy"] = [float(best_acc)]
    flat_history["best_phase"] = best_phase

    try:
        _save_training_log(flat_history, "retrain")
    except Exception as e:
        print(f"  Warning: failed to save training log: {e}")
    return flat_history


# ─────────────────────────────────────────────────────────────
# LOAD PRODUCTION MODEL (cached)
# ─────────────────────────────────────────────────────────────

_cached_model = None

def load_production_model():
    global _cached_model
    if _cached_model is not None:
        return _cached_model

    # Try .keras first, then .h5
    for path in [
        MODEL_DIR / "ubuzima_model_production.keras",
        MODEL_DIR / "ubuzima_model_production.h5",
    ]:
        if path.exists():
            print(f"Loading model: {path}")
            try:
                _cached_model = tf.keras.models.load_model(str(path), compile=False)
                print(f"  Output shape: {_cached_model.output_shape}")
                return _cached_model
            except Exception as e:
                print(f"  Failed to load {path}: {e}")

    print("No production model found.")
    return None


def invalidate_model_cache():
    global _cached_model
    _cached_model = None
    print("Model cache cleared — will reload on next request.")


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _save_training_log(history: dict, run_type: str):
    log_path = LOG_DIR / f"{run_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(log_path, "w") as f:
        serializable = {}
        for k, v in history.items():
            if isinstance(v, list):
                serializable[k] = [
                    float(x) if isinstance(x, (int, float, np.integer, np.floating)) else x
                    for x in v
                ]
            elif isinstance(v, (int, float, np.integer, np.floating)):
                serializable[k] = float(v)
            else:
                serializable[k] = v
        json.dump({
            "run_type": run_type,
            "timestamp": str(datetime.now()),
            "history": serializable,
        }, f, indent=2)
    print(f"  Training log saved → {log_path}")


def get_model_info() -> dict:
    for path in [
        MODEL_DIR / "ubuzima_model_production.keras",
        MODEL_DIR / "ubuzima_model_production.h5",
    ]:
        if path.exists():
            stat = path.stat()
            return {
                "status":       "loaded" if _cached_model is not None else "on_disk",
                "path":         str(path),
                "size_mb":      round(stat.st_size / 1_048_576, 1),
                "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "classes":      CLASSES,
                "architecture": "ResNet50 → GAP → Dense(512) → BN → Dropout(0.4) → Dense(256) → BN → Dropout(0.3) → Dense(4, softmax)",
                "input_shape":  list(IMG_SHAPE),
            }
    return {"status": "not_found", "path": str(MODEL_DIR)}
