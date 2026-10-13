# =============================================================================
# SynapseHealth — Backend API Gateway Container
# Production-grade multi-stage container with OCR, PDF extraction, and PostgreSQL support
# =============================================================================

FROM python:3.10-slim-bullseye AS base

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install native OS dependencies for OCR, PDF rendering, and PostgreSQL
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libmagic1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Create application user and runtime storage directories
RUN useradd -m -u 1001 -s /bin/bash synapse \
    && mkdir -p /app/data/uploads \
    && chown -R synapse:synapse /app

# Copy application source code
COPY --chown=synapse:synapse app/ /app/app/
COPY --chown=synapse:synapse src/ /app/src/
COPY --chown=synapse:synapse scripts/ /app/scripts/

# Switch to unprivileged runtime user
USER synapse

# Expose FastAPI HTTP gateway port
EXPOSE 8000

# Health check probe against API health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Production application server execution
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
