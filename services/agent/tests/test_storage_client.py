import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from aioresponses import aioresponses
import aiohttp

# Import the storage client
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from storage_client import StorageClient, Bucket, Object


class TestStorageClient:
    """Test cases for the StorageClient implementation"""
    
    @pytest.fixture
    def client(self):
        """Create a storage client for testing"""
        return StorageClient("http://test-api:3000", "test-api-key")
    
    @pytest.fixture
    def mock_session(self):
        """Mock aiohttp session"""
        session = AsyncMock()
        return session
    
    @pytest.fixture
    def sample_bucket_response(self):
        """Sample bucket API response"""
        return {
            "buckets": [
                {
                    "name": "test-bucket-1",
                    "region": "us-west-2",
                    "versioning": True,
                    "created_at": "2024-01-01T00:00:00Z"
                },
                {
                    "name": "test-bucket-2", 
                    "region": "us-east-1",
                    "versioning": False,
                    "created_at": "2024-01-02T00:00:00Z"
                }
            ]
        }
    
    @pytest.fixture
    def sample_object_response(self):
        """Sample object API response"""
        return {
            "objects": [
                {
                    "key": "file1.txt",
                    "size": 1024,
                    "status": "active",
                    "last_modified": "2024-01-01T12:00:00Z",
                    "etag": "abc123"
                },
                {
                    "key": "file2.txt",
                    "size": 2048,
                    "status": "active",
                    "last_modified": "2024-01-01T13:00:00Z",
                    "etag": "def456"
                }
            ]
        }
    
    def test_client_initialization(self):
        """Test client initialization"""
        client = StorageClient("http://localhost:3000", "api-key-123")
        
        assert client.base_url == "http://localhost:3000"
        assert client.api_key == "api-key-123"
        assert client.session is None
    
    def test_client_initialization_with_trailing_slash(self):
        """Test client initialization with trailing slash in URL"""
        client = StorageClient("http://localhost:3000/", "api-key-123")
        
        assert client.base_url == "http://localhost:3000"
    
    @pytest.mark.asyncio
    async def test_get_session_creates_session(self, client):
        """Test that get_session creates a new session if none exists"""
        session = await client.get_session()
        
        assert session is not None
        assert isinstance(session, aiohttp.ClientSession)
        assert client.session is session
        
        # Clean up
        await session.close()
    
    @pytest.mark.asyncio
    async def test_get_session_returns_existing(self, client):
        """Test that get_session returns existing session"""
        # Create first session
        session1 = await client.get_session()
        
        # Get session again
        session2 = await client.get_session()
        
        assert session1 is session2
        
        # Clean up
        await session1.close()
    
    @pytest.mark.asyncio
    async def test_close_closes_session(self, client):
        """Test that close properly closes the session"""
        session = await client.get_session()
        close_mock = AsyncMock()
        session.close = close_mock
        
        await client.close()
        
        close_mock.assert_called_once()
        assert client.session is None
    
    @pytest.mark.asyncio
    async def test_close_no_session(self, client):
        """Test close when no session exists"""
        # Should not raise an error
        await client.close()
        assert client.session is None
    
    @pytest.mark.asyncio
    async def test_list_buckets_success(self, client, sample_bucket_response):
        """Test successful bucket listing"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                status=200,
                payload=sample_bucket_response
            )
            
            buckets = await client.list_buckets()
            
            assert len(buckets) == 2
            assert buckets[0].name == "test-bucket-1"
            assert buckets[0].region == "us-west-2"
            assert buckets[0].versioning is True
            
            assert buckets[1].name == "test-bucket-2"
            assert buckets[1].region == "us-east-1"
            assert buckets[1].versioning is False
    
    @pytest.mark.asyncio
    async def test_list_buckets_empty_response(self, client):
        """Test bucket listing with empty response"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                status=200,
                payload={"buckets": []}
            )
            
            buckets = await client.list_buckets()
            
            assert len(buckets) == 0
    
    @pytest.mark.asyncio
    async def test_list_buckets_http_error(self, client):
        """Test bucket listing with HTTP error"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                status=500,
                payload={"error": "Internal server error"}
            )
            
            with pytest.raises(aiohttp.ClientResponseError):
                await client.list_buckets()
    
    @pytest.mark.asyncio
    async def test_create_bucket_success(self, client):
        """Test successful bucket creation"""
        response_data = {
            "name": "new-bucket",
            "region": "us-west-2",
            "versioning": False,
            "created_at": "2024-01-01T00:00:00Z"
        }
        
        with aioresponses() as m:
            m.post(
                "http://test-api:3000/v1/buckets",
                status=201,
                payload=response_data
            )
            
            bucket = await client.create_bucket("new-bucket", "us-west-2")
            
            assert bucket.name == "new-bucket"
            assert bucket.region == "us-west-2"
            assert bucket.versioning is False
    
    @pytest.mark.asyncio
    async def test_create_bucket_default_region(self, client):
        """Test bucket creation with default region"""
        response_data = {
            "name": "default-bucket",
            "region": "us-west-2",
            "versioning": False
        }
        
        with aioresponses() as m:
            m.post(
                "http://test-api:3000/v1/buckets",
                status=201,
                payload=response_data
            )
            
            bucket = await client.create_bucket("default-bucket")
            
            assert bucket.region == "us-west-2"
    
    @pytest.mark.asyncio
    async def test_create_bucket_conflict(self, client):
        """Test bucket creation with name conflict"""
        with aioresponses() as m:
            m.post(
                "http://test-api:3000/v1/buckets",
                status=409,
                payload={"error": "Bucket already exists"}
            )
            
            with pytest.raises(aiohttp.ClientResponseError):
                await client.create_bucket("existing-bucket")
    
    @pytest.mark.asyncio
    async def test_delete_bucket_success(self, client):
        """Test successful bucket deletion"""
        with aioresponses() as m:
            m.delete(
                "http://test-api:3000/v1/buckets/test-bucket",
                status=204
            )
            
            # Should not raise an exception
            await client.delete_bucket("test-bucket")
    
    @pytest.mark.asyncio
    async def test_delete_bucket_not_found(self, client):
        """Test bucket deletion with non-existent bucket"""
        with aioresponses() as m:
            m.delete(
                "http://test-api:3000/v1/buckets/nonexistent",
                status=404,
                payload={"error": "Bucket not found"}
            )
            
            with pytest.raises(aiohttp.ClientResponseError):
                await client.delete_bucket("nonexistent")
    
    @pytest.mark.asyncio
    async def test_list_objects_success(self, client, sample_object_response):
        """Test successful object listing"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets/test-bucket/objects",
                status=200,
                payload=sample_object_response
            )
            
            objects = await client.list_objects("test-bucket")
            
            assert len(objects) == 2
            assert objects[0].key == "file1.txt"
            assert objects[0].size == 1024
            assert objects[0].status == "active"
            
            assert objects[1].key == "file2.txt"
            assert objects[1].size == 2048
            assert objects[1].status == "active"
    
    @pytest.mark.asyncio
    async def test_list_objects_empty_bucket(self, client):
        """Test object listing for empty bucket"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets/empty-bucket/objects",
                status=200,
                payload={"objects": []}
            )
            
            objects = await client.list_objects("empty-bucket")
            
            assert len(objects) == 0
    
    @pytest.mark.asyncio
    async def test_create_object_success(self, client):
        """Test successful object creation"""
        test_data = b"Hello, World!"
        response_data = {
            "key": "test-file.txt",
            "size": len(test_data),
            "status": "active",
            "etag": "test-etag-123"
        }
        
        with aioresponses() as m:
            m.put(
                "http://test-api:3000/v1/buckets/test-bucket/objects/test-file.txt",
                status=201,
                payload=response_data
            )
            
            obj = await client.create_object("test-bucket", "test-file.txt", test_data)
            
            assert obj.key == "test-file.txt"
            assert obj.size == len(test_data)
            assert obj.status == "active"
    
    @pytest.mark.asyncio
    async def test_create_object_large_data(self, client):
        """Test object creation with large data"""
        large_data = b"A" * (1024 * 1024)  # 1MB
        response_data = {
            "key": "large-file.bin",
            "size": len(large_data),
            "status": "active"
        }
        
        with aioresponses() as m:
            m.put(
                "http://test-api:3000/v1/buckets/test-bucket/objects/large-file.bin",
                status=201,
                payload=response_data
            )
            
            obj = await client.create_object("test-bucket", "large-file.bin", large_data)
            
            assert obj.size == len(large_data)
    
    @pytest.mark.asyncio
    async def test_create_object_unicode_key(self, client):
        """Test object creation with unicode key"""
        test_data = b"Test content"
        unicode_key = "测试文件.txt"
        response_data = {
            "key": unicode_key,
            "size": len(test_data),
            "status": "active"
        }
        
        with aioresponses() as m:
            m.put(
                f"http://test-api:3000/v1/buckets/test-bucket/objects/{unicode_key}",
                status=201,
                payload=response_data
            )
            
            obj = await client.create_object("test-bucket", unicode_key, test_data)
            
            assert obj.key == unicode_key
    
    @pytest.mark.asyncio
    async def test_delete_object_success(self, client):
        """Test successful object deletion"""
        with aioresponses() as m:
            m.delete(
                "http://test-api:3000/v1/buckets/test-bucket/objects/test-file.txt",
                status=204
            )
            
            # Should not raise an exception
            await client.delete_object("test-bucket", "test-file.txt")
    
    @pytest.mark.asyncio
    async def test_delete_object_not_found(self, client):
        """Test object deletion with non-existent object"""
        with aioresponses() as m:
            m.delete(
                "http://test-api:3000/v1/buckets/test-bucket/objects/nonexistent.txt",
                status=404,
                payload={"error": "Object not found"}
            )
            
            with pytest.raises(aiohttp.ClientResponseError):
                await client.delete_object("test-bucket", "nonexistent.txt")
    
    @pytest.mark.asyncio
    async def test_headers_are_set_correctly(self, client):
        """Test that authentication headers are set correctly"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                status=200,
                payload={"buckets": []}
            )
            
            await client.list_buckets()
            
            # Check that the request was made with correct headers
            request = m.requests[("GET", "http://test-api:3000/v1/buckets")][0]
            assert "X-API-Key" in request.headers
            assert request.headers["X-API-Key"] == "test-api-key"
            assert request.headers["Content-Type"] == "application/json"
    
    @pytest.mark.asyncio
    async def test_context_manager_usage(self):
        """Test using client as context manager"""
        with StorageClient("http://test:3000", "test-key") as client:
            assert client is not None
            # Session should be created
            session = await client.get_session()
            assert session is not None
        
        # Session should be closed after context exit
        assert client.session is None
    
    @pytest.mark.asyncio
    async def test_concurrent_requests(self, client):
        """Test handling concurrent requests"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                status=200,
                payload={"buckets": []}
            )
            
            # Make multiple concurrent requests
            tasks = [client.list_buckets() for _ in range(5)]
            results = await asyncio.gather(*tasks)
            
            # All should succeed
            for result in results:
                assert len(result) == 0
    
    @pytest.mark.asyncio
    async def test_network_error_handling(self, client):
        """Test handling of network errors"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                exception=aiohttp.ClientError("Connection failed")
            )
            
            with pytest.raises(aiohttp.ClientError):
                await client.list_buckets()
    
    @pytest.mark.asyncio
    async def test_timeout_handling(self, client):
        """Test handling of request timeouts"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                exception=asyncio.TimeoutError("Request timed out")
            )
            
            with pytest.raises(asyncio.TimeoutError):
                await client.list_buckets()
    
    @pytest.mark.asyncio
    async def test_json_parsing_error(self, client):
        """Test handling of invalid JSON responses"""
        with aioresponses() as m:
            m.get(
                "http://test-api:3000/v1/buckets",
                status=200,
                body=b"invalid json"
            )
            
            with pytest.raises(json.JSONDecodeError):
                await client.list_buckets()


class TestBucket:
    """Test cases for Bucket model"""
    
    def test_bucket_creation(self):
        """Test bucket object creation"""
        bucket = Bucket(
            name="test-bucket",
            region="us-west-2",
            versioning=True
        )
        
        assert bucket.name == "test-bucket"
        assert bucket.region == "us-west-2"
        assert bucket.versioning is True
    
    def test_bucket_equality(self):
        """Test bucket equality comparison"""
        bucket1 = Bucket("test", "us-west-2", True)
        bucket2 = Bucket("test", "us-west-2", True)
        bucket3 = Bucket("test", "us-east-1", True)
        
        assert bucket1 == bucket2
        assert bucket1 != bucket3
    
    def test_bucket_repr(self):
        """Test bucket string representation"""
        bucket = Bucket("test-bucket", "us-west-2", False)
        repr_str = repr(bucket)
        
        assert "test-bucket" in repr_str
        assert "us-west-2" in repr_str
        assert "versioning=False" in repr_str


class TestObject:
    """Test cases for Object model"""
    
    def test_object_creation(self):
        """Test object creation"""
        obj = Object(
            key="test-file.txt",
            size=1024,
            status="active"
        )
        
        assert obj.key == "test-file.txt"
        assert obj.size == 1024
        assert obj.status == "active"
    
    def test_object_equality(self):
        """Test object equality comparison"""
        obj1 = Object("test.txt", 1024, "active")
        obj2 = Object("test.txt", 1024, "active")
        obj3 = Object("test.txt", 2048, "active")
        
        assert obj1 == obj2
        assert obj1 != obj3
    
    def test_object_repr(self):
        """Test object string representation"""
        obj = Object("test-file.txt", 1024, "active")
        repr_str = repr(obj)
        
        assert "test-file.txt" in repr_str
        assert "1024" in repr_str
        assert "active" in repr_str


if __name__ == "__main__":
    pytest.main([__file__])
