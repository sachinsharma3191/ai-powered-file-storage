# MCP Server Test Suite

Comprehensive test suite for the AI-Powered File Storage MCP Server.

## 📋 Test Coverage

### Test Categories

- **Unit Tests**: Fast, isolated tests for individual components
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Load testing and benchmarking
- **Stress Tests**: High-concurrency and error handling tests

### Test Files

- `test_storage_client.py` - Tests for StorageClient class
- `test_mcp_server.py` - Tests for MCP server handlers and tools
- `test_integration.py` - Integration tests for complete workflows
- `test_performance.py` - Performance and stress tests

## 🚀 Quick Start

### Install Dependencies

```bash
# Install test dependencies
pip install -r requirements-test.txt
```

### Run All Tests

```bash
# Run all unit and integration tests
python run_tests.py all

# Run with coverage
python run_tests.py all --coverage

# Run with verbose output
python run_tests.py all --verbose
```

### Run Specific Test Types

```bash
# Run only unit tests
python run_tests.py unit

# Run integration tests
python run_tests.py integration

# Run performance tests
python run_tests.py performance

# Run storage client tests only
python run_tests.py storage_client

# Run MCP server tests only
python run_tests.py mcp_server
```

### Run with Pytest Directly

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=main --cov-report=html

# Run specific test file
pytest tests/test_storage_client.py -v

# Run with markers
pytest tests/ -m "unit" -v
pytest tests/ -m "integration" -v
pytest tests/ -m "performance" -v
```

## 📊 Test Markers

- `@pytest.mark.unit` - Unit tests (fast, no external dependencies)
- `@pytest.mark.integration` - Integration tests (requires external services)
- `@pytest.mark.slow` - Slow running tests (performance, load tests)
- `@pytest.mark.storage_client` - StorageClient specific tests
- `@pytest.mark.mcp_server` - MCP server specific tests
- `@pytest.mark.performance` - Performance tests
- `@pytest.mark.stress` - Stress tests

## 🔧 Test Configuration

### Environment Variables

Tests use mock environment variables, but you can override them:

```bash
export STORAGE_API_URL="http://test-api:3000"
export STORAGE_API_KEY="test-api-key-12345"
```

### Configuration Files

- `pytest.ini` - Pytest configuration
- `conftest.py` - Test fixtures and configuration

## 📈 Coverage Reports

Generate coverage reports to see test coverage:

```bash
# Generate HTML coverage report
python run_tests.py all --coverage

# View the report
open htmlcov/index.html
```

## 🧪 Test Examples

### Running Unit Tests

```bash
# Run all unit tests
pytest tests/ -m "unit" -v

# Run specific unit test
pytest tests/test_storage_client.py::TestStorageConfig::test_storage_config_creation -v
```

### Running Integration Tests

```bash
# Run all integration tests
pytest tests/ -m "integration" -v

# Run specific integration test
pytest tests/test_integration.py::TestMCPServerIntegration::test_full_bucket_workflow -v
```

### Running Performance Tests

```bash
# Run performance tests
pytest tests/ -m "performance" -v

# Run with benchmarks
pytest tests/ --benchmark-only
```

## 🐛 Debugging Tests

### Verbose Output

```bash
pytest tests/ -v -s --tb=short
```

### Debug Specific Tests

```bash
# Run with pdb on failure
pytest tests/ --pdb

# Stop on first failure
pytest tests/ -x
```

### Test Logging

Enable debug logging:

```bash
pytest tests/ --log-cli-level=DEBUG
```

## 📝 Writing New Tests

### Unit Test Template

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.unit
class TestNewFeature:
    """Test new feature"""
    
    @pytest.mark.asyncio
    async def test_new_functionality_success(self, mock_storage_client):
        """Test successful operation"""
        # Arrange
        # Act
        # Assert
        pass
    
    @pytest.mark.asyncio
    async def test_new_functionality_failure(self, mock_storage_client):
        """Test failure scenario"""
        # Arrange
        # Act
        # Assert
        pass
```

### Integration Test Template

```python
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.integration
@pytest.mark.slow
class TestNewIntegration:
    """Integration tests for new feature"""
    
    @pytest.mark.asyncio
    async def test_full_workflow(self, mock_environment_variables):
        """Test complete workflow"""
        # Test complete end-to-end scenario
        pass
```

## 🚨 Test Requirements

### Dependencies

- Python 3.8+
- pytest 7.4.0+
- pytest-asyncio 0.21.0+
- pytest-cov 4.1.0+
- pytest-xdist 3.3.0+
- pytest-mock 3.11.0+
- pytest-benchmark 4.0.0+

### System Requirements

- Memory: 4GB+ recommended for performance tests
- CPU: Multi-core recommended for parallel test execution

## 📋 Test Checklist

Before submitting code, ensure:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Coverage is above 90%
- [ ] Performance tests meet benchmarks
- [ ] Tests follow naming conventions
- [ ] Tests have proper documentation
- [ ] Error conditions are tested

## 🔗 Related Documentation

- [Main Project README](../README.md)
- [Testing Guide](../../TESTING.md)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [pytest Documentation](https://docs.pytest.org/)

## 🤝 Contributing

When adding new features:

1. Write unit tests for new functions
2. Write integration tests for new workflows
3. Update this README if adding new test categories
4. Ensure coverage remains high
5. Run performance tests for performance-critical code

## 📞 Support

For test-related issues:

1. Check the test output for error messages
2. Verify all dependencies are installed
3. Ensure environment variables are set correctly
4. Check the test logs for debugging information
