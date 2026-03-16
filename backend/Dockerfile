FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir numpy==1.26.4

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p models && \
    curl -L \
    "https://huggingface.co/leslylezoo/ubuzima-model/resolve/main/ubuzima_model_production.keras" \
    -o models/ubuzima_model_production.keras && \
    echo "Model size: $(du -sh models/ubuzima_model_production.keras)"

EXPOSE 7860
ENV PORT=7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]