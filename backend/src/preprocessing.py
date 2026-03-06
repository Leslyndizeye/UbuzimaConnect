# src/preprocessing.py
# Preprocessing pipeline — mirrors training notebook exactly
# Classes: Normal=0, Pneumonia=1, Tuberculosis=2, Unknown=3

import os
import shutil
import cv2
import numpy as np
import tensorflow as tf
from pathlib import Path
from typing import Tuple, List

IMG_SIZE = 224
CLASSES = ["Normal", "Pneumonia", "Tuberculosis", "Unknown"]
SEED = 42


def preprocess_image_for_inference(image_bytes: bytes) -> np.ndarray:
    """
    Single-image preprocessing for live API inference.
    Matches training pipeline: border crop → resize → per-image standardization.
    Returns shape (1, 224, 224, 3) ready for model.predict().
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_bgr is None:
        raise ValueError("Could not decode image. Ensure it is a valid JPG/PNG.")

    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # Border crop — same as training: img[10:-10, 10:-10, :]
    h, w = img_rgb.shape[:2]
    if h > 20 and w > 20:
        img_rgb = img_rgb[10:-10, 10:-10, :]

    # Resize to 224x224
    img_resized = cv2.resize(img_rgb, (IMG_SIZE, IMG_SIZE))
    img_float = img_resized.astype(np.float32)

    # Per-image standardization — same as tf.image.per_image_standardization
    mean = np.mean(img_float)
    std  = np.std(img_float)
    std  = max(std, 1.0 / np.sqrt(img_float.size))   # avoid division by zero
    img_norm = (img_float - mean) / std

    # Keep original (BGR) for Grad-CAM overlay
    img_original_for_cam = img_resized  # RGB uint8

    return np.expand_dims(img_norm, axis=0), img_original_for_cam


def preprocess_image_file(filepath: str) -> Tuple[np.ndarray, np.ndarray]:
    """Preprocess an image from disk path."""
    with open(filepath, "rb") as f:
        return preprocess_image_for_inference(f.read())


def preprocess_bulk_upload(upload_dir: str, output_base_dir: str) -> dict:
    """
    Preprocess bulk-uploaded images for retraining.
    
    Expects upload_dir to contain subfolders named after classes:
        upload_dir/Normal/
        upload_dir/Pneumonia/
        upload_dir/Tuberculosis/
        upload_dir/Unknown/
    
    Saves preprocessed images to output_base_dir with same structure.
    Returns dict with counts per class.
    """
    counts = {}

    for cls in CLASSES:
        src_dir = Path(upload_dir) / cls
        dst_dir = Path(output_base_dir) / cls
        dst_dir.mkdir(parents=True, exist_ok=True)

        if not src_dir.exists():
            counts[cls] = 0
            continue

        cls_count = 0
        for img_file in src_dir.iterdir():
            if img_file.suffix.lower() not in [".jpg", ".jpeg", ".png"]:
                continue
            try:
                img = cv2.imread(str(img_file), cv2.IMREAD_GRAYSCALE)
                if img is None:
                    continue

                img = cv2.resize(img, (512, 512))

                # CLAHE — same as dataset preparation notebook
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                img = clahe.apply(img)

                out_path = dst_dir / img_file.name
                cv2.imwrite(str(out_path), img)
                cls_count += 1
            except Exception as e:
                print(f"  Skipping {img_file.name}: {e}")

        counts[cls] = cls_count
        print(f"  Preprocessed {cls_count} images → {cls}")

    return counts


def build_tf_dataset(
    data_dir: str,
    validation_split: float = 0.15,
    batch_size: int = 32,
) -> Tuple[tf.data.Dataset, tf.data.Dataset, np.ndarray]:
    """
    Build TF datasets from a directory with class subfolders.
    Returns (train_ds, val_ds, class_weights_array).
    """
    all_paths, all_labels = [], []

    for idx, cls in enumerate(CLASSES):
        cls_dir = Path(data_dir) / cls
        if not cls_dir.exists():
            print(f"   Skipping missing class folder: {cls}")
            continue
        files = list(cls_dir.glob("*.png")) + list(cls_dir.glob("*.jpg")) + list(cls_dir.glob("*.jpeg"))
        all_paths.extend([str(p) for p in files])
        all_labels.extend([idx] * len(files))
        print(f"  {cls}: {len(files)} images")

    all_paths  = np.array(all_paths)
    all_labels = np.array(all_labels)

    # Stratified split
    from sklearn.model_selection import train_test_split
    from sklearn.utils.class_weight import compute_class_weight
    X_train, X_val, y_train, y_val = train_test_split(
        all_paths, all_labels,
        test_size=validation_split,
        random_state=SEED,
        stratify=all_labels,
    )

    # Class weights
    weights_array = compute_class_weight("balanced", classes=np.unique(y_train), y=y_train)
    class_weights = {i: weights_array[i] for i in range(len(weights_array))}

    def _load_and_preprocess(path, label, training=False):
        img = tf.io.read_file(path)
        img = tf.image.decode_image(img, channels=3, expand_animations=False)
        img = img[10:-10, 10:-10, :]
        img = tf.image.resize(img, [IMG_SIZE, IMG_SIZE])
        img = tf.cast(img, tf.float32)
        if training:
            img = tf.image.random_flip_left_right(img)
            img = tf.image.random_brightness(img, 0.05)
        img = tf.image.per_image_standardization(img)
        return img, tf.one_hot(label, depth=len(CLASSES))

    def _make_ds(X, y, training=False):
        ds = tf.data.Dataset.from_tensor_slices((X, y))
        if training:
            ds = ds.shuffle(len(X), seed=SEED)
        ds = ds.map(
            lambda x, y: _load_and_preprocess(x, y, training),
            num_parallel_calls=tf.data.AUTOTUNE,
        )
        return ds.cache().batch(batch_size).prefetch(tf.data.AUTOTUNE)

    return _make_ds(X_train, y_train, training=True), _make_ds(X_val, y_val), class_weights