.PHONY: dev setup lint lint-fix build clean help

CLIENT_BIN := client/node_modules/.bin

help:
	@echo "Tunefall — available targets:"
	@echo ""
	@echo "  make setup     Install all dependencies (client + server)"
	@echo "  make dev       Run client and server concurrently"
	@echo "  make lint      Check client for lint errors"
	@echo "  make lint-fix  Auto-fix fixable lint errors"
	@echo "  make build     Build client for production"
	@echo "  make clean     Remove node_modules from client and server"

setup:
	npm install --prefix client
	npm install --prefix server
	@echo ""
	@echo "Setup complete. Run 'make dev' to start."

dev:
	@echo "Starting Tunefall (client + server)..."
	@npx concurrently \
		--names "client,server" \
		--prefix-colors "cyan,green" \
		"npm run dev --prefix client" \
		"npm run start --prefix server"

lint:
	$(CLIENT_BIN)/eslint client/src

lint-fix:
	$(CLIENT_BIN)/eslint client/src --fix

build:
	$(CLIENT_BIN)/vite build --config client/vite.config.js

clean:
	rm -rf client/node_modules server/node_modules
	@echo "Cleaned node_modules."
