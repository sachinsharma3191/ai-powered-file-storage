"""
Test cases for StorageClient class
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from main import StorageConfig, StorageClient


class TestStorageConfig:
    """Test StorageConfig dataclass"""
    
    def test_storage_config_creation(self):
        """Test creating StorageConfig with all parameters"""
        config = StorageConfig(
            api_url="http://test-api:3000",
            api_key="test-key-123",
            timeout=60
        )
        
        assert config.api_url == "http://test-api:3000"
        assert config.api_key == "test-key-123"
        assert config.timeout == 60
    
    def test_storage_config_default_timeout(self):
        """Test StorageConfig with default timeout"""
        config = StorageConfig(
            api_url="http://test-api:3000",
            api_key="test-key-123"
        )
        
        assert config.timeout == 30


@pytest.mark.storage_client
class TestStorageClient:
    """Test StorageClient class"""
    
    @pytest.mark.asyncio
    async def test_storage_client_initialization(self, mock_storage_config):
        """Test StorageClient initialization"""
        with patch('main.httpx.AsyncClient') as mock_client_factory:
            mock_client = AsyncMock()
            mock_client_factory.return_value = mock_client
            
            client = StorageClient(mock_storage_config)
            
            assert client.config == mock_storage_config
            assert client.client == mock_client
            mock_client_factory.assert_called_once_with(
                base_url=mock_storage_config.api_url,
                timeout=mock_storage_config.timeout,
                headers={"Authorization": f"Bearer {mock_storage_config.api_key}"}
            )
    
    @pytest.mark.asyncio
    async def test_list_buckets_success(self, mock_storage_client, sample_buckets, successful_api_response):
        """Test successful bucket listing"""
        mock_storage_client.client.get.return_value = successful_api_response
        successful_api_response.json.return_value = {"buckets": sample_buckets}
        
        result = await mock_storage_client.list_buckets()
        
        assert result == sample_buckets
        mock_storage_client.client.get.assert_called_once_with("/api/v1/buckets")
        successful_api_response.raise_for_status.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_list_buckets_api_error(self, mock_storage_client, error_api_response):
        """Test bucket listing with API error"""
        mock_storage_client.client.get.return_value = error_api_response
        
        result = await mock_storage_client.list_buckets()
        
        assert result == []
        mock_storage_client.client.get.assert_called_once_with("/api/v1/buckets")
    
    @pytest.mark.asyncio
    async def test_list_objects_success(self, mock_storage_client, sample_objects, successful_api_response):
        """Test successful object listing"""
        bucket_name = "test-bucket"
        prefix = "folder1/"
        
        mock_storage_client.client.get.return_value = successful_api_response
        successful_api_response.json.return_value = {"objects": sample_objects}
        
        result = await mock_storage_client.list_objects(bucket_name, prefix)
        
        assert result == sample_objects
        mock_storage_client.client.get.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects",
            params={"prefix": prefix}
        )
        successful_api_response.raise_for_status.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_list_objects_without_prefix(self, mock_storage_client, sample_objects, successful_api_response):
        """Test object listing without prefix"""
        bucket_name = "test-bucket"
        
        mock_storage_client.client.get.return_value = successful_api_response
        successful_api_response.json.return_value = {"objects": sample_objects}
        
        result = await mock_storage_client.list_objects(bucket_name)
        
        assert result == sample_objects
        mock_storage_client.client.get.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects",
            params={}
        )
    
    @pytest.mark.asyncio
    async def test_list_objects_api_error(self, mock_storage_client, error_api_response):
        """Test object listing with API error"""
        bucket_name = "test-bucket"
        mock_storage_client.client.get.return_value = error_api_response
        
        result = await mock_storage_client.list_objects(bucket_name)
        
        assert result == []
        mock_storage_client.client.get.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects",
            params={}
        )
    
    @pytest.mark.asyncio
    async def test_get_object_metadata_success(self, mock_storage_client, sample_object_metadata, successful_api_response):
        """Test successful object metadata retrieval"""
        bucket_name = "test-bucket"
        object_key = "test-file.txt"
        
        mock_storage_client.client.head.return_value = successful_api_response
        successful_api_response.status_code = 200
        successful_api_response.headers = sample_object_metadata
        
        result = await mock_storage_client.get_object_metadata(bucket_name, object_key)
        
        assert result == sample_object_metadata
        mock_storage_client.client.head.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}"
        )
    
    @pytest.mark.asyncio
    async def test_get_object_metadata_not_found(self, mock_storage_client, successful_api_response):
        """Test object metadata retrieval when object not found"""
        bucket_name = "test-bucket"
        object_key = "nonexistent-file.txt"
        
        mock_storage_client.client.head.return_value = successful_api_response
        successful_api_response.status_code = 404
        
        result = await mock_storage_client.get_object_metadata(bucket_name, object_key)
        
        assert result is None
        mock_storage_client.client.head.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}"
        )
    
    @pytest.mark.asyncio
    async def test_get_object_metadata_api_error(self, mock_storage_client, error_api_response):
        """Test object metadata retrieval with API error"""
        bucket_name = "test-bucket"
        object_key = "test-file.txt"
        
        mock_storage_client.client.head.return_value = error_api_response
        
        result = await mock_storage_client.get_object_metadata(bucket_name, object_key)
        
        assert result is None
        mock_storage_client.client.head.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}"
        )
    
    @pytest.mark.asyncio
    async def test_create_bucket_success(self, mock_storage_client, successful_api_response):
        """Test successful bucket creation"""
        bucket_name = "new-bucket"
        region = "us-west-2"
        expected_response = {"name": bucket_name, "region": region}
        
        mock_storage_client.client.post.return_value = successful_api_response
        successful_api_response.json.return_value = expected_response
        
        result = await mock_storage_client.create_bucket(bucket_name, region)
        
        assert result == expected_response
        mock_storage_client.client.post.assert_called_once_with(
            "/api/v1/buckets",
            json={"name": bucket_name, "region": region}
        )
        successful_api_response.raise_for_status.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_create_bucket_default_region(self, mock_storage_client, successful_api_response):
        """Test bucket creation with default region"""
        bucket_name = "new-bucket"
        expected_response = {"name": bucket_name, "region": "us-east-1"}
        
        mock_storage_client.client.post.return_value = successful_api_response
        successful_api_response.json.return_value = expected_response
        
        result = await mock_storage_client.create_bucket(bucket_name)
        
        assert result == expected_response
        mock_storage_client.client.post.assert_called_once_with(
            "/api/v1/buckets",
            json={"name": bucket_name, "region": "us-east-1"}
        )
    
    @pytest.mark.asyncio
    async def test_create_bucket_api_error(self, mock_storage_client, error_api_response):
        """Test bucket creation with API error"""
        bucket_name = "new-bucket"
        mock_storage_client.client.post.return_value = error_api_response
        
        result = await mock_storage_client.create_bucket(bucket_name)
        
        assert result is None
        mock_storage_client.client.post.assert_called_once_with(
            "/api/v1/buckets",
            json={"name": bucket_name, "region": "us-east-1"}
        )
    
    @pytest.mark.asyncio
    async def test_delete_bucket_success(self, mock_storage_client, successful_api_response):
        """Test successful bucket deletion"""
        bucket_name = "test-bucket"
        mock_storage_client.client.delete.return_value = successful_api_response
        successful_api_response.status_code = 200
        
        result = await mock_storage_client.delete_bucket(bucket_name)
        
        assert result is True
        mock_storage_client.client.delete.assert_called_once_with(f"/api/v1/buckets/{bucket_name}")
    
    @pytest.mark.asyncio
    async def test_delete_bucket_failure(self, mock_storage_client, successful_api_response):
        """Test bucket deletion failure"""
        bucket_name = "test-bucket"
        mock_storage_client.client.delete.return_value = successful_api_response
        successful_api_response.status_code = 404
        
        result = await mock_storage_client.delete_bucket(bucket_name)
        
        assert result is False
        mock_storage_client.client.delete.assert_called_once_with(f"/api/v1/buckets/{bucket_name}")
    
    @pytest.mark.asyncio
    async def test_delete_bucket_api_error(self, mock_storage_client, error_api_response):
        """Test bucket deletion with API error"""
        bucket_name = "test-bucket"
        mock_storage_client.client.delete.return_value = error_api_response
        
        result = await mock_storage_client.delete_bucket(bucket_name)
        
        assert result is False
        mock_storage_client.client.delete.assert_called_once_with(f"/api/v1/buckets/{bucket_name}")
    
    @pytest.mark.asyncio
    async def test_delete_object_success(self, mock_storage_client, successful_api_response):
        """Test successful object deletion"""
        bucket_name = "test-bucket"
        object_key = "test-file.txt"
        mock_storage_client.client.delete.return_value = successful_api_response
        successful_api_response.status_code = 200
        
        result = await mock_storage_client.delete_object(bucket_name, object_key)
        
        assert result is True
        mock_storage_client.client.delete.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}"
        )
    
    @pytest.mark.asyncio
    async def test_delete_object_failure(self, mock_storage_client, successful_api_response):
        """Test object deletion failure"""
        bucket_name = "test-bucket"
        object_key = "test-file.txt"
        mock_storage_client.client.delete.return_value = successful_api_response
        successful_api_response.status_code = 404
        
        result = await mock_storage_client.delete_object(bucket_name, object_key)
        
        assert result is False
        mock_storage_client.client.delete.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}"
        )
    
    @pytest.mark.asyncio
    async def test_get_download_url_success(self, mock_storage_client, successful_api_response):
        """Test successful download URL generation"""
        bucket_name = "test-bucket"
        object_key = "test-file.txt"
        download_url = "https://presigned-url.example.com/file.txt"
        
        mock_storage_client.client.post.return_value = successful_api_response
        successful_api_response.json.return_value = {"url": download_url}
        
        result = await mock_storage_client.get_download_url(bucket_name, object_key)
        
        assert result == download_url
        mock_storage_client.client.post.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}/download-url"
        )
        successful_api_response.raise_for_status.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_download_url_api_error(self, mock_storage_client, error_api_response):
        """Test download URL generation with API error"""
        bucket_name = "test-bucket"
        object_key = "test-file.txt"
        mock_storage_client.client.post.return_value = error_api_response
        
        result = await mock_storage_client.get_download_url(bucket_name, object_key)
        
        assert result is None
        mock_storage_client.client.post.assert_called_once_with(
            f"/api/v1/buckets/{bucket_name}/objects/{object_key}/download-url"
        )
