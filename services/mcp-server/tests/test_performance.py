"""
Performance and stress tests for MCP server
"""

import pytest
import pytest_asyncio
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch
from concurrent.futures import ThreadPoolExecutor

from main import server, StorageClient, StorageConfig


@pytest.mark.slow
@pytest.mark.performance
class TestMCPServerPerformance:
    """Performance tests for MCP server"""
    
    @pytest.mark.asyncio
    async def test_concurrent_tool_calls_performance(self, mock_environment_variables):
        """Test performance under concurrent tool calls"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup mock responses
            mock_client.list_buckets.return_value = [
                {"name": f"bucket-{i}", "region": "us-east-1"} for i in range(100)
            ]
            mock_client.list_objects.return_value = [
                {"key": f"file-{j}.txt", "size": 100} for j in range(50)
            ]
            
            # Measure performance of concurrent operations
            start_time = time.time()
            
            tasks = []
            for i in range(20):  # 20 concurrent operations
                tasks.extend([
                    server.call_tool("list_buckets", {}),
                    server.call_tool("list_objects", {"bucket": f"bucket-{i % 5}"})
                ])
            
            results = await asyncio.gather(*tasks)
            
            end_time = time.time()
            execution_time = end_time - start_time
            
            # Verify all operations succeeded
            assert all(not result.isError for result in results)
            
            # Performance assertion (should complete within reasonable time)
            assert execution_time < 5.0, f"Too slow: {execution_time:.2f}s"
            
            # Calculate operations per second
            ops_per_second = len(tasks) / execution_time
            assert ops_per_second > 10, f"Too few ops/sec: {ops_per_second:.2f}"
    
    @pytest.mark.asyncio
    async def test_large_dataset_handling(self, mock_environment_variables):
        """Test handling of large datasets"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Simulate large dataset
            large_bucket_list = [
                {"name": f"large-bucket-{i}", "region": "us-east-1", "size": i * 1000}
                for i in range(1000)
            ]
            large_object_list = [
                {"key": f"path/to/very/long/file/name/{j}/file-{j}.txt", "size": j * 10}
                for j in range(2000)
            ]
            
            mock_client.list_buckets.return_value = large_bucket_list
            mock_client.list_objects.return_value = large_object_list
            
            # Test large bucket list performance
            start_time = time.time()
            resources = await server.list_resources()
            bucket_time = time.time() - start_time
            
            assert len(resources) == 1000
            assert bucket_time < 2.0, f"Bucket listing too slow: {bucket_time:.2f}s"
            
            # Test large object list performance
            start_time = time.time()
            result = await server.call_tool("list_objects", {"bucket": "large-bucket-1"})
            object_time = time.time() - start_time
            
            assert not result.isError
            assert object_time < 2.0, f"Object listing too slow: {object_time:.2f}s"
    
    @pytest.mark.asyncio
    async def test_search_performance_with_large_dataset(self, mock_environment_variables):
        """Test search performance with large object lists"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Create large dataset for search testing
            large_object_list = [
                {"key": f"dir{i}/file{j}.txt", "size": 100}
                for i in range(100) for j in range(100)
            ]  # 10,000 objects
            
            mock_client.list_objects.return_value = large_object_list
            
            # Test search performance
            patterns = ["*.txt", "dir1/*", "*/file50.txt", "*"]
            
            for pattern in patterns:
                start_time = time.time()
                result = await server.call_tool("search_objects", {
                    "bucket": "test-bucket",
                    "pattern": pattern,
                    "limit": 100
                })
                search_time = time.time() - start_time
                
                assert not result.isError
                assert search_time < 1.0, f"Search with pattern '{pattern}' too slow: {search_time:.2f}s"
    
    @pytest.mark.asyncio
    async def test_memory_usage_stability(self, mock_environment_variables):
        """Test memory usage stability under load"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss
        
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup responses
            mock_client.list_buckets.return_value = [
                {"name": f"bucket-{i}", "region": "us-east-1"} for i in range(100)
            ]
            mock_client.list_objects.return_value = [
                {"key": f"file-{j}.txt", "size": 100} for j in range(200)
            ]
            
            # Run many operations to test memory stability
            for iteration in range(10):
                tasks = [
                    server.call_tool("list_buckets", {}),
                    server.call_tool("list_objects", {"bucket": "test-bucket"}),
                    server.call_tool("search_objects", {
                        "bucket": "test-bucket",
                        "pattern": "*.txt",
                        "limit": 50
                    })
                ]
                
                await asyncio.gather(*tasks)
                
                # Check memory usage
                current_memory = process.memory_info().rss
                memory_growth = current_memory - initial_memory
                
                # Memory growth should be reasonable (less than 50MB)
                assert memory_growth < 50 * 1024 * 1024, f"Memory growth too high: {memory_growth / 1024 / 1024:.2f}MB"


@pytest.mark.slow
@pytest.mark.stress
class TestMCPServerStress:
    """Stress tests for MCP server"""
    
    @pytest.mark.asyncio
    async def test_high_concurrency_stress(self, mock_environment_variables):
        """Test server under high concurrency"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup fast mock responses
            mock_client.list_buckets.return_value = [{"name": "bucket", "region": "us-east-1"}]
            mock_client.list_objects.return_value = [{"key": "file.txt", "size": 100}]
            mock_client.get_object_metadata.return_value = {"content-type": "text/plain"}
            mock_client.get_download_url.return_value = "http://example.com/file.txt"
            
            # Stress test with 100 concurrent operations
            tasks = []
            for i in range(100):
                tasks.append(server.call_tool("list_buckets", {}))
                tasks.append(server.call_tool("list_objects", {"bucket": "bucket"}))
                tasks.append(server.call_tool("get_object_info", {"bucket": "bucket", "key": "file.txt"}))
                tasks.append(server.call_tool("get_download_url", {"bucket": "bucket", "key": "file.txt"}))
            
            start_time = time.time()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            end_time = time.time()
            
            # Verify all operations completed successfully
            exceptions = [r for r in results if isinstance(r, Exception)]
            errors = [r for r in results if hasattr(r, 'isError') and r.isError]
            
            assert len(exceptions) == 0, f"Exceptions occurred: {exceptions}"
            assert len(errors) == 0, f"Errors occurred: {len(errors)}"
            
            # Performance should remain reasonable under stress
            total_time = end_time - start_time
            assert total_time < 10.0, f"Stress test too slow: {total_time:.2f}s"
            
            ops_per_second = len(tasks) / total_time
            assert ops_per_second > 40, f"Performance degraded under stress: {ops_per_second:.2f} ops/sec"
    
    @pytest.mark.asyncio
    async def test_sustained_load_stress(self, mock_environment_variables):
        """Test server under sustained load"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Setup responses
            mock_client.list_buckets.return_value = [
                {"name": f"bucket-{i}", "region": "us-east-1"} for i in range(10)
            ]
            mock_client.list_objects.return_value = [
                {"key": f"file-{j}.txt", "size": 100} for j in range(20)
            ]
            
            # Run sustained load for multiple iterations
            iterations = 20
            operations_per_iteration = 50
            
            total_start_time = time.time()
            
            for iteration in range(iterations):
                iteration_start = time.time()
                
                tasks = []
                for i in range(operations_per_iteration):
                    bucket_id = i % 10
                    tasks.extend([
                        server.call_tool("list_buckets", {}),
                        server.call_tool("list_objects", {"bucket": f"bucket-{bucket_id}"}),
                        server.call_tool("search_objects", {
                            "bucket": f"bucket-{bucket_id}",
                            "pattern": "*.txt",
                            "limit": 10
                        })
                    ])
                
                results = await asyncio.gather(*tasks)
                
                iteration_time = time.time() - iteration_start
                
                # Verify all operations succeeded
                assert all(not result.isError for result in results)
                
                # Performance should not degrade significantly over time
                assert iteration_time < 2.0, f"Iteration {iteration} too slow: {iteration_time:.2f}s"
            
            total_time = time.time() - total_start_time
            total_operations = iterations * operations_per_iteration * 3  # 3 tools per operation
            avg_ops_per_second = total_operations / total_time
            
            assert avg_ops_per_second > 30, f"Sustained load performance degraded: {avg_ops_per_second:.2f} ops/sec"
    
    @pytest.mark.asyncio
    async def test_error_handling_under_stress(self, mock_environment_variables):
        """Test error handling stability under stress"""
        with patch('main.StorageClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_client_class.return_value = mock_client
            
            # Mix of successful and failing operations
            def side_effect(*args, **kwargs):
                import random
                if random.random() < 0.1:  # 10% failure rate
                    raise Exception("Random failure")
                return [{"name": "bucket", "region": "us-east-1"}]
            
            mock_client.list_buckets.side_effect = side_effect
            mock_client.list_objects.return_value = []
            
            # Run many operations with expected failures
            tasks = [server.call_tool("list_buckets", {}) for _ in range(200)]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Count results
            exceptions = [r for r in results if isinstance(r, Exception)]
            errors = [r for r in results if hasattr(r, 'isError') and r.isError]
            successes = [r for r in results if not hasattr(r, 'isError') or not r.isError]
            
            # Should handle errors gracefully
            assert len(exceptions) == 0, f"Unhandled exceptions: {len(exceptions)}"
            assert len(errors) > 0, "Expected some errors under stress"
            assert len(successes) > 0, "Should have some successes"
            
            # Total operations should complete
            assert len(results) == 200


@pytest.mark.performance
class TestStorageClientPerformance:
    """Performance tests for StorageClient"""
    
    @pytest.mark.asyncio
    async def test_client_connection_pooling(self, mock_storage_config):
        """Test that client efficiently handles multiple requests"""
        with patch('main.httpx.AsyncClient') as mock_client_factory:
            mock_client = AsyncMock()
            mock_client_factory.return_value = mock_client
            
            client = StorageClient(mock_storage_config)
            
            # Setup response
            response = MagicMock()
            response.status_code = 200
            response.json.return_value = {"buckets": []}
            mock_client.get.return_value = response
            
            # Make many concurrent requests
            tasks = [client.list_buckets() for _ in range(50)]
            await asyncio.gather(*tasks)
            
            # Should reuse the same client instance
            assert mock_client_factory.call_count == 1
            assert mock_client.get.call_count == 50
    
    @pytest.mark.asyncio
    async def test_client_timeout_handling(self, mock_storage_config):
        """Test client timeout handling under load"""
        with patch('main.httpx.AsyncClient') as mock_client_factory:
            mock_client = AsyncMock()
            mock_client_factory.return_value = mock_client
            
            client = StorageClient(mock_storage_config)
            
            # Simulate timeout for some requests
            import httpx
            def side_effect(*args, **kwargs):
                import random
                if random.random() < 0.3:  # 30% timeout rate
                    raise httpx.TimeoutException("Request timeout")
                response = MagicMock()
                response.status_code = 200
                response.json.return_value = {"buckets": []}
                return response
            
            mock_client.get.side_effect = side_effect
            
            # Make requests and measure handling
            tasks = [client.list_buckets() for _ in range(30)]
            results = await asyncio.gather(*tasks)
            
            # Should handle timeouts gracefully
            empty_results = [r for r in results if r == []]
            assert len(empty_results) > 0, "Should handle some timeouts"
            assert len(results) == 30, "All requests should complete"
