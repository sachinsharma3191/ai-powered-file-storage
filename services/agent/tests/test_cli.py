import pytest
import asyncio
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from io import StringIO
import argparse

# Import CLI modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import cli
from storage_client import Bucket, Object


class TestCLI:
    """Test cases for the CLI implementation"""
    
    @pytest.fixture
    def mock_storage_client(self):
        """Mock storage client for CLI testing"""
        client = AsyncMock()
        
        # Mock bucket operations
        client.list_buckets.return_value = [
            Bucket(name="test-bucket-1", region="us-west-2", versioning=True),
            Bucket(name="test-bucket-2", region="us-east-1", versioning=False),
        ]
        
        client.create_bucket.return_value = Bucket(
            name="new-bucket", region="us-west-2", versioning=False
        )
        
        # Mock object operations
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
        """Mock environment variables for CLI"""
        return {
            "STORAGE_API_URL": "http://test-api:3000",
            "STORAGE_API_KEY": "test-api-key-12345"
        }
    
    def test_parse_args_list_buckets(self):
        """Test argument parsing for list-buckets command"""
        args = cli.parse_args(["list-buckets"])
        
        assert args.command == "list-buckets"
        assert args.api_key is None
        assert args.api_url is None
    
    def test_parse_args_create_bucket(self):
        """Test argument parsing for create-bucket command"""
        args = cli.parse_args([
            "create-bucket", 
            "--api-key", "test-key",
            "--api-url", "http://localhost:3000",
            "my-bucket",
            "--region", "us-east-1"
        ])
        
        assert args.command == "create-bucket"
        assert args.name == "my-bucket"
        assert args.region == "us-east-1"
        assert args.api_key == "test-key"
        assert args.api_url == "http://localhost:3000"
    
    def test_parse_args_create_bucket_default_region(self):
        """Test create-bucket with default region"""
        args = cli.parse_args(["create-bucket", "my-bucket"])
        
        assert args.command == "create-bucket"
        assert args.name == "my-bucket"
        assert args.region == "us-west-2"  # Default region
    
    def test_parse_args_delete_bucket(self):
        """Test argument parsing for delete-bucket command"""
        args = cli.parse_args(["delete-bucket", "old-bucket"])
        
        assert args.command == "delete-bucket"
        assert args.name == "old-bucket"
    
    def test_parse_args_list_objects(self):
        """Test argument parsing for list-objects command"""
        args = cli.parse_args(["list-objects", "my-bucket"])
        
        assert args.command == "list-objects"
        assert args.bucket_name == "my-bucket"
    
    def test_parse_args_upload_file(self):
        """Test argument parsing for upload with file"""
        args = cli.parse_args([
            "upload", "my-bucket", 
            "--file", "/path/to/file.txt"
        ])
        
        assert args.command == "upload"
        assert args.bucket_name == "my-bucket"
        assert args.file == "/path/to/file.txt"
        assert args.key is None
        assert args.data is None
    
    def test_parse_args_upload_data(self):
        """Test argument parsing for upload with data"""
        args = cli.parse_args([
            "upload", "my-bucket",
            "--key", "remote-file.txt",
            "--data", "Hello, World!"
        ])
        
        assert args.command == "upload"
        assert args.bucket_name == "my-bucket"
        assert args.key == "remote-file.txt"
        assert args.data == "Hello, World!"
        assert args.file is None
    
    def test_parse_args_delete_object(self):
        """Test argument parsing for delete-object command"""
        args = cli.parse_args([
            "delete-object", "my-bucket", "old-file.txt"
        ])
        
        assert args.command == "delete-object"
        assert args.bucket_name == "my-bucket"
        assert args.key == "old-file.txt"
    
    def test_parse_args_invalid_command(self):
        """Test argument parsing with invalid command"""
        with pytest.raises(SystemExit):
            cli.parse_args(["invalid-command"])
    
    def test_parse_args_upload_missing_args(self):
        """Test upload command with missing required arguments"""
        with pytest.raises(SystemExit):
            cli.parse_args(["upload", "my-bucket"])
    
    @pytest.mark.asyncio
    async def test_list_buckets_command(self, mock_storage_client, mock_env_vars, capsys):
        """Test list-buckets command execution"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args(["list-buckets"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "test-bucket-1" in output
                assert "test-bucket-2" in output
                assert "us-west-2" in output
                assert "us-east-1" in output
                assert "✓" in output  # Versioning indicator
    
    @pytest.mark.asyncio
    async def test_create_bucket_command(self, mock_storage_client, mock_env_vars, capsys):
        """Test create-bucket command execution"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args(["create-bucket", "new-bucket", "--region", "us-west-2"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Created bucket 'new-bucket'" in output
                assert "us-west-2" in output
                
                mock_storage_client.create_bucket.assert_called_once_with(
                    name="new-bucket", region="us-west-2"
                )
    
    @pytest.mark.asyncio
    async def test_delete_bucket_command(self, mock_storage_client, mock_env_vars, capsys):
        """Test delete-bucket command execution"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args(["delete-bucket", "old-bucket"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Deleted bucket 'old-bucket'" in output
                mock_storage_client.delete_bucket.assert_called_once_with("old-bucket")
    
    @pytest.mark.asyncio
    async def test_list_objects_command(self, mock_storage_client, mock_env_vars, capsys):
        """Test list-objects command execution"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args(["list-objects", "test-bucket"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "file1.txt" in output
                assert "file2.txt" in output
                assert "1024 B" in output
                assert "2048 B" in output
                assert "active" in output
    
    @pytest.mark.asyncio
    async def test_upload_file_command(self, mock_storage_client, mock_env_vars, tmp_path, capsys):
        """Test upload command with file"""
        # Create a temporary file
        test_file = tmp_path / "test.txt"
        test_content = "Hello, World from file!"
        test_file.write_text(test_content)
        
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args([
                    "upload", "test-bucket", 
                    "--file", str(test_file)
                ])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Uploaded 'test.txt'" in output
                assert f"{len(test_content)} B" in output
                
                # Verify the file content was uploaded
                expected_data = test_content.encode('utf-8')
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="test.txt",
                    data=expected_data
                )
    
    @pytest.mark.asyncio
    async def test_upload_data_command(self, mock_storage_client, mock_env_vars, capsys):
        """Test upload command with data"""
        test_data = "Hello, World from data!"
        
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args([
                    "upload", "test-bucket",
                    "--key", "remote.txt",
                    "--data", test_data
                ])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Uploaded 'remote.txt'" in output
                assert f"{len(test_data)} B" in output
                
                expected_data = test_data.encode('utf-8')
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="remote.txt",
                    data=expected_data
                )
    
    @pytest.mark.asyncio
    async def test_delete_object_command(self, mock_storage_client, mock_env_vars, capsys):
        """Test delete-object command execution"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args([
                    "delete-object", "test-bucket", "old-file.txt"
                ])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Deleted object 'old-file.txt'" in output
                assert "from bucket 'test-bucket'" in output
                
                mock_storage_client.delete_object.assert_called_once_with(
                    "test-bucket", "old-file.txt"
                )
    
    @pytest.mark.asyncio
    async def test_command_error_handling(self, mock_env_vars, capsys):
        """Test error handling in commands"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient') as mock_client_class:
                mock_client = AsyncMock()
                mock_client.list_buckets.side_effect = Exception("API Error")
                mock_client_class.return_value = mock_client
                
                args = cli.parse_args(["list-buckets"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Error: API Error" in output
    
    @pytest.mark.asyncio
    async def test_file_not_found_error(self, mock_env_vars, capsys):
        """Test handling of file not found error"""
        with patch.dict(os.environ, mock_env_vars):
            args = cli.parse_args([
                "upload", "test-bucket",
                "--file", "/nonexistent/file.txt"
            ])
            
            await cli.handle_command(args)
            
            captured = capsys.readouterr()
            output = captured.out
            
            assert "Error: File not found" in output or "No such file" in output
    
    @pytest.mark.asyncio
    async def test_empty_bucket_list(self, mock_storage_client, mock_env_vars, capsys):
        """Test listing empty bucket list"""
        mock_storage_client.list_buckets.return_value = []
        
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args(["list-buckets"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "No buckets found" in output
    
    @pytest.mark.asyncio
    async def test_empty_object_list(self, mock_storage_client, mock_env_vars, capsys):
        """Test listing empty object list"""
        mock_storage_client.list_objects.return_value = []
        
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args(["list-objects", "empty-bucket"])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "No objects found" in output
    
    def test_format_size(self):
        """Test size formatting function"""
        assert cli.format_size(0) == "0 B"
        assert cli.format_size(512) == "512 B"
        assert cli.format_size(1024) == "1.0 KB"
        assert cli.format_size(1536) == "1.5 KB"
        assert cli.format_size(1024 * 1024) == "1.0 MB"
        assert cli.format_size(1024 * 1024 * 1024) == "1.0 GB"
    
    def test_format_size_large(self):
        """Test formatting large sizes"""
        assert cli.format_size(2 * 1024 * 1024 * 1024) == "2.0 GB"
        assert cli.format_size(1.5 * 1024 * 1024) == "1.5 MB"
    
    @pytest.mark.asyncio
    async def test_upload_binary_file(self, mock_storage_client, mock_env_vars, tmp_path, capsys):
        """Test uploading binary file"""
        # Create binary file
        binary_file = tmp_path / "binary.bin"
        binary_data = bytes(range(256))  # Binary data
        binary_file.write_bytes(binary_data)
        
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args([
                    "upload", "test-bucket",
                    "--file", str(binary_file)
                ])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Uploaded 'binary.bin'" in output
                assert f"{len(binary_data)} B" in output
                
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="binary.bin",
                    data=binary_data
                )
    
    @pytest.mark.asyncio
    async def test_unicode_file_content(self, mock_storage_client, mock_env_vars, tmp_path, capsys):
        """Test uploading file with unicode content"""
        unicode_file = tmp_path / "unicode.txt"
        unicode_content = "Hello 世界! 🌍"
        unicode_file.write_text(unicode_content, encoding='utf-8')
        
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.StorageClient', return_value=mock_storage_client):
                args = cli.parse_args([
                    "upload", "test-bucket",
                    "--file", str(unicode_file)
                ])
                await cli.handle_command(args)
                
                captured = capsys.readouterr()
                output = captured.out
                
                assert "Uploaded 'unicode.txt'" in output
                
                expected_data = unicode_content.encode('utf-8')
                mock_storage_client.create_object.assert_called_once_with(
                    bucket_name="test-bucket",
                    key="unicode.txt",
                    data=expected_data
                )
    
    @pytest.mark.asyncio
    async def test_custom_api_key_and_url(self, mock_storage_client, capsys):
        """Test using custom API key and URL"""
        with patch('cli.StorageClient', return_value=mock_storage_client) as mock_client_class:
            args = cli.parse_args([
                "list-buckets",
                "--api-key", "custom-key",
                "--api-url", "http://custom-api:4000"
            ])
            await cli.handle_command(args)
            
            # Verify client was created with custom credentials
            mock_client_class.assert_called_once_with(
                "http://custom-api:4000", "custom-key"
            )
    
    def test_main_function_success(self, mock_env_vars):
        """Test main function with successful execution"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.handle_command') as mock_handle:
                with patch('cli.parse_args', return_value=argparse.Namespace(command="list-buckets")):
                    with patch('sys.argv', ['cli.py', 'list-buckets']):
                        cli.main()
                        
                        mock_handle.assert_called_once()
    
    def test_main_function_keyboard_interrupt(self, mock_env_vars):
        """Test main function handling keyboard interrupt"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.handle_command', side_effect=KeyboardInterrupt()):
                with patch('cli.parse_args', return_value=argparse.Namespace(command="list-buckets")):
                    with patch('sys.argv', ['cli.py', 'list-buckets']):
                        # Should not raise an exception
                        cli.main()
    
    def test_main_function_exception(self, mock_env_vars, capsys):
        """Test main function handling exceptions"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('cli.handle_command', side_effect=Exception("Unexpected error")):
                with patch('cli.parse_args', return_value=argparse.Namespace(command="list-buckets")):
                    with patch('sys.argv', ['cli.py', 'list-buckets']):
                        cli.main()
                        
                        captured = capsys.readouterr()
                        output = captured.err
                        
                        assert "Unexpected error" in output


if __name__ == "__main__":
    pytest.main([__file__])
