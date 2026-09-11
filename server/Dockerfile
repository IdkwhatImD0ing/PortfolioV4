# Dockerfile
#
# Two stages, so the image Cloud Run pulls on every cold start holds only
# Python, the locked runtime dependencies, and the app code. The old single
# stage installed requirements.txt, which pins ~30 packages the server never
# imports (jupyter, opencv, pygame, pyaudio, twilio, ...) plus the C toolchain
# pyaudio needed to build.

# ---- build: install exactly what uv.lock pins, minus dev dependencies ----
FROM python:3.11-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.10.4 /uv /usr/local/bin/uv
# UV_COMPILE_BYTECODE: write .pyc files now, not on every cold start.
# UV_PYTHON_DOWNLOADS=0: build the venv on this image's own Python, which the
# runtime stage also has; a uv-managed Python would not be copied across.
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---- runtime ----
FROM python:3.11-slim
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
# .gcloudignore / .dockerignore keep a local .venv out of this copy; it would
# otherwise overwrite the one built above.
COPY . .

ENV PATH="/app/.venv/bin:$PATH" PORT=8080
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
