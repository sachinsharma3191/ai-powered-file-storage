# Makefile for Rails testing and Docker build validation
# Usage: make test, make coverage, make docker-build

.PHONY: help test coverage docker-build docker-validate clean

# Default target
help:
	@echo "Available commands:"
	@echo "  test          - Run quick tests"
	@echo "  coverage      - Run tests with 100% coverage requirement"
	@echo "  docker-validate - Run Docker validation tests"
	@echo "  docker-build  - Build Docker image with test validation"
	@echo "  clean         - Clean test artifacts and coverage"

# Run quick tests
test:
	@echo "🚀 Running quick tests..."
	rake test:quick

# Run tests with 100% coverage
coverage:
	@echo "📊 Running tests with 100% coverage requirement..."
	rake coverage:run

# Run Docker validation tests
docker-validate:
	@echo "🐳 Running Docker validation tests..."
	rake docker_validate

# Build Docker with test validation (fails if tests fail)
docker-build:
	@echo "🏗️  Building Docker image with test validation..."
	@echo "This will FAIL if tests don't pass or coverage < 100%"
	docker build -f Dockerfile.test -t storage-control-plane:test .
	@echo "✅ Docker build succeeded with passing tests!"

# Build production Docker (only if tests pass)
docker-prod: docker-validate
	@echo "🏭 Building production Docker image..."
	docker build -f Dockerfile -t storage-control-plane:latest .
	@echo "✅ Production Docker build completed!"

# Clean test artifacts
clean:
	@echo "🧹 Cleaning test artifacts..."
	rm -rf coverage/
	rm -rf test-results/
	rm -f coverage/.last_run.json
	rm -f coverage/.resultset.json
	@echo "✅ Clean completed!"

# Install dependencies
setup:
	@echo "📦 Installing dependencies..."
	bundle install
	bundle exec rails db:create db:migrate RAILS_ENV=test
	@echo "✅ Setup completed!"

# Full CI pipeline
ci: setup coverage docker-validate
	@echo "🎉 CI pipeline completed successfully!"

# Development workflow
dev: test
	@echo "🔧 Development tests passed!"
	@echo "Run 'make docker-build' to test before Docker build"

# Check coverage without running tests
coverage-check:
	@echo "🔍 Checking current coverage..."
	rake coverage:check

# Generate coverage report
coverage-report:
	@echo "📈 Generating coverage report..."
	rake coverage:report
	@echo "📊 Report available at: coverage/coverage.html"
