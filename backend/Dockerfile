FROM python:3.11-slim

# Install system dependencies for opencv and tensorflow
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir \
    numpy==1.26.4 \
    && pip install --no-cache-dir -r requirements.txt

# Copy all backend code
COPY . .

# Download model from Hugging Face at build time
# This way model is baked into the image — no download on startup
RUN python3 -c "\
import urllib.request, os; \
os.makedirs('models', exist_ok=True); \
print('Downloading model...'); \
urllib.request.urlretrieve(\
  'https://huggingface.co/leslylezoo/ubuzima-model/resolve/main/ubuzima_model_production.keras',\
  'models/ubuzima_model_production.keras'\
); \
size = os.path.getsize('models/ubuzima_model_production.keras')/1024/1024; \
print(f'Model downloaded: {size:.1f} MB')\
"

# HF Spaces uses port 7860
EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
