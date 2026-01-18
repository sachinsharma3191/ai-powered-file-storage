"""
Test cases for MCP server handlers and tools
"""

import pytest
import pytest_asyncio
import json
import fnmatch
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from main import server, get_storage_config, StorageClient
from mcp.types import Resource, TextContent, CallToolResult


@pytest.mark.mcp_server
class TestMCPServerResources:
    """Test MCP server resource handlers"""
    
    @pytest.mark.asyncio
    async def test_handle_list_resources_success(self, sample_buckets, mock_environment_variables):
        """Test successful resource listing"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_buckets.return_value = sample_buckets
            
            resources = await server.list_resources()
            
            assert len(resources) == len(sample_buckets)
            for i, bucket in enumerate(sample_buckets):
                resource = resources[i]
                assert resource.uri == f"storage://bucket/{bucket['name']}"
                assert resource.name == f"Bucket: {bucket['name']}"
                assert resource.description == f"Storage bucket in {bucket.get('region', 'unknown')}"
                assert resource.mimeType == "application/json"
    
    @pytest.mark.asyncio
    async def test_handle_list_resources_empty(self, mock_environment_variables):
        """Test resource listing with no buckets"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_buckets.return_value = []
            
            resources = await server.list_resources()
            
            assert len(resources) == 0
    
    @pytest.mark.asyncio
    async def test_handle_get_resource_success(self, sample_buckets, sample_objects, mock_environment_variables):
        """Test successful resource retrieval"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_buckets.return_value = sample_buckets
            mock_client.list_objects.return_value = sample_objects
            
            uri = f"storage://bucket/{sample_buckets[0]['name']}"
            result = await server.get_resource(uri)
            
            assert "contents" in result
            assert len(result["contents"]) == 1
            content = result["contents"][0]
            assert isinstance(content, TextContent)
            
            content_data = json.loads(content.text)
            assert "bucket" in content_data
            assert "objects" in content_data
            assert "timestamp" in content_data
            assert content_data["bucket"] == sample_buckets[0]
            assert content_data["objects"] == sample_objects
    
    @pytest.mark.asyncio
    async def test_handle_get_resource_bucket_not_found(self, mock_environment_variables):
        """Test resource retrieval for non-existent bucket"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_buckets.return_value = []
            
            uri = "storage://bucket/nonexistent"
            
            with pytest.raises(ValueError, match="Unknown resource"):
                await server.get_resource(uri)
    
    @pytest.mark.asyncio
    async def test_handle_get_resource_invalid_uri(self, mock_environment_variables):
        """Test resource retrieval with invalid URI"""
        uri = "invalid://resource/uri"
        
        with pytest.raises(ValueError, match="Unknown resource"):
            await server.get_resource(uri)


@pytest.mark.mcp_server
class TestMCPServerTools:
    """Test MCP server tool handlers"""
    
    @pytest.mark.asyncio
    async def test_handle_list_tools(self):
        """Test tool listing"""
        tools = await server.list_tools()
        
        tool_names = [tool.name for tool in tools]
        expected_tools = [
            "list_buckets",
            "create_bucket", 
            "delete_bucket",
            "list_objects",
            "get_object_info",
            "delete_object",
            "get_download_url",
            "search_objects"
        ]
        
        for expected_tool in expected_tools:
            assert expected_tool in tool_names
        
        # Verify tool schemas
        for tool in tools:
            assert tool.inputSchema is not None
            assert "type" in tool.inputSchema
            assert tool.inputSchema["type"] == "object"
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_list_buckets(self, sample_buckets, mock_environment_variables):
        """Test list_buckets tool call"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_buckets.return_value = sample_buckets
            
            result = await server.call_tool("list_buckets", {})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert json.loads(result.content[0].text) == sample_buckets
            assert not result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_create_bucket_success(self, mock_environment_variables):
        """Test create_bucket tool call success"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.create_bucket.return_value = {"name": "new-bucket", "region": "us-east-1"}
            
            result = await server.call_tool("create_bucket", {"name": "new-bucket", "region": "us-west-2"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "created successfully" in result.content[0].text
            assert not result.isError
            
            mock_client.create_bucket.assert_called_once_with("new-bucket", "us-west-2")
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_create_bucket_failure(self, mock_environment_variables):
        """Test create_bucket tool call failure"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.create_bucket.return_value = None
            
            result = await server.call_tool("create_bucket", {"name": "new-bucket"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Failed to create bucket" in result.content[0].text
            assert result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_delete_bucket_success(self, mock_environment_variables):
        """Test delete_bucket tool call success"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.delete_bucket.return_value = True
            
            result = await server.call_tool("delete_bucket", {"name": "test-bucket"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "deleted successfully" in result.content[0].text
            assert not result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_delete_bucket_failure(self, mock_environment_variables):
        """Test delete_bucket tool call failure"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.delete_bucket.return_value = False
            
            result = await server.call_tool("delete_bucket", {"name": "test-bucket"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Failed to delete bucket" in result.content[0].text
            assert result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_list_objects(self, sample_objects, mock_environment_variables):
        """Test list_objects tool call"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_objects.return_value = sample_objects
            
            result = await server.call_tool("list_objects", {"bucket": "test-bucket", "prefix": "folder1/"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert json.loads(result.content[0].text) == sample_objects
            assert not result.isError
            
            mock_client.list_objects.assert_called_once_with("test-bucket", "folder1/")
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_get_object_info_success(self, sample_object_metadata, mock_environment_variables):
        """Test get_object_info tool call success"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.get_object_metadata.return_value = sample_object_metadata
            
            result = await server.call_tool("get_object_info", {"bucket": "test-bucket", "key": "test-file.txt"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert json.loads(result.content[0].text) == sample_object_metadata
            assert not result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_get_object_info_not_found(self, mock_environment_variables):
        """Test get_object_info tool call when object not found"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.get_object_metadata.return_value = None
            
            result = await server.call_tool("get_object_info", {"bucket": "test-bucket", "key": "nonexistent.txt"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Object not found" in result.content[0].text
            assert result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_delete_object_success(self, mock_environment_variables):
        """Test delete_object tool call success"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.delete_object.return_value = True
            
            result = await server.call_tool("delete_object", {"bucket": "test-bucket", "key": "test-file.txt"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "deleted successfully" in result.content[0].text
            assert not result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_delete_object_failure(self, mock_environment_variables):
        """Test delete_object tool call failure"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.delete_object.return_value = False
            
            result = await server.call_tool("delete_object", {"bucket": "test-bucket", "key": "test-file.txt"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Failed to delete object" in result.content[0].text
            assert result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_get_download_url_success(self, mock_environment_variables):
        """Test get_download_url tool call success"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.get_download_url.return_value = "https://presigned-url.example.com/file.txt"
            
            result = await server.call_tool("get_download_url", {"bucket": "test-bucket", "key": "test-file.txt"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Download URL:" in result.content[0].text
            assert not result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_get_download_url_failure(self, mock_environment_variables):
        """Test get_download_url tool call failure"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.get_download_url.return_value = None
            
            result = await server.call_tool("get_download_url", {"bucket": "test-bucket", "key": "test-file.txt"})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Failed to get download URL" in result.content[0].text
            assert result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_search_objects(self, sample_objects, mock_environment_variables):
        """Test search_objects tool call"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_objects.return_value = sample_objects
            
            result = await server.call_tool("search_objects", {
                "bucket": "test-bucket",
                "pattern": "*.txt",
                "limit": 10
            })
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            
            filtered_objects = json.loads(result.content[0].text)
            assert len(filtered_objects) == 2  # Only .txt files
            assert all(obj["key"].endswith(".txt") for obj in filtered_objects)
            assert not result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_search_objects_with_wildcard(self, sample_objects, mock_environment_variables):
        """Test search_objects tool call with wildcard pattern"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_objects.return_value = sample_objects
            
            result = await server.call_tool("search_objects", {
                "bucket": "test-bucket",
                "pattern": "folder1/*"
            })
            
            assert isinstance(result, CallToolResult)
            filtered_objects = json.loads(result.content[0].text)
            assert len(filtered_objects) == 2  # Only files in folder1
            assert all(obj["key"].startswith("folder1/") for obj in filtered_objects)
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_search_objects_limit(self, sample_objects, mock_environment_variables):
        """Test search_objects tool call with limit"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_objects.return_value = sample_objects
            
            result = await server.call_tool("search_objects", {
                "bucket": "test-bucket",
                "pattern": "*",
                "limit": 2
            })
            
            assert isinstance(result, CallToolResult)
            filtered_objects = json.loads(result.content[0].text)
            assert len(filtered_objects) <= 2
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_unknown_tool(self, mock_environment_variables):
        """Test calling unknown tool"""
        result = await server.call_tool("unknown_tool", {})
        
        assert isinstance(result, CallToolResult)
        assert len(result.content) == 1
        assert isinstance(result.content[0], TextContent)
        assert "Unknown tool" in result.content[0].text
        assert result.isError
    
    @pytest.mark.asyncio
    async def test_handle_call_tool_exception_handling(self, mock_environment_variables):
        """Test tool call exception handling"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            mock_client.list_buckets.side_effect = Exception("Connection error")
            
            result = await server.call_tool("list_buckets", {})
            
            assert isinstance(result, CallToolResult)
            assert len(result.content) == 1
            assert isinstance(result.content[0], TextContent)
            assert "Error:" in result.content[0].text
            assert result.isError


@pytest.mark.mcp_server
class TestStorageConfig:
    """Test storage configuration function"""
    
    def test_get_storage_config_with_env_vars(self, mock_environment_variables):
        """Test getting storage config from environment variables"""
        config = get_storage_config()
        
        assert config.api_url == "http://test-api:3000"
        assert config.api_key == "test-api-key-12345"
        assert config.timeout == 30
    
    def test_get_storage_config_defaults(self, monkeypatch):
        """Test getting storage config with default values"""
        monkeypatch.setenv("STORAGE_API_KEY", "required-key")
        # Don't set STORAGE_API_URL to test default
        
        config = get_storage_config()
        
        assert config.api_url == "http://localhost:3000"  # Default value
        assert config.api_key == "required-key"
        assert config.timeout == 30
    
    def test_get_storage_config_missing_api_key(self, monkeypatch):
        """Test getting storage config without API key"""
        monkeypatch.delenv("STORAGE_API_KEY", raising=False)
        
        with pytest.raises(SystemExit):
            get_storage_config()
