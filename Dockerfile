# ── Stage 1: build React ──────────────────────────────────────────────────────
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --quiet
COPY frontend/ .
RUN npm run build

# ── Stage 2: Python backend ───────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn httpx

COPY main.py .
# Copy built React app into static/
COPY --from=frontend-build /frontend/dist ./static

RUN mkdir -p /data

EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
