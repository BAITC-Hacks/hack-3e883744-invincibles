FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app \
    DATABASE_PATH=/app/runtime/shagra.sqlite3 KIT_PATH=/app/data/synthetic \
    SESSION_SECRET_PATH=/app/runtime/session-secret FRONTEND_DIST=/app/frontend/dist
WORKDIR /app
COPY backend/requirements.lock /app/backend/requirements.lock
RUN pip install --no-cache-dir -r /app/backend/requirements.lock
COPY backend/ /app/backend/
COPY data/synthetic/ /app/data/synthetic/
COPY --from=frontend-build /build/frontend/dist/ /app/frontend/dist/
RUN groupadd --system shagra && useradd --system --gid shagra --home /app shagra \
    && mkdir -p /app/runtime && chown -R shagra:shagra /app/runtime
USER shagra
EXPOSE 8080
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
