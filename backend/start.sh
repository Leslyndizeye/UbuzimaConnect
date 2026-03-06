#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="$SCRIPT_DIR/models"
MODEL_PATH="$MODEL_DIR/ubuzima_model_production.keras"

echo "Script dir: $SCRIPT_DIR"
echo "Model path: $MODEL_PATH"

if [ ! -f "$MODEL_PATH" ]; then
    echo "Downloading model from Hugging Face..."
    mkdir -p "$MODEL_DIR"
    curl -L \
      -H "Authorization: Bearer $HUGGINGFACE_TOKEN" \
      "$HUGGINGFACE_MODEL_URL" \
      -o "$MODEL_PATH"
    echo "Model downloaded!"
else
    echo "Model already present."
fi

uvicorn main:app --host 0.0.0.0 --port $PORT