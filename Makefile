.PHONY: dev run setup lint lint-fix build clean test help

CLIENT_BIN := client/node_modules/.bin
VENV_BIN   := $(HOME)/.local/share/downtune-venv/bin
# Prepend venv/bin to PATH when the setup-script venv is present; no-op otherwise.
VENV_PATH  := $(if $(wildcard $(VENV_BIN)/python3),$(VENV_BIN):$(PATH),$(PATH))

help:
	@echo "DownTune — available targets:"
	@echo ""
	@echo "  make setup     Install all dependencies (client + server)"
	@echo "  make dev       Run client and server concurrently (development)"
	@echo "  make run       Build client then run server in production mode"
	@echo "  make lint      Check client for lint errors"
	@echo "  make lint-fix  Auto-fix fixable lint errors"
	@echo "  make build     Build client for production"
	@echo "  make test      Run server test suite"
	@echo "  make clean     Remove node_modules from client and server"

setup:
	npm install
	npm install --prefix client
	npm install --prefix server
	@echo ""
	@echo "Setup complete. Run 'make dev' to start."

dev:
	@echo "Starting DownTune (development)..."
	@echo "Frontend → http://localhost:5173"
	@PATH="$(VENV_PATH)" npx concurrently \
		--names "client,server" \
		--prefix-colors "cyan,green" \
		"npm run dev --prefix client" \
		"NODE_ENV=development npm run start --prefix server"

run: build
	@echo "Starting DownTune (production)..."
	@echo "Open → http://localhost:3000"
	@PATH="$(VENV_PATH)" PORT=3000 node server/index.js

lint:
	$(CLIENT_BIN)/eslint client/src

lint-fix:
	$(CLIENT_BIN)/eslint client/src --fix

build:
	npm run build --prefix client

test:
	npm run test --prefix server

clean:
	rm -rf client/node_modules server/node_modules
	@echo "Cleaned node_modules."
