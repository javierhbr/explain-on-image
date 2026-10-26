APP_NAME    := ExplainOnImage
APP_DIR     := app
DIST_APP    := dist/$(APP_NAME)-darwin-arm64/$(APP_NAME).app
INSTALL_DIR ?= /Applications

.DEFAULT_GOAL := help
.PHONY: help deps start test test-regressions test-desktop test-all build install uninstall open clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

$(APP_DIR)/node_modules: $(APP_DIR)/package-lock.json
	cd $(APP_DIR) && npm ci
	@touch $@

deps: $(APP_DIR)/node_modules ## Install pinned dependencies (npm ci)

start: deps ## Run the app from source
	cd $(APP_DIR) && npm start

test: deps ## Run unit tests
	cd $(APP_DIR) && npm test

test-regressions: deps ## Run rendering regression tests
	cd $(APP_DIR) && npm run test:regressions

test-desktop: deps ## Run end-to-end desktop tests (takes over mouse/keyboard)
	cd $(APP_DIR) && npm run test:desktop

test-all: test test-regressions ## Run unit + regression tests

build: deps ## Package macOS (arm64) and Windows (x64) builds into dist/
	cd $(APP_DIR) && npm run package

install: build ## Build and install the macOS app into $(INSTALL_DIR)
	rm -rf "$(INSTALL_DIR)/$(APP_NAME).app"
	ditto "$(DIST_APP)" "$(INSTALL_DIR)/$(APP_NAME).app"
	@echo "Installed $(INSTALL_DIR)/$(APP_NAME).app"

uninstall: ## Remove the installed macOS app
	rm -rf "$(INSTALL_DIR)/$(APP_NAME).app"

open: ## Launch the installed app
	open "$(INSTALL_DIR)/$(APP_NAME).app"

clean: ## Remove build output and dependencies
	rm -rf dist/$(APP_NAME)-darwin-arm64 dist/$(APP_NAME)-win32-x64 $(APP_DIR)/node_modules
