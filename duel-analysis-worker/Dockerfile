FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

RUN apt-get update \
    && apt-get install --no-install-recommends -y ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py local_poller.py batch_scan.py cv_duel_candidates.py .
RUN python -c "from ultralytics import YOLO; YOLO('yolo26n.pt')"

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
