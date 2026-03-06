# src/prediction.py
# Updated for new 4-class model trained in Colab:
#   Classes: Normal, Pneumonia, Tuberculosis, Unknown
#   Architecture: ResNet50 → GAP → Dense(512) → BN → Dropout(0.4)
#                           → Dense(256) → BN → Dropout(0.3) → Dense(4)

import io
import base64
import logging
import numpy as np
import cv2
import tensorflow as tf
from tensorflow.keras import layers, models, optimizers
from tensorflow.keras.applications import ResNet50

logger = logging.getLogger(__name__)

#  4 classes — updated for new model
CLASSES = ["Normal", "Pneumonia", "Tuberculosis", "Unknown"]
IMG_SIZE = 224
CONFIDENCE_THRESHOLD = 60.0   # Below this → flag as Unknown


# ── Build exact architecture matching the new training notebook ────────────────

def build_model() -> tf.keras.Model:
    """
    Matches new training notebook architecture exactly:
      ResNet50 base (functional, include_top=False)
      GlobalAveragePooling2D          (name='gap')
      Dense(512, relu)                (name='dense_512')
      BatchNormalization              (name='bn_1')
      Dropout(0.4)                    (name='drop_1')
      Dense(256, relu)                (name='dense_256')
      BatchNormalization              (name='bn_2')
      Dropout(0.3)                    (name='drop_2')
      Dense(4, softmax)               (name='predictions')
    """
    base = ResNet50(
        weights=None,
        include_top=False,
        input_shape=(IMG_SIZE, IMG_SIZE, 3),
    )
    base.trainable = False

    inputs = tf.keras.Input(shape=(IMG_SIZE, IMG_SIZE, 3), name='xray_input')
    x = base(inputs, training=False)
    x = layers.GlobalAveragePooling2D(name='gap')(x)
    x = layers.Dense(512, activation='relu', name='dense_512')(x)
    x = layers.BatchNormalization(name='bn_1')(x)
    x = layers.Dropout(0.4, name='drop_1')(x)
    x = layers.Dense(256, activation='relu', name='dense_256')(x)
    x = layers.BatchNormalization(name='bn_2')(x)
    x = layers.Dropout(0.3, name='drop_2')(x)
    outputs = layers.Dense(4, activation='softmax', name='predictions')(x)

    model = tf.keras.Model(inputs, outputs, name='ubuzima_resnet50')
    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-4),
        loss='categorical_crossentropy',
        metrics=['accuracy', tf.keras.metrics.AUC(name='auc')],
    )

    # Build the model by passing a dummy input so weights are initialised
    model(tf.zeros((1, IMG_SIZE, IMG_SIZE, 3)), training=False)
    return model


def load_model(model_path: str) -> tf.keras.Model:
    logger.info(f"Loading model from {model_path}...")
    model = tf.keras.models.load_model(model_path, compile=False)
    logger.info(f" Model loaded. Output shape: {model.output_shape}")
    return model

#  Preprocessing 

def preprocess_image(image_bytes: bytes) -> tuple[np.ndarray, np.ndarray]:
    """
    Preprocess image bytes for inference.
    Returns (batch, original_rgb) where batch shape is (1, 224, 224, 3).
    Mirrors training: resize → per-image standardisation.
    """
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image. Make sure it is a valid PNG/JPG.")

    # Convert BGR → RGB
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # Resize to 224x224
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE)).astype(np.float32)

    # Keep a copy for Grad-CAM overlay before normalisation
    original_rgb = img.copy().astype(np.uint8)

    # Per-image standardisation — matches training pipeline
    mean = img.mean()
    std  = img.std() + 1e-7
    img  = (img - mean) / std

    batch = np.expand_dims(img, axis=0)   # (1, 224, 224, 3)
    return batch, original_rgb


# ── Inference ──────────────────────────────────────────────────────────────────

def predict(model: tf.keras.Model, img_batch: np.ndarray) -> dict:
    """Run inference and return structured prediction dict."""
    probs = model.predict(img_batch, verbose=0)[0]

    num_classes = len(probs)
    class_idx      = int(np.argmax(probs))
    classification = CLASSES[class_idx] if class_idx < len(CLASSES) else "Unknown"
    confidence     = float(probs[class_idx]) * 100

    # Flag low-confidence predictions as Unknown
    if confidence < CONFIDENCE_THRESHOLD:
        classification = "Unknown"

    explanation = _build_explanation(classification, confidence, probs)

    return {
        "classification":        classification,
        "confidence_score":      round(confidence, 2),
        "normal_probability":    round(float(probs[0]), 4),
        "pneumonia_probability": round(float(probs[1]), 4),
        "tb_probability":        round(float(probs[2]), 4),
        "unknown_probability":   round(float(probs[3]), 4) if num_classes > 3 else 0.0,
        "explanation":           explanation,
    }

def _build_explanation(classification: str, confidence: float, probs: np.ndarray) -> str:
    if classification == "Normal":
        return (
            f"No significant pulmonary abnormalities detected (confidence {confidence:.1f}%). "
            "Lung fields appear clear with no evidence of consolidation, effusion, or mass lesions."
        )
    elif classification == "Tuberculosis":
        return (
            f"Features consistent with Tuberculosis detected (confidence {confidence:.1f}%). "
            "Recommend sputum AFB testing and clinical correlation. "
            "Upper lobe opacity or cavitation pattern may be present."
        )
    elif classification == "Pneumonia":
        return (
            f"Features consistent with Pneumonia detected (confidence {confidence:.1f}%). "
            "Consolidation pattern observed. "
            "Recommend clinical correlation and appropriate antibiotic therapy."
        )
    else:  # Unknown
        return (
            f"Image could not be confidently classified (confidence {confidence:.1f}%). "
            "This may indicate poor image quality, an atypical presentation, "
            "or a non-chest X-ray image. Manual radiologist review is required."
        )


# ── Grad-CAM ───────────────────────────────────────────────────────────────────

def generate_gradcam(model: tf.keras.Model, img_batch: np.ndarray,
                     original_rgb: np.ndarray) -> str | None:
    """
    Generate Grad-CAM heatmap and return as base64 PNG data URI.
    Returns None if generation fails (non-critical).
    Works with the functional model: xray_input → resnet50 → gap → ... → predictions
    """
    try:
        # Get the ResNet50 base (named 'resnet50') inside the functional model
        base = model.get_layer('resnet50')

        img_tensor = tf.constant(img_batch, dtype=tf.float32)

        with tf.GradientTape() as tape:
            tape.watch(img_tensor)
            # Pass through ResNet base — output is conv5_block3_out (7x7x2048)
            conv_out = base(img_tensor, training=False)
            # Pass through head manually so tape tracks gradients
            x = model.get_layer('gap')(conv_out)
            x = model.get_layer('dense_512')(x)
            x = model.get_layer('bn_1')(x, training=False)
            x = model.get_layer('drop_1')(x, training=False)
            x = model.get_layer('dense_256')(x)
            x = model.get_layer('bn_2')(x, training=False)
            x = model.get_layer('drop_2')(x, training=False)
            predictions = model.get_layer('predictions')(x)
            pred_index  = tf.argmax(predictions[0])
            class_score = predictions[:, pred_index]

        grads        = tape.gradient(class_score, conv_out)
        pooled_grads = tf.reduce_mean(grads, axis=(0, 1, 2))
        heatmap      = conv_out[0] @ pooled_grads[..., tf.newaxis]
        heatmap      = tf.squeeze(heatmap).numpy()
        heatmap      = np.maximum(heatmap, 0)

        if heatmap.max() > 0:
            heatmap /= heatmap.max()

        # Resize heatmap to image size and apply colormap
        h, w            = original_rgb.shape[:2]
        heatmap_resized = cv2.resize(heatmap, (w, h))
        heatmap_uint8   = np.uint8(255 * heatmap_resized)
        heatmap_colored = cv2.applyColorMap(heatmap_uint8, cv2.COLORMAP_JET)
        heatmap_rgb     = cv2.cvtColor(heatmap_colored, cv2.COLOR_BGR2RGB)

        # Superimpose on original image
        superimposed = cv2.addWeighted(original_rgb, 0.55, heatmap_rgb, 0.45, 0)

        # Encode to base64 PNG
        _, buffer = cv2.imencode(".png", cv2.cvtColor(superimposed, cv2.COLOR_RGB2BGR))
        b64 = base64.b64encode(buffer).decode("utf-8")
        return f"data:image/png;base64,{b64}"

    except Exception as e:
        logger.warning(f"Grad-CAM generation failed (non-critical): {e}")
        return None


# ── Evaluation helper (used by /model/evaluate endpoint) ──────────────────────

def evaluate_on_dataset(model, dataset) -> dict:
    """Evaluate model on a tf.data.Dataset, return metrics dict."""
    from sklearn.metrics import (
        classification_report, confusion_matrix, f1_score,
        precision_score, recall_score,
    )

    all_preds, all_labels = [], []
    for batch_x, batch_y in dataset:
        preds  = model.predict(batch_x, verbose=0)
        all_preds.extend(np.argmax(preds,           axis=1))
        all_labels.extend(np.argmax(batch_y.numpy(), axis=1))

    all_preds  = np.array(all_preds)
    all_labels = np.array(all_labels)

    report = classification_report(all_labels, all_preds,
                                   target_names=CLASSES, output_dict=True)
    cm = confusion_matrix(all_labels, all_preds).tolist()

    return {
        "f1_macro":        round(f1_score(all_labels, all_preds, average="macro"),        4),
        "precision_macro": round(precision_score(all_labels, all_preds, average="macro"), 4),
        "recall_macro":    round(recall_score(all_labels, all_preds, average="macro"),    4),
        "confusion_matrix": cm,
        "per_class":        report,
    }