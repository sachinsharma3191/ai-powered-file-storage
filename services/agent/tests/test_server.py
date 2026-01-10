import pytest
import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch
from mcp.types import TextContent, CallToolResult

# Import the server module
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server
from storage_client import Bucket, Object


class TestServer:
    """Test cases for the MCP server implementation"""
    
    @pytest.fixture
    def mock_storage_client(self):
        """Mock storage client for testing"""
        client = AsyncMock()
        
        # Mock bucket responses
        client.list_buckets.return_value = [
            Bucket(name="test-bucket-1", region="us-west-2", versioning=True),
            Bucket(name="test-bucket-2", region="us-east-1", versioning=False),
        ]
        
        client.create_bucket.return_value = Bucket(
            name="new-bucket", region="us-west-2", versioning=False
        )
        
        # Mock object responses
        client.list_objects.return_value = [
            Object(key="file1.txt", size=1024, status="active"),
            Object(key="file2.txt", size=2048, status="active"),
        ]
        
        client.create_object.return_value = Object(
            key="uploaded.txt", size=512, status="active"
        )
        
        return client
    
    @pytest.fixture
    def mock_env_vars(self):
        """Mock environment variables"""
        env_vars = {
            "STORAGE_API_URL": "http://test-api:3000",
            "STORAGE_API_KEY": "test-api-key-12345"
        }
        return env_vars
    
    def test_get_client_success(self, mock_env_vars, mock_storage_client):
        """Test successful client initialization"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.StorageClient', return_value=mock_storage_client):
                # Reset global client
                server._client = None
                
                client = server.get_client()
                assert client is not None
                assert client == mock_storage_client
    
    def test_get_client_missing_api_key(self):
        """Test client initialization fails without API key"""
        with patch.dict(os.environ, {"STORAGE_API_URL": "http://test:3000"}, clear=True):
            server._client = None
            
            with pytest.raises(ValueError, match="STORAGE_API_KEY environment variable is required"):
                server.get_client()
    
    def test_get_client_caching(self, mock_env_vars, mock_storage_client):
        """Test client is cached after first initialization"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.StorageClient', return_value=mock_storage_client) as mock_client_class:
                server._client = None
                
                # First call should create client
                client1 = server.get_client()
                mock_client_class.assert_called_once()
                
                # Second call should return cached client
                client2 = server.get_client()
                assert client1 is client2
                # Should not create new client
                assert mock_client_class.call_count == 1
    
    @pytest.mark.asyncio
    async def test_list_tools(self):
        """Test tool listing functionality"""
        tools = await server.list_tools()
        
        assert len(tools) == 6
        tool_names = [tool.name for tool in tools]
        expected_tools = [
            "list_buckets",
            "create_bucket", 
            "delete_bucket",
            "list_objects",
            "upload_object",
            "delete_object"
        ]
        
        for expected_tool in expected_tools:
            assert expected_tool in tool_names
        
        # Verify tool schemas
        list_buckets_tool = next(t for t in tools if t.name == "list_buckets")
        assert list_buckets_tool.description == "List all storage buckets in the account"
        assert list_buckets_tool.inputSchema["type"] == "object"
        assert "properties" in list_buckets_tool.inputSchema
        assert list_buckets_tool.inputSchema["required"] == []
        
        # Verify create bucket schema
        create_bucket_tool = next(t for t in tools if t.name == "create_bucket")
        assert "name" in create_bucket_tool.inputSchema["required"]
        assert "region" not in create_bucket_tool.inputSchema["required"]
    
    @pytest.mark.asyncio
    async def test_call_tool_list_buckets(self, mock_storage_client, mock_env_vars):
        """Test list_buckets tool call"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                result = await server.call_tool("list_buckets", {})
                
                assert isinstance(result, CallToolResult)
                assert len(result.content) == 1
                assert isinstance(result.content[0], TextContent)
                assert not result.isError
                
                # Parse JSON response
                response_data = json.loads(result.content[0].text)
                assert len(response_data) == 2
                assert response_data[0]["name"] == "test-bucket-1"
                assert response_data[0]["region"] == "us-west-2"
                assert response_data[0]["versioning"] is True
    
    @pytest.mark.asyncio
    async def test_call_tool_create_bucket(self, mock_storage_client, mock_env_vars):
        """Test create_bucket tool call"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {"name": "new-bucket", "region": "us-west-2"}
                result = await server.call_tool("create_bucket", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                # Verify client was called with correct arguments
                mock_storage_client.create_bucket.assert_called_once_with(
                    name="new-bucket", region="us-west-2"
                )
                
                # Check response message
                assert "Created bucket 'new-bucket'" in result.content[0].text
                assert "region 'us-west-2'" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_create_bucket_default_region(self, mock_storage_client, mock_env_vars):
        """Test create_bucket with default region"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {"name": "new-bucket"}
                result = await server.call_tool("create_bucket", args)
                
                mock_storage_client.create_bucket.assert_called_once_with(
                    name="new-bucket", region="us-west-2"
                )
    
    @pytest.mark.asyncio
    async def test_call_tool_delete_bucket(self, mock_storage_client, mock_env_vars):
        """Test delete_bucket tool call"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {"name": "bucket-to-delete"}
                result = await server.call_tool("delete_bucket", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                mock_storage_client.delete_bucket.assert_called_once_with("bucket-to-delete")
                assert "Deleted bucket 'bucket-to-delete'" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_list_objects(self, mock_storage_client, mock_env_vars):
        """Test list_objects tool call"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {"bucket_name": "test-bucket"}
                result = await server.call_tool("list_objects", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                mock_storage_client.list_objects.assert_called_once_with("test-bucket")
                
                # Parse JSON response
                response_data = json.loads(result.content[0].text)
                assert len(response_data) == 2
                assert response_data[0]["key"] == "file1.txt"
                assert response_data[0]["size"] == 1024
                assert response_data[0]["status"] == "active"
    
    @pytest.mark.asyncio
    async def test_call_tool_upload_object(self, mock_storage_client, mock_env_vars):
        """Test upload_object tool call"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {
                    "bucket_name": "test-bucket",
                    "key": "test-file.txt",
                    "content": "Hello, World!"
                }
                result = await server.call_tool("upload_object", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                # Verify client was called with encoded content
                expected_data = b"Hello, World!"
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="test-file.txt",
                    data=expected_data
                )
                
                assert "Uploaded 'test-file.txt'" in result.content[0].text
                assert "512 bytes" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_delete_object(self, mock_storage_client, mock_env_vars):
        """Test delete_object tool call"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {
                    "bucket_name": "test-bucket",
                    "key": "file-to-delete.txt"
                }
                result = await server.call_tool("delete_object", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                mock_storage_client.delete_object.assert_called_once_with(
                    "test-bucket", "file-to-delete.txt"
                )
                
                assert "Deleted object 'file-to-delete.txt'" in result.content[0].text
                assert "bucket 'test-bucket'" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_unknown_tool(self, mock_env_vars):
        """Test handling of unknown tool calls"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client') as mock_get_client:
                result = await server.call_tool("unknown_tool", {})
                
                assert isinstance(result, CallToolResult)
                assert result.isError
                assert "Unknown tool: unknown_tool" in result.content[0].text
                
                # Should not initialize client for unknown tool
                mock_get_client.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_call_tool_exception_handling(self, mock_env_vars):
        """Test exception handling in tool calls"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client') as mock_get_client:
                mock_client = AsyncMock()
                mock_client.list_buckets.side_effect = Exception("Connection failed")
                mock_get_client.return_value = mock_client
                
                result = await server.call_tool("list_buckets", {})
                
                assert isinstance(result, CallToolResult)
                assert result.isError
                assert "Error: Connection failed" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_missing_required_args(self, mock_env_vars):
        """Test handling of missing required arguments"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client') as mock_get_client:
                # Test create_bucket without name
                result = await server.call_tool("create_bucket", {})
                
                assert isinstance(result, CallToolResult)
                assert result.isError
                assert "Error" in result.content[0].text
    
    @pytest.mark.asyncio
    async def test_main_function(self):
        """Test the main function"""
        with patch('server.stdio_server') as mock_stdio:
            with patch('server.server.run') as mock_run:
                # Mock the async context manager
                mock_read_stream = MagicMock()
                mock_write_stream = MagicMock()
                mock_init_options = MagicMock()
                
                mock_stdio.return_value.__aenter__.return_value = (
                    mock_read_stream, mock_write_stream
                )
                mock_server_create_init = MagicMock(return_value=mock_init_options)
                
                with patch.object(server.server, 'create_initialization_options', mock_server_create_init):
                    await server.main()
                    
                    mock_stdio.assert_called_once()
                    mock_run.assert_called_once_with(
                        mock_read_stream, mock_write_stream, mock_init_options
                    )
    
    def test_server_initialization(self):
        """Test server initialization"""
        assert server.server.name == "s3-storage-agent"
        assert server._client is None  # Should be None initially
    
    @pytest.mark.asyncio
    async def test_tool_schema_validation(self):
        """Test that all tool schemas are valid"""
        tools = await server.list_tools()
        
        for tool in tools:
            # Basic schema validation
            assert tool.inputSchema["type"] == "object"
            assert "properties" in tool.inputSchema
            assert "required" in tool.inputSchema
            
            # Verify required properties exist in properties
            for required_prop in tool.inputSchema["required"]:
                assert required_prop in tool.inputSchema["properties"]
    
    @pytest.mark.asyncio
    async def test_unicode_content_handling(self, mock_storage_client, mock_env_vars):
        """Test handling of unicode content in upload_object"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                unicode_content = "Hello 世界! 🌍"
                args = {
                    "bucket_name": "test-bucket",
                    "key": "unicode-file.txt",
                    "content": unicode_content
                }
                
                result = await server.call_tool("upload_object", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                # Verify unicode content was properly encoded
                expected_data = unicode_content.encode("utf-8")
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="unicode-file.txt",
                    data=expected_data
                )
    
    @pytest.mark.asyncio
    async def test_empty_content_upload(self, mock_storage_client, mock_env_vars):
        """Test handling of empty content upload"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                args = {
                    "bucket_name": "test-bucket",
                    "key": "empty-file.txt",
                    "content": ""
                }
                
                result = await server.call_tool("upload_object", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                # Verify empty content was handled
                expected_data = b""
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="empty-file.txt",
                    data=expected_data
                )
    
    @pytest.mark.asyncio
    async def test_large_content_upload(self, mock_storage_client, mock_env_vars):
        """Test handling of large content upload"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('server.get_client', return_value=mock_storage_client):
                large_content = "A" * 10000  # 10KB of content
                args = {
                    "bucket_name": "test-bucket",
                    "key": "large-file.txt",
                    "content": large_content
                }
                
                result = await server.call_tool("upload_object", args)
                
                assert isinstance(result, CallToolResult)
                assert not result.isError
                
                expected_data = large_content.encode("utf-8")
                assert len(expected_data) == 10000
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="large-file.txt",
                    data=expected_data
                )


if __name__ == "__main__":
    pytest.main([__file__])
