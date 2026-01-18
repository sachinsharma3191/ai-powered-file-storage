"""
Integration tests for MCP server
"""

import pytest
import pytest_asyncio
import json
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from main import server, StorageClient, StorageConfig, get_storage_config


@pytest.mark.integration
@pytest.mark.slow
class TestMCPServerIntegration:
    """Integration tests for MCP server functionality"""
    
    @pytest.mark.asyncio
    async def test_full_bucket_workflow(self, mock_environment_variables):
        """Test complete bucket workflow: list -> create -> list -> delete -> list"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Initial state - no buckets
            mock_client.list_buckets.return_value = []
            
            # List buckets (empty)
            resources = await server.list_resources()
            assert len(resources) == 0
            
            # Create bucket
            new_bucket = {"name": "integration-test-bucket", "region": "us-east-1"}
            mock_client.create_bucket.return_value = new_bucket
            create_result = await server.call_tool("create_bucket", {"name": "integration-test-bucket"})
            assert not create_result.isError
            
            # Update list_buckets to return the new bucket
            mock_client.list_buckets.return_value = [new_bucket]
            
            # List buckets (should show new bucket)
            resources = await server.list_resources()
            assert len(resources) == 1
            assert resources[0].name == "Bucket: integration-test-bucket"
            
            # Get bucket resource
            mock_client.list_objects.return_value = []
            resource_result = await server.get_resource("storage://bucket/integration-test-bucket")
            assert "contents" in resource_result
            
            # Delete bucket
            mock_client.delete_bucket.return_value = True
            delete_result = await server.call_tool("delete_bucket", {"name": "integration-test-bucket"})
            assert not delete_result.isError
            
            # Reset to empty
            mock_client.list_buckets.return_value = []
            
            # List buckets (empty again)
            resources = await server.list_resources()
            assert len(resources) == 0
    
    @pytest.mark.asyncio
    async def test_full_object_workflow(self, mock_environment_variables):
        """Test complete object workflow: create bucket -> list objects -> upload -> get info -> delete"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup bucket
            bucket = {"name": "object-test-bucket", "region": "us-east-1"}
            mock_client.list_buckets.return_value = [bucket]
            
            objects = [
                {
                    "key": "test-file-1.txt",
                    "size": 100,
                    "last_modified": "2024-01-01T00:00:00Z",
                    "etag": "abc123"
                },
                {
                    "key": "test-file-2.txt", 
                    "size": 200,
                    "last_modified": "2024-01-02T00:00:00Z",
                    "etag": "def456"
                }
            ]
            
            # List objects (initially empty)
            mock_client.list_objects.return_value = []
            list_result = await server.call_tool("list_objects", {"bucket": "object-test-bucket"})
            assert json.loads(list_result.content[0].text) == []
            
            # Simulate object upload by updating list_objects
            mock_client.list_objects.return_value = objects
            list_result = await server.call_tool("list_objects", {"bucket": "object-test-bucket"})
            assert len(json.loads(list_result.content[0].text)) == 2
            
            # Get object info
            metadata = {"content-type": "text/plain", "content-length": "100"}
            mock_client.get_object_metadata.return_value = metadata
            info_result = await server.call_tool("get_object_info", {
                "bucket": "object-test-bucket",
                "key": "test-file-1.txt"
            })
            assert not info_result.isError
            assert json.loads(info_result.content[0].text) == metadata
            
            # Get download URL
            download_url = "https://presigned-url.example.com/test-file-1.txt"
            mock_client.get_download_url.return_value = download_url
            url_result = await server.call_tool("get_download_url", {
                "bucket": "object-test-bucket",
                "key": "test-file-1.txt"
            })
            assert not url_result.isError
            assert download_url in url_result.content[0].text
            
            # Delete object
            mock_client.delete_object.return_value = True
            delete_result = await server.call_tool("delete_object", {
                "bucket": "object-test-bucket",
                "key": "test-file-1.txt"
            })
            assert not delete_result.isError
            
            # Verify object deleted by updating list
            remaining_objects = [obj for obj in objects if obj["key"] != "test-file-1.txt"]
            mock_client.list_objects.return_value = remaining_objects
            list_result = await server.call_tool("list_objects", {"bucket": "object-test-bucket"})
            assert len(json.loads(list_result.content[0].text)) == 1
    
    @pytest.mark.asyncio
    async def test_search_functionality_integration(self, mock_environment_variables):
        """Test search functionality with various patterns"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup bucket with various objects
            bucket = {"name": "search-test-bucket", "region": "us-east-1"}
            mock_client.list_buckets.return_value = [bucket]
            
            objects = [
                {"key": "documents/report.pdf", "size": 1000},
                {"key": "documents/summary.txt", "size": 500},
                {"key": "images/photo.jpg", "size": 2000},
                {"key": "images/icon.png", "size": 100},
                {"key": "code/main.py", "size": 300},
                {"key": "code/utils.py", "size": 200},
                {"key": "data/export.csv", "size": 800}
            ]
            mock_client.list_objects.return_value = objects
            
            # Test search by extension
            result = await server.call_tool("search_objects", {
                "bucket": "search-test-bucket",
                "pattern": "*.py"
            })
            found_objects = json.loads(result.content[0].text)
            assert len(found_objects) == 2
            assert all(obj["key"].endswith(".py") for obj in found_objects)
            
            # Test search by directory
            result = await server.call_tool("search_objects", {
                "bucket": "search-test-bucket",
                "pattern": "documents/*"
            })
            found_objects = json.loads(result.content[0].text)
            assert len(found_objects) == 2
            assert all(obj["key"].startswith("documents/") for obj in found_objects)
            
            # Test search with limit
            result = await server.call_tool("search_objects", {
                "bucket": "search-test-bucket",
                "pattern": "*",
                "limit": 3
            })
            found_objects = json.loads(result.content[0].text)
            assert len(found_objects) <= 3
    
    @pytest.mark.asyncio
    async def test_error_handling_integration(self, mock_environment_variables):
        """Test error handling across various failure scenarios"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Test API failure scenarios
            mock_client.list_buckets.side_effect = Exception("API connection failed")
            
            # Resource listing should handle errors gracefully
            resources = await server.list_resources()
            assert len(resources) == 0  # Should return empty list on error
            
            # Tool calls should handle errors
            result = await server.call_tool("list_buckets", {})
            assert result.isError
            assert "Error:" in result.content[0].text
            
            # Reset for other tests
            mock_client.list_buckets.side_effect = None
            mock_client.list_buckets.return_value = []
            
            # Test not found scenarios
            mock_client.get_object_metadata.return_value = None
            result = await server.call_tool("get_object_info", {
                "bucket": "test-bucket",
                "key": "nonexistent.txt"
            })
            assert result.isError
            assert "Object not found" in result.content[0].text
            
            mock_client.delete_bucket.return_value = False
            result = await server.call_tool("delete_bucket", {"name": "nonexistent-bucket"})
            assert result.isError
            assert "Failed to delete bucket" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_concurrent_operations(self, mock_environment_variables):
        """Test handling concurrent operations"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup mock responses
            bucket = {"name": "concurrent-test-bucket", "region": "us-east-1"}
            mock_client.list_buckets.return_value = [bucket]
            mock_client.list_objects.return_value = []
            
            # Run multiple operations concurrently
            tasks = [
                server.call_tool("list_buckets", {}),
                server.call_tool("list_objects", {"bucket": "concurrent-test-bucket"}),
                server.list_resources(),
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Verify all operations completed successfully
            assert all(not isinstance(r, Exception) for r in results)
            assert all(not r.isError for r in results[:2])  # Tool results
            assert isinstance(results[2], list)  # Resource list


@pytest.mark.integration
class TestStorageClientIntegration:
    """Integration tests for StorageClient with realistic scenarios"""
    
    @pytest.mark.asyncio
    async def test_client_with_realistic_api_responses(self, mock_storage_config):
        """Test StorageClient with realistic API response patterns"""
        with patch('main.httpx.AsyncClient') as mock_client_factory:
            mock_client = AsyncMock()
            mock_client_factory.return_value = mock_client
            
            client = StorageClient(mock_storage_config)
            
            # Test successful bucket operations
            buckets_response = MagicMock()
            buckets_response.status_code = 200
            buckets_response.json.return_value = {
                "buckets": [
                    {"name": "prod-data", "region": "us-east-1", "size": 1000000},
                    {"name": "backup-data", "region": "us-west-2", "size": 500000}
                ]
            }
            mock_client.get.return_value = buckets_response
            
            buckets = await client.list_buckets()
            assert len(buckets) == 2
            assert buckets[0]["name"] == "prod-data"
            
            # Test object operations with pagination-like behavior
            objects_response = MagicMock()
            objects_response.status_code = 200
            objects_response.json.return_value = {
                "objects": [
                    {"key": "logs/2024/01/01.log", "size": 1024},
                    {"key": "logs/2024/01/02.log", "size": 2048}
                ]
            }
            mock_client.get.return_value = objects_response
            
            objects = await client.list_objects("prod-data", "logs/2024/")
            assert len(objects) == 2
            assert all("logs/2024/" in obj["key"] for obj in objects)
            
            # Test metadata response
            metadata_response = MagicMock()
            metadata_response.status_code = 200
            metadata_response.headers = {
                "content-type": "text/plain",
                "content-length": "1024",
                "last-modified": "Wed, 01 Jan 2024 00:00:00 GMT"
            }
            mock_client.head.return_value = metadata_response
            
            metadata = await client.get_object_metadata("prod-data", "logs/2024/01/01.log")
            assert metadata["content-type"] == "text/plain"
            assert metadata["content-length"] == "1024"
    
    @pytest.mark.asyncio
    async def test_client_error_recovery(self, mock_storage_config):
        """Test client behavior on various error conditions"""
        with patch('main.httpx.AsyncClient') as mock_client_factory:
            mock_client = AsyncMock()
            mock_client_factory.return_value = mock_client
            
            client = StorageClient(mock_storage_config)
            
            # Test timeout error
            mock_client.get.side_effect = httpx.TimeoutException("Request timeout")
            buckets = await client.list_buckets()
            assert buckets == []  # Should return empty list on timeout
            
            # Test connection error
            mock_client.get.side_effect = httpx.ConnectError("Connection failed")
            buckets = await client.list_buckets()
            assert buckets == []  # Should return empty list on connection error
            
            # Test HTTP error
            error_response = MagicMock()
            error_response.status_code = 500
            error_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Server error", request=MagicMock(), response=error_response
            )
            mock_client.get.side_effect = httpx.HTTPStatusError(
                "Server error", request=MagicMock(), response=error_response
            )
            buckets = await client.list_buckets()
            assert buckets == []  # Should return empty list on HTTP error
            
            # Test recovery after error
            success_response = MagicMock()
            success_response.status_code = 200
            success_response.json.return_value = {"buckets": []}
            mock_client.get.side_effect = None
            mock_client.get.return_value = success_response
            
            buckets = await client.list_buckets()
            assert buckets == []  # Should work normally after error
