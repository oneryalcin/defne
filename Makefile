PORT ?= 3000

.PHONY: help install db dev start test test-watch typecheck build ci verify clean

help:
	@echo "Defne local commands"
	@echo ""
	@echo "  make install       Install npm dependencies"
	@echo "  make db            Run SQLite migrations and seed data"
	@echo "  make dev           Set up DB and run Next dev server on PORT=$(PORT)"
	@echo "  make start         Run built Next app on PORT=$(PORT)"
	@echo "  make test          Run unit tests"
	@echo "  make test-watch    Run unit tests in watch mode"
	@echo "  make typecheck     Run TypeScript checks"
	@echo "  make build         Build production app"
	@echo "  make verify        Run test, typecheck, and build"
	@echo "  make clean         Remove local build/cache output"
	@echo ""
	@echo "Examples:"
	@echo "  make dev"
	@echo "  make dev PORT=3001"

install:
	npm install

db:
	npm run db:setup

dev: db
	npm run dev -- --port $(PORT)

start:
	npm run start -- --port $(PORT)

test:
	npm run test

test-watch:
	npm run test:watch

typecheck:
	npm run typecheck

build:
	npm run build

verify: test typecheck build

ci: verify

clean:
	rm -rf .next coverage dist
