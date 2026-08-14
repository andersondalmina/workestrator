.PHONY: help install run check test lint lint-fix typecheck format format-check build package harness-score

help:
	@echo "Available targets:"
	@echo "  install       Install dependencies and git hooks"
	@echo "  run           Start the app in development mode"
	@echo "  check         Run every check CI runs (format, lint, typecheck, test)"
	@echo "  test          Run the test suite"
	@echo "  lint          Run the linter"
	@echo "  lint-fix      Run the linter and auto-fix issues"
	@echo "  typecheck     Type-check the project without emitting"
	@echo "  format        Format the codebase with Prettier"
	@echo "  format-check  Check formatting without writing changes"
	@echo "  build         Make distributable packages"
	@echo "  package       Package the app without making distributables"
	@echo "  harness-score Score the repo's agent harness maturity"

install:
	npm ci

run:
	npm start

check:
	npm run check

test:
	npm test

lint:
	npm run lint

lint-fix:
	npm run lint:fix

typecheck:
	npm run typecheck

format:
	npm run format

format-check:
	npm run format:check

build:
	npm run make

package:
	npm run package

harness-score:
	npx harness-score
