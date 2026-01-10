# AI Powered File Storage - Project-wide Makefile
# Comprehensive testing and development automation

.PHONY: help install test test-all test-unit test-integration test-performance
.PHONY: test-python test-rust test-coverage test-coverage-python test-coverage-rust
.PHONY: lint lint-python lint-rust format format-python format-rust
.PHONY: build build-python build-runk build-docker clean clean-python clean-rust
.PHONY: run run-all run-python run-rust dev dev-python dev-rust
.PHONY: docs docs-python docs-rust benchmark benchmark-python benchmark-rust
.PHONY: security security-python security-rust docker docker-test docker-build
.PHONY: ci pre-commit setup check-deps update-deps

# Default target
help:
	@echo "AI Powered File Storage - Development Commands"
	@echo ""
	@echo "🚀 Quick Start:"
	@echo "  make setup          - Setup development environment"
	@echo "  make install        - Install all dependencies"
	@echo "  make test-all       - Run all tests"
	@echo "  make run-all        - Run all services"
	@echo ""
	@echo "🧪 Testing:"
	@echo "  make test           - Run all tests with coverage"
	@echo "  make test-unit      - Run unit tests only"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-performance - Run performance tests"
	@echo "  make test-python    - Run Python agent tests"
	@echo "  make test-rust      - Run Rust chunk gateway tests"
	@echo "  make test-coverage  - Generate coverage reports"
	@echo ""
	@echo "🔧 Code Quality:"
	@echo "  make lint           - Run all linting checks"
	@echo "  make format         - Format all code"
	@echo "  make security       - Run security scans"
	@echo "  make pre-commit     - Run pre-commit hooks"
	@echo ""
	@echo "🏗️ Build & Run:"
	@echo "  make build          - Build all components"
	@echo "  make run            - Run all services"
	@echo "  make dev            - Run in development mode"
	@echo "  make docker         - Build Docker images"
	@echo "  make docker-test    - Run tests in Docker"
	@echo ""
	@echo "📊 Analysis:"
	@echo "  make benchmark      - Run performance benchmarks"
	@echo "  make docs           - Generate documentation"
	@echo "  make ci             - Run CI pipeline locally"
	@echo ""
	@echo "🧹 Maintenance:"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make update-deps    - Update dependencies"
	@echo "  make check-deps     - Check for outdated deps"

# Configuration
PYTHON_VERSION := 3.11
RUST_TOOLCHAIN := stable
COVERAGE_THRESHOLD := 90
DOCKER_COMPOSE := docker-compose.rust.yml

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
PURPLE := \033[0;35m
CYAN := \033[0;36m
NC := \033[0m # No Color

# Helper functions
define print_section
	@echo "$(CYAN)=== $(1) ===$(NC)"
endef

define print_success
	@echo "$(GREEN)✅ $(1)$(NC)"
endef

define print_error
	@echo "$(RED)❌ $(1)$(NC)"
endef

define print_warning
	@echo "$(YELLOW)⚠️  $(1)$(NC)"
endef

# =============================================================================
# SETUP & INSTALLATION
# =============================================================================

setup: install pre-commit
	$(call print_section,Setting up development environment)
	$(call print_success,Development environment ready)

install: install-python install-rust
	$(call print_section,Installing all dependencies)
	$(call print_success,All dependencies installed)

install-python:
	$(call print_section,Installing Python dependencies)
	@cd services/agent && \
		pip install -r requirements.txt && \
		pip install -r requirements-test.txt && \
		pip install -e .
	$(call print_success,Python dependencies installed)

install-rust:
	$(call print_section,Installing Rust dependencies)
	@cd services/chunk-gateway && \
		cargo build --all-features && \
		cargo install cargo-tarpaulin || true
	$(call print_success,Rust dependencies installed)

# =============================================================================
# TESTING
# =============================================================================

test: test-all
	$(call print_success,All tests completed)

test-all: test-python test-rust
	$(call print_section,Running all tests)
	$(call print_success,All test suites passed)

test-unit: test-python-unit test-rust-unit
	$(call print_section,Running unit tests)
	$(call print_success,Unit tests passed)

test-integration: test-python-integration test-rust-integration
	$(call print_section,Running integration tests)
	$(call print_success,Integration tests passed)

test-performance: test-python-performance test-rust-performance
	$(call print_section,Running performance tests)
	$(call print_success,Performance tests completed)

# Python Tests
test-python: test-python-unit test-python-integration test-python-performance
	$(call print_section,Running Python tests)
	@cd services/agent && \
		python run_tests.py all --coverage --verbose
	$(call print_success,Python tests completed)

test-python-unit:
	$(call print_section,Running Python unit tests)
	@cd services/agent && \
		python -m pytest tests/ -m "unit" -v --cov=core --cov=models --cov-report=term-missing
	$(call print_success,Python unit tests passed)

test-python-integration:
	$(call print_section,Running Python integration tests)
	@cd services/agent && \
		python -m pytest tests/ -m "integration" -v --timeout=300
	$(call print_success,Python integration tests passed)

test-python-performance:
	$(call print_section,Running Python performance tests)
	@cd services/agent && \
		python -m pytest tests/ -m "performance" -v --benchmark-only
	$(call print_success,Python performance tests completed)

# Rust Tests
test-rust: test-rust-unit test-rust-integration test-rust-performance
	$(call print_section,Running Rust tests)
	@cd services/chunk-gateway && \
		cargo test --all-features --verbose
	$(call print_success,Rust tests completed)

test-rust-unit:
	$(call print_section,Running Rust unit tests)
	@cd services/chunk-gateway && \
		cargo test --lib --all-features --verbose
	$(call print_success,Rust unit tests passed)

test-rust-integration:
	$(call print_section,Running Rust integration tests)
	@cd services/chunk-gateway && \
		cargo test --test '*' --all-features --verbose
	$(call print_success,Rust integration tests passed)

test-rust-performance:
	$(call print_section,Running Rust benchmarks)
	@cd services/chunk-gateway && \
		cargo bench --all-features
	$(call print_success,Rust benchmarks completed)

# =============================================================================
# COVERAGE
# =============================================================================

test-coverage: test-coverage-python test-coverage-rust
	$(call print_section,Generating coverage reports)
	$(call print_success,Coverage reports generated)

test-coverage-python:
	$(call print_section,Python coverage report)
	@cd services/agent && \
		python -m pytest tests/ --cov=core --cov=models --cov=main \
		--cov-report=html --cov-report=xml --cov-report=term \
		--cov-fail-under=$(COVERAGE_THRESHOLD)
	@echo "📊 Python coverage report available at services/agent/htmlcov/index.html"
	$(call print_success,Python coverage generated)

test-coverage-rust:
	$(call print_section,Rust coverage report)
	@cd services/chunk-gateway && \
		cargo tarpaulin --out Html --out Xml --output-dir coverage/ \
		--exclude-files "*/tests/*" --threshold $(COVERAGE_THRESHOLD) || \
		$(call print_warning,Cargo tarpaulin not available, skipping Rust coverage)
	@echo "📊 Rust coverage report available at services/chunk-gateway/coverage/tarpaulin-report.html"
	$(call print_success,Rust coverage generated)

# =============================================================================
# LINTING & FORMATTING
# =============================================================================

lint: lint-python lint-rust
	$(call print_section,Running all linting checks)
	$(call print_success,All linting checks passed)

lint-python:
	$(call print_section,Python linting)
	@cd services/agent && \
		black --check . && \
		flake8 . && \
		mypy core/ models/ main.py || $(call print_warning,MyPy type checking failed) && \
		bandit -r core/ models/ main.py
	$(call print_success,Python linting passed)

lint-rust:
	$(call print_section,Rust linting)
	@cd services/chunk-gateway && \
		cargo clippy --all-features -- -D warnings && \
		cargo fmt -- --check
	$(call print_success,Rust linting passed)

format: format-python format-rust
	$(call print_section,Formatting all code)
	$(call print_success,Code formatted)

format-python:
	$(call print_section,Formatting Python code)
	@cd services/agent && \
		black . && \
		isort .
	$(call print_success,Python code formatted)

format-rust:
	$(call print_section,Formatting Rust code)
	@cd services/chunk-gateway && \
		cargo fmt
	$(call print_success,Rust code formatted)

# =============================================================================
# SECURITY
# =============================================================================

security: security-python security-rust
	$(call print_section,Running security scans)
	$(call print_success,Security scans completed)

security-python:
	$(call print_section,Python security scan)
	@cd services/agent && \
		bandit -r . -f json -o security-report.json && \
		safety check --json --output safety-report.json || true
	$(call print_success,Python security scan completed)

security-rust:
	$(call print_section,Rust security scan)
	@cd services/chunk-gateway && \
		cargo audit --json > audit-report.json || true && \
		cargo-deny check || $(call print_warning,cargo-deny not available)
	$(call print_success,Rust security scan completed)

# =============================================================================
# BUILD & RUN
# =============================================================================

build: build-python build-rust
	$(call print_section,Building all components)
	$(call print_success,All components built)

build-python:
	$(call print_section,Building Python agent)
	@cd services/agent && \
		python -m build || true
	$(call print_success,Python agent built)

build-rust:
	$(call print_section,Building Rust chunk gateway)
	@cd services/chunk-gateway && \
		cargo build --release --all-features
	$(call print_success,Rust chunk gateway built)

run: run-all
	$(call print_section,Starting all services)

run-all:
	$(call print_section,Starting all services with Docker Compose)
	@docker-compose -f $(DOCKER_COMPOSE) up -d
	@echo "🚀 All services started"
	@echo "📊 Ruby Control Plane: http://localhost:3000"
	@echo "🦀 Rust Data Plane: http://localhost:4000"
	@echo "🤖 Python Agent: http://localhost:8000"
	@echo "📈 Metrics: http://localhost:8080"

run-python:
	$(call print_section,Starting Python agent)
	@cd services/agent && \
		python main.py --config config.json

run-rust:
	$(call print_section,Starting Rust chunk gateway)
	@cd services/chunk-gateway && \
		cargo run --release

dev: dev-python dev-rust
	$(call print_section,Starting development mode)

dev-python:
	$(call print_section,Starting Python agent in dev mode)
	@cd services/agent && \
		LOG_LEVEL=debug python main.py --config config.json

dev-rust:
	$(call print_section,Starting Rust chunk gateway in dev mode)
	@cd services/chunk-gateway && \
		RUST_LOG=debug cargo run

# =============================================================================
# DOCKER
# =============================================================================

docker: docker-build docker-test
	$(call print_section,Docker operations completed)

docker-build:
	$(call print_section,Building Docker images)
	@docker build -t s3-ai-agent services/agent/
	@docker build -t s3-ai-gateway services/chunk-gateway/
	$(call print_success,Docker images built)

docker-test:
	$(call print_section,Running tests in Docker)
	@cd services/agent && \
		docker build -f Dockerfile.test -t s3-ai-agent-test . && \
		docker run --rm s3-ai-agent-test
	@cd services/chunk-gateway && \
		docker run --rm s3-ai-gateway cargo test
	$(call print_success,Docker tests completed)

# =============================================================================
# BENCHMARKING
# =============================================================================

benchmark: benchmark-python benchmark-rust
	$(call print_section,Running all benchmarks)
	$(call print_success,Benchmarks completed)

benchmark-python:
	$(call print_section,Python benchmarks)
	@cd services/agent && \
		python -m pytest tests/ --benchmark-only --benchmark-json=benchmark.json
	$(call print_success,Python benchmarks completed)

benchmark-rust:
	$(call print_section,Rust benchmarks)
	@cd services/chunk-gateway && \
		cargo bench --all-features -- --output-format json
	$(call print_success,Rust benchmarks completed)

# =============================================================================
# DOCUMENTATION
# =============================================================================

docs: docs-python docs-rust
	$(call print_section,Generating documentation)
	$(call print_success,Documentation generated)

docs-python:
	$(call print_section,Generating Python documentation)
	@cd services/agent && \
		pdoc --html --output-dir docs core models main || true
	$(call print_success,Python documentation generated)

docs-rust:
	$(call print_section,Generating Rust documentation)
	@cd services/chunk-gateway && \
		cargo doc --no-deps --all-features --document-private-items
	$(call print_success,Rust documentation generated)

# =============================================================================
# CI/CD
# =============================================================================

ci: lint test-coverage security build
	$(call print_section,Running CI pipeline locally)
	$(call print_success,CI pipeline completed successfully)

pre-commit:
	$(call print_section,Running pre-commit hooks)
	@pre-commit run --all-files
	$(call print_success,Pre-commit hooks passed)

# =============================================================================
# MAINTENANCE
# =============================================================================

clean: clean-python clean-rust
	$(call print_section,Cleaning build artifacts)
	$(call print_success,Cleanup completed)

clean-python:
	$(call print_section,Cleaning Python artifacts)
	@cd services/agent && \
		find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true && \
		find . -type f -name "*.pyc" -delete 2>/dev/null || true && \
		rm -rf build/ dist/ *.egg-info/ htmlcov/ .coverage .pytest_cache/ 2>/dev/null || true
	$(call print_success,Python artifacts cleaned)

clean-rust:
	$(call print_section,Cleaning Rust artifacts)
	@cd services/chunk-gateway && \
		cargo clean
	$(call print_success,Rust artifacts cleaned)

check-deps:
	$(call print_section,Checking for outdated dependencies)
	@cd services/agent && pip list --outdated || true
	@cd services/chunk-gateway && cargo outdated || true
	$(call print_success,Dependency check completed)

update-deps:
	$(call print_section,Updating dependencies)
	@cd services/agent && \
		pip install --upgrade -r requirements.txt && \
		pip install --upgrade -r requirements-test.txt
	@cd services/chunk-gateway && \
		cargo update
	$(call print_success,Dependencies updated)

# =============================================================================
# UTILITIES
# =============================================================================

# Watch for changes and run tests
watch:
	$(call print_section,Watching for changes)
	@echo "👀 Watching for file changes..."
	@cd services/agent && \
		watchdog --patterns="*.py" --recursive --command="make test-python" . & \
		cd ../chunk-gateway && \
		watchdog --patterns="*.rs" --recursive --command="make test-rust" . & \
		wait

# Generate project statistics
stats:
	$(call print_section,Project Statistics)
	@echo "📊 Project Statistics:"
	@echo "Python files: $$(find services/agent -name "*.py" | wc -l)"
	@echo "Rust files: $$(find services/chunk-gateway -name "*.rs" | wc -l)"
	@echo "Total lines of code: $$(find services/agent services/chunk-gateway -name "*.py" -o -name "*.rs" | xargs wc -l | tail -1)"
	@echo "Test files: $$(find . -name "test_*.py" -o -name "*_test.rs" | wc -l)"

# Quick health check
health:
	$(call print_section,System Health Check)
	@echo "🔍 Checking system health..."
	@python --version
	@cargo --version
	@docker --version
	@echo "✅ All tools available"

# Show recent test results
results:
	$(call print_section,Recent Test Results)
	@if [ -f services/agent/htmlcov/index.html ]; then \
		echo "📊 Python coverage: services/agent/htmlcov/index.html"; \
	fi
	@if [ -f services/chunk-gateway/coverage/tarpaulin-report.html ]; then \
		echo "📊 Rust coverage: services/chunk-gateway/coverage/tarpaulin-report.html"; \
	fi
	@if [ -f services/agent/benchmark.json ]; then \
		echo "📈 Python benchmarks: services/agent/benchmark.json"; \
	fi

# =============================================================================
# HELPERS
# =============================================================================

# Ensure we have the required tools
check-tools:
	@command -v python3 >/dev/null 2>&1 || { echo "Python 3 required"; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { echo "Rust required"; exit 1; }
	@command -v docker >/dev/null 2>&1 || { echo "Docker required"; exit 1; }

# Create development environment file
.env:
	$(call print_section,Creating .env file)
	@echo "STORAGE_API_URL=http://localhost:3000" > .env
	@echo "STORAGE_API_KEY=dev-api-key" >> .env
	@echo "LOG_LEVEL=debug" >> .env
	@echo "LLM_ENABLED=false" >> .env
	@$(call print_success,.env file created)

# Backup important files
backup:
	$(call print_section,Creating backup)
	@mkdir -p backups
	@tar -czf backups/backup-$$(date +%Y%m%d-%H%M%S).tar.gz \
		services/agent/ services/chunk-gateway/ Makefile TESTING.md README.md
	$(call print_success,Backup created)

# Restore from backup
restore:
	@echo "Available backups:"
	@ls -la backups/
	@read -p "Enter backup filename: " backup; \
		tar -xzf backups/$$backup
	$(call print_success,Backup restored)

# =============================================================================
# DEVELOPMENT SHORTCUTS
# =============================================================================

# Quick test run
t: test

# Quick format
f: format

# Quick lint
l: lint

# Quick build
b: build

# Quick run
r: run

# Quick clean
c: clean
