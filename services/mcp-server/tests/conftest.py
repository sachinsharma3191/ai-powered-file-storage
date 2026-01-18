"""
Test configuration and fixtures for MCP server tests
"""

import asyncio
import os
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock
from typing import Dict, Any, List

from main import StorageConfig, StorageClient


@pytest.fixture
def mock_storage_config():
    """Mock storage configuration for testing"""
    return StorageConfig(
        api_url="http://test-api:3000",
        api_key="test-api-key-12345",
        timeout=30
    )


@pytest.fixture
def mock_httpx_client():
    """Mock httpx AsyncClient for testing"""
    client = AsyncMock()
    return client


@pytest.fixture
async def mock_storage_client(mock_storage_config, mock_httpx_client):
    """Mock storage client with mocked httpx client"""
    # Patch the httpx.AsyncClient in the main module
    import main
    original_client = main.httpx.AsyncClient
    
    def mock_client_factory(*args, **kwargs):
        mock_httpx_client.base_url = mock_storage_config.api_url
        mock_httpx_client.timeout = mock_storage_config.timeout
        mock_httpx_client.headers = {"Authorization": f"Bearer {mock_storage_config.api_key}"}
        return mock_httpx_client
    
    main.httpx.AsyncClient = mock_client_factory
    
    client = StorageClient(mock_storage_config)
    yield client
    
    # Restore original client
    main.httpx.AsyncClient = original_client


@pytest.fixture
def sample_buckets():
    """Sample bucket data for testing"""
    return [
        {
            "name": "test-bucket-1",
            "region": "us-east-1",
            "created_at": "2024-01-01T00:00:00Z",
            "size": 1024
        },
        {
            "name": "test-bucket-2", 
            "region": "us-west-2",
            "created_at": "2024-01-02T00:00:00Z",
            "size": 2048
        }
    ]


@pytest.fixture
def sample_objects():
    """Sample object data for testing"""
    return [
        {
            "key": "folder1/file1.txt",
            "size": 100,
            "last_modified": "2024-01-01T00:00:00Z",
            "etag": "abc123"
        },
        {
            "key": "folder1/file2.txt",
            "size": 200,
            "last_modified": "2024-01-02T00:00:00Z",
            "etag": "def456"
        },
        {
            "key": "folder2/image.png",
            "size": 500,
            "last_modified": "2024-01-03T00:00:00Z",
            "etag": "ghi789"
        }
    ]


@pytest.fixture
def sample_object_metadata():
    """Sample object metadata for testing"""
    return {
        "content-type": "text/plain",
        "content-length": "100",
        "last-modified": "Wed, 01 Jan 2024 00:00:00 GMT",
        "etag": "abc123"
    }


@pytest.fixture
def mock_environment_variables(monkeypatch):
    """Set up mock environment variables"""
    monkeypatch.setenv("STORAGE_API_URL", "http://test-api:3000")
    monkeypatch.setenv("STORAGE_API_KEY", "test-api-key-12345")


@pytest.fixture
def successful_api_response():
    """Mock successful API response"""
    response = MagicMock()
    response.status_code = 200
    response.raise_for_status = MagicMock()
    return response


@pytest.fixture
def error_api_response():
    """Mock error API response"""
    response = MagicMock()
    response.status_code = 404
    response.raise_for_status.side_effect = Exception("Not found")
    return response


@pytest.fixture
def mock_server():
    """Mock MCP server instance"""
    import main
    server = main.server
    return server


# Test markers
pytest_plugins = []

def pytest_configure(config):
    """Configure pytest markers"""
    config.addinivalue_line("markers", "unit: mark test as a unit test")
    config.addinivalue_line("markers", "integration: mark test as an integration test")
    config.addinivalue_line("markers", "slow: mark test as slow running")
    config.addinivalue_line("markers", "storage_client: mark test as storage client test")
    config.addinivalue_line("markers", "mcp_server: mark test as MCP server test")
