.PHONY: all server ngrok client setup stop clean dev pretty tabs install-deps pull-secrets _pretty_tmux test test-server test-client

# Cross-platform bash. On Windows, bare `bash` resolves to Microsoft's WSL stub
# at C:\Windows\System32\bash.exe — which fails if no WSL distro is installed.
# Prefer Git Bash there. Override with `BASH=... make ...` if installed elsewhere.
ifeq ($(OS),Windows_NT)
  BASH ?= "C:/Program Files/Git/bin/bash.exe"
else
  BASH ?= bash
endif

# Default target - runs all services in separate terminals
all: tabs

# Install dependencies (uv for Python, pnpm for client, ngrok for tunneling)
install-deps:
	@echo "Checking for uv..."
	@command -v uv >/dev/null 2>&1 || (echo "Installing uv..." && curl -LsSf https://astral.sh/uv/install.sh | sh)
	@echo "Checking for ngrok..."
	@command -v ngrok >/dev/null 2>&1 || (echo "Installing ngrok via brew..." && brew install ngrok/ngrok/ngrok)
	@echo "Installing Python dependencies..."
	@cd server && uv sync --dev
	@echo "Installing client dependencies..."
	@command -v pnpm >/dev/null 2>&1 || corepack enable pnpm
	@cd client && pnpm install

# Pull runtime secrets from GCP Secret Manager into server/.env
# Requires `gcloud auth login` against an account with secretAccessor on the secrets.
# Override the project with GCP_PROJECT=... make pull-secrets.
pull-secrets:
	@$(BASH) server/scripts/pull-secrets.sh

# Setup environment — deps + secrets, ready to run
setup: install-deps pull-secrets
	@echo "Setup complete. Deps installed and server/.env populated from Secret Manager."

# Start the FastAPI server
server:
	@echo "Starting FastAPI server..."
	@cd server && uv run uvicorn main:app --reload

# Start ngrok tunnel
ngrok:
	@echo "Starting ngrok tunnel..."
	@ngrok http --url=conversational.ngrok.app 8000

# Start the Next.js client
client:
	@echo "Starting Next.js client..."
	@cd client && pnpm dev

# Stop all services (if needed)
stop:
	@echo "Stopping services..."
	@pkill -f "uvicorn main:app" || true
	@pkill -f "ngrok http" || true
	@pkill -f "pnpm dev" || true

deploy:
	@echo "Deploying to Cloud Run..."
	@cd server && uv run python -c "print('Deploying...')"
	@cd server && (command -v dos2unix >/dev/null 2>&1 && dos2unix deploy.sh || true)
	@cd server && $(BASH) deploy.sh

# Clean up processes
clean: stop
	@echo "Cleaned up all processes"

# Run all tests
test: test-server test-client

# Run backend tests
test-server:
	@echo "Running backend tests..."
	@cd server && uv run pytest tests/ -v --tb=short

# Run frontend checks (lint + typecheck + vitest, matching CI)
test-client:
	@echo "Running frontend checks..."
	@cd client && pnpm lint && pnpm typecheck && pnpm test

# Run services in separate terminal tabs (recommended for clean logs)
tabs: setup
	@echo "Opening services in Apple Terminal..."
	@osascript -e 'tell app "Terminal" to do script "cd $(CURDIR)/server && uv run uvicorn main:app --reload"'
	@osascript -e 'tell app "Terminal" to do script "cd $(CURDIR)/client && pnpm dev"'
	@osascript -e 'tell app "Terminal" to do script "cd $(CURDIR) && ngrok http --url=conversational.ngrok.app 8000"'

# Pretty side-by-side view of server and client logs
# Uses tmux if available
dev: pretty

pretty:
	@command -v tmux >/dev/null 2>&1 && $(MAKE) _pretty_tmux || (echo "tmux not found, running both in one terminal..." && (\
		(cd server && uv run uvicorn main:app --reload &) && \
		(cd client && pnpm dev)\
	))

_pretty_tmux:
	@echo "Launching side-by-side logs in tmux..."
	@tmux new-session -d -s portfoliov3 -c "$(CURDIR)/server" "uv run uvicorn main:app --reload"
	@tmux split-window -h -c "$(CURDIR)/client" "pnpm dev"
	@tmux split-window -h -c "$(CURDIR)" "ngrok http --url=conversational.ngrok.app 8000"
	@tmux select-layout even-horizontal
	@tmux set -g mouse on >/dev/null 2>&1 || true
	@tmux attach-session -t portfoliov3
