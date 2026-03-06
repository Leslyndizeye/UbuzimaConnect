"""
Run this ONCE to fix the model.
Place in ubuzima-backend/ and run: python load_model_fix.py
"""
import os
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import tensorflow as tf
import numpy as np
import h5py
import warnings
warnings.filterwarnings('ignore')

MODEL_PATH = r'models/ubuzima_model_production.h5'
OUTPUT_PATH = r'models/ubuzima_model_fixed.keras'

print("Rebuilding model architecture...")

base = tf.keras.applications.ResNet50(
    include_top=False,
    weights=None,
    input_shape=(224, 224, 3),
    pooling=None,
)

model = tf.keras.Sequential([
    base,
    tf.keras.layers.GlobalAveragePooling2D(name='global_average_pooling2d_2'),
    tf.keras.layers.Dense(512, activation='relu', name='dense_4'),
    tf.keras.layers.BatchNormalization(name='batch_normalization_2'),
    tf.keras.layers.Dropout(0.5, name='dropout_2'),
    tf.keras.layers.Dense(3, activation='softmax', name='dense_5'),
], name='sequential_2')

model.build((None, 224, 224, 3))
print(f"Model built. Total layers: {len(model.layers)}")

# Load weights directly by reading h5 structure properly
with h5py.File(MODEL_PATH, 'r') as f:
    wg = f['model_weights']
    
    # ── ResNet50 sub-layers ──────────────────────────────────────
    resnet_group = wg['resnet50']
    resnet_layer = model.layers[0]  # the ResNet50 base
    
    resnet_loaded = 0
    for sublayer in resnet_layer.layers:
        sname = sublayer.name
        if sname not in resnet_group:
            continue
        grp = resnet_group[sname]
        weight_keys = list(grp.keys())
        if not weight_keys:
            continue
        try:
            # weights stored directly under layer name
            w_arrays = [grp[k][:] for k in sorted(weight_keys)]
            sublayer.set_weights(w_arrays)
            resnet_loaded += 1
        except Exception as e:
            pass
    print(f"ResNet50 sublayers loaded: {resnet_loaded}")

    # ── Dense 4 (kernel + bias) ──────────────────────────────────
    # Path: model_weights/dense_4/sequential_2/dense_4/{kernel, bias}
    d4_grp = wg['dense_4']['sequential_2']['dense_4']
    kernel4 = d4_grp['kernel'][:]
    bias4   = d4_grp['bias'][:]
    print(f"dense_4 kernel: {kernel4.shape}, bias: {bias4.shape}")
    model.get_layer('dense_4').set_weights([kernel4, bias4])
    print("dense_4 loaded OK")

    # ── BatchNorm ────────────────────────────────────────────────
    bn_grp = wg['batch_normalization_2']['sequential_2']['batch_normalization_2']
    gamma = bn_grp['gamma'][:]
    beta  = bn_grp['beta'][:]
    mean  = bn_grp['moving_mean'][:]
    var   = bn_grp['moving_variance'][:]
    model.get_layer('batch_normalization_2').set_weights([gamma, beta, mean, var])
    print("batch_normalization_2 loaded OK")

    # ── Dense 5 (kernel + bias) ──────────────────────────────────
    d5_grp = wg['dense_5']['sequential_2']['dense_5']
    kernel5 = d5_grp['kernel'][:]
    bias5   = d5_grp['bias'][:]
    print(f"dense_5 kernel: {kernel5.shape}, bias: {bias5.shape}")
    model.get_layer('dense_5').set_weights([kernel5, bias5])
    print("dense_5 loaded OK")

# ── Test with blank image ────────────────────────────────────────
dummy = np.zeros((1, 224, 224, 3), dtype=np.float32)
out = model.predict(dummy, verbose=0)
print(f"\nBlank image → Normal={out[0][0]:.4f}, Pneumonia={out[0][1]:.4f}, TB={out[0][2]:.4f}")

# ── Test with random noise (should vary) ────────────────────────
noise = np.random.rand(1, 224, 224, 3).astype(np.float32)
out2 = model.predict(noise, verbose=0)
print(f"Noise image  → Normal={out2[0][0]:.4f}, Pneumonia={out2[0][1]:.4f}, TB={out2[0][2]:.4f}")

print(f"\nSaving to {OUTPUT_PATH}...")
model.save(OUTPUT_PATH)
print("SUCCESS! Update prediction.py to use: ubuzima_model_fixed.keras")