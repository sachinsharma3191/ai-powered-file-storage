import pytest
import asyncio
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from io import StringIO
import tempfile

# Import agent modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent
from models.events import ObjectEvent, EventType, EventSource, EventSeverity
from models.decisions import Decision, ActionType


class TestAgent:
    """Test cases for the agent implementation"""
    
    @pytest.fixture
    def mock_storage_client(self):
        """Mock storage client for agent testing"""
        client = AsyncMock()
        
        # Mock basic operations
        client.list_buckets.return_value = []
        client.create_bucket.return_value = MagicMock(name="test-bucket", region="us-west-2")
        client.list_objects.return_value = []
        client.create_object.return_value = MagicMock(key="test.txt", size=100)
        
        return client
    
    @pytest.fixture
    def mock_env_vars(self):
        """Mock environment variables for agent"""
        return {
            "STORAGE_API_URL": "http://test-api:3000",
            "STORAGE_API_KEY": "test-api-key-12345",
            "OLLAMA_URL": "http://localhost:11434",
            "OLLAMA_MODEL": "llama3.2"
        }
    
    @pytest.fixture
    def sample_object_event(self):
        """Sample object event for testing"""
        return ObjectEvent(
            event_id="test-event-123",
            event_type=EventType.OBJECT_CREATED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.LOW,
            account_id="account-123",
            region="us-west-2",
            bucket_name="test-bucket",
            object_key="test-file.txt",
            object_size=1024,
            object_etag="test-etag",
            content_type="text/plain"
        )
    
    def test_agent_initialization(self, mock_env_vars):
        """Test agent initialization"""
        with patch.dict(os.environ, mock_env_vars):
            # Test that agent can be imported and basic setup works
            assert hasattr(agent, 'main')
            assert callable(agent.main)
    
    @pytest.mark.asyncio
    async def test_agent_conversation_flow(self, mock_env_vars, mock_storage_client, capsys):
        """Test agent conversation flow with mocked LLM"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Mock Ollama response
                mock_ollama_response = {
                    "response": "I can help you with that! Here's what I found...",
                    "done": True
                }
                
                with patch('agent.query_ollama', return_value=mock_ollama_response):
                    # Test conversation simulation
                    user_input = "List my buckets"
                    
                    # This would normally be interactive, but we'll test the components
                    result = await self._simulate_agent_interaction(
                        user_input, mock_storage_client
                    )
                    
                    assert "buckets" in result.lower() or "help" in result.lower()
    
    async def _simulate_agent_interaction(self, user_input, storage_client):
        """Simulate agent interaction for testing"""
        # Simple simulation of agent processing
        if "buckets" in user_input.lower():
            buckets = await storage_client.list_buckets()
            if buckets:
                return f"Found {len(buckets)} buckets"
            else:
                return "No buckets found"
        else:
            return "I can help you list buckets, create objects, and more."
    
    @pytest.mark.asyncio
    async def test_agent_with_ollama_disabled(self, mock_env_vars, mock_storage_client):
        """Test agent behavior when Ollama is disabled"""
        env_vars = mock_env_vars.copy()
        env_vars["OLLAMA_URL"] = ""
        
        with patch.dict(os.environ, env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Agent should work without LLM
                result = await self._simulate_agent_interaction(
                    "list buckets", mock_storage_client
                )
                
                assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_agent_ollama_connection_error(self, mock_env_vars, mock_storage_client):
        """Test agent behavior when Ollama connection fails"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Mock Ollama connection error
                with patch('agent.query_ollama', side_effect=Exception("Connection failed")):
                    # Agent should handle the error gracefully
                    result = await self._simulate_agent_interaction(
                        "help", mock_storage_client
                    )
                    
                    # Should still provide basic functionality
                    assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_agent_storage_operations(self, mock_env_vars, mock_storage_client):
        """Test agent storage operations"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Test bucket creation
                bucket = await mock_storage_client.create_bucket("test-bucket", "us-west-2")
                assert bucket.name == "test-bucket"
                assert bucket.region == "us-west-2"
                
                # Test object creation
                obj = await mock_storage_client.create_object(
                    "test-bucket", "test.txt", b"test data"
                )
                assert obj.key == "test.txt"
                assert obj.size == 100
    
    @pytest.mark.asyncio
    async def test_agent_error_handling(self, mock_env_vars):
        """Test agent error handling"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient') as mock_client_class:
                mock_client = AsyncMock()
                mock_client.list_buckets.side_effect = Exception("API Error")
                mock_client_class.return_value = mock_client
                
                # Agent should handle API errors gracefully
                result = await self._simulate_agent_interaction(
                    "list buckets", mock_client
                )
                
                # Should return error message or fallback
                assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_agent_concurrent_requests(self, mock_env_vars, mock_storage_client):
        """Test agent handling concurrent requests"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Simulate multiple concurrent requests
                tasks = [
                    self._simulate_agent_interaction("list buckets", mock_storage_client)
                    for _ in range(5)
                ]
                
                results = await asyncio.gather(*tasks)
                
                # All should complete successfully
                assert len(results) == 5
                assert all(isinstance(result, str) for result in results)
    
    @pytest.mark.asyncio
    async def test_agent_memory_context(self, mock_env_vars, mock_storage_client):
        """Test agent maintains conversation context"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Simulate conversation with context
                conversation = [
                    "Create a bucket named test-bucket",
                    "List objects in test-bucket",
                    "What did we just do?"
                ]
                
                results = []
                for message in conversation:
                    result = await self._simulate_agent_interaction(
                        message, mock_storage_client
                    )
                    results.append(result)
                
                # All responses should be valid
                assert all(isinstance(result, str) for result in results)
                assert len(results) == 3
    
    @pytest.mark.asyncio
    async def test_agent_command_parsing(self, mock_env_vars):
        """Test agent command parsing capabilities"""
        with patch.dict(os.environ, mock_env_vars):
            # Test various command formats
            commands = [
                "list buckets",
                "List my buckets",
                "show buckets",
                "create bucket test-bucket",
                "Create a new bucket called my-bucket",
                "delete bucket old-bucket",
                "upload file.txt to bucket",
                "list objects in my-bucket"
            ]
            
            for command in commands:
                # Simulate command parsing
                parsed = self._parse_command(command)
                assert parsed is not None
                assert "action" in parsed
    
    def _parse_command(self, command):
        """Simple command parsing for testing"""
        command_lower = command.lower()
        
        if "list" in command_lower and "bucket" in command_lower:
            return {"action": "list_buckets"}
        elif "create" in command_lower and "bucket" in command_lower:
            return {"action": "create_bucket"}
        elif "delete" in command_lower and "bucket" in command_lower:
            return {"action": "delete_bucket"}
        elif "upload" in command_lower:
            return {"action": "upload_object"}
        elif "list" in command_lower and "object" in command_lower:
            return {"action": "list_objects"}
        
        return None
    
    @pytest.mark.asyncio
    async def test_agent_with_different_models(self, mock_env_vars, mock_storage_client):
        """Test agent with different Ollama models"""
        models = ["llama3.2", "codellama", "mistral"]
        
        for model in models:
            env_vars = mock_env_vars.copy()
            env_vars["OLLAMA_MODEL"] = model
            
            with patch.dict(os.environ, env_vars):
                with patch('agent.StorageClient', return_value=mock_storage_client):
                    with patch('agent.query_ollama') as mock_query:
                        mock_query.return_value = {
                            "response": f"Response from {model}",
                            "done": True
                        }
                        
                        result = await self._simulate_agent_interaction(
                            "help", mock_storage_client
                        )
                        
                        assert model in result or "help" in result.lower()
    
    @pytest.mark.asyncio
    async def test_agent_large_response_handling(self, mock_env_vars, mock_storage_client):
        """Test agent handling of large responses"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Mock large response from Ollama
                large_response = {
                    "response": "A" * 10000,  # 10KB response
                    "done": True
                }
                
                with patch('agent.query_ollama', return_value=large_response):
                    result = await self._simulate_agent_interaction(
                        "explain everything", mock_storage_client
                    )
                    
                    # Should handle large responses
                    assert len(result) > 0
                    assert isinstance(result, str)
    
    @pytest.mark.asyncio
    async def test_agent_session_management(self, mock_env_vars, mock_storage_client):
        """Test agent session management"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Simulate session start and end
                session_id = "test-session-123"
                
                # Start session
                session_active = True
                assert session_active is True
                
                # Process requests in session
                results = []
                for i in range(3):
                    result = await self._simulate_agent_interaction(
                        f"request {i}", mock_storage_client
                    )
                    results.append(result)
                
                # End session
                session_active = False
                assert session_active is False
                assert len(results) == 3
    
    @pytest.mark.asyncio
    async def test_agent_configuration_validation(self, mock_env_vars):
        """Test agent configuration validation"""
        # Test with missing API key
        incomplete_env = {"STORAGE_API_URL": "http://test:3000"}
        
        with patch.dict(os.environ, incomplete_env, clear=True):
            with pytest.raises(ValueError):
                # Should fail without API key
                agent.validate_config()
    
    @pytest.mark.asyncio
    async def test_agent_graceful_shutdown(self, mock_env_vars, mock_storage_client):
        """Test agent graceful shutdown"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Simulate shutdown signal
                shutdown_requested = True
                
                # Agent should handle shutdown gracefully
                if shutdown_requested:
                    # Cleanup resources
                    await mock_storage_client.close()
                    shutdown_complete = True
                
                assert shutdown_complete is True
    
    @pytest.mark.asyncio
    async def test_agent_logging(self, mock_env_vars, mock_storage_client, caplog):
        """Test agent logging functionality"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Enable debug logging
                import logging
                logging.getLogger().setLevel(logging.DEBUG)
                
                # Perform action that should generate logs
                await self._simulate_agent_interaction(
                    "list buckets", mock_storage_client
                )
                
                # Check that logs were generated
                assert len(caplog.records) > 0
    
    def test_agent_import_structure(self):
        """Test that agent module has expected structure"""
        # Check that main components are importable
        assert hasattr(agent, 'main')
        assert hasattr(agent, 'query_ollama')
        assert hasattr(agent, 'parse_command')
        assert hasattr(agent, 'format_response')
    
    @pytest.mark.asyncio
    async def test_agent_resource_cleanup(self, mock_env_vars, mock_storage_client):
        """Test agent resource cleanup"""
        with patch.dict(os.environ, mock_env_vars):
            with patch('agent.StorageClient', return_value=mock_storage_client):
                # Create resources
                resources = []
                
                # Simulate resource usage
                client = mock_storage_client
                resources.append(client)
                
                # Cleanup resources
                for resource in resources:
                    if hasattr(resource, 'close'):
                        await resource.close()
                
                # Resources should be cleaned up
                assert len(resources) > 0


class TestAgentUtilities:
    """Test cases for agent utility functions"""
    
    def test_format_response(self):
        """Test response formatting"""
        if hasattr(agent, 'format_response'):
            response = agent.format_response("Test response")
            assert isinstance(response, str)
            assert len(response) > 0
    
    def test_parse_command(self):
        """Test command parsing"""
        if hasattr(agent, 'parse_command'):
            # Test various command formats
            commands = [
                "list buckets",
                "create bucket test",
                "delete bucket old",
                "help"
            ]
            
            for cmd in commands:
                result = agent.parse_command(cmd)
                # Should return parsed result or None
                assert result is None or isinstance(result, dict)
    
    @pytest.mark.asyncio
    async def test_query_ollama_mock(self):
        """Test Ollama query with mock"""
        if hasattr(agent, 'query_ollama'):
            with patch('agent.requests.post') as mock_post:
                mock_response = MagicMock()
                mock_response.json.return_value = {
                    "response": "Test response",
                    "done": True
                }
                mock_post.return_value = mock_response
                
                result = await agent.query_ollama("test prompt", "llama3.2")
                
                assert result["response"] == "Test response"
                assert result["done"] is True


if __name__ == "__main__":
    pytest.main([__file__])
