import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
import aiohttp

from core.action_executor import (
    ActionExecutor, ActionConfig, ActionType, ExecutionStatus, ActionResult,
    StorageActionExecutor, SecurityActionExecutor, PerformanceActionExecutor
)
from models.decisions import Action, NotificationMessage
from models.events import ObjectEvent, EventType, EventSource, EventSeverity


class TestActionConfig:
    """Test cases for ActionConfig"""
    
    def test_action_config_creation(self):
        """Test action configuration creation"""
        config = ActionConfig(
            ruby_api_url="http://ruby-api:3000",
            rust_api_url="http://rust-api:4000",
            api_key="test-api-key",
            api_timeout=30,
            max_concurrent_actions=10,
            retry_attempts=3,
            retry_delay=2
        )
        
        assert config.ruby_api_url == "http://ruby-api:3000"
        assert config.rust_api_url == "http://rust-api:4000"
        assert config.api_key == "test-api-key"
        assert config.api_timeout == 30
        assert config.max_concurrent_actions == 10
    
    def test_action_config_defaults(self):
        """Test action configuration with defaults"""
        config = ActionConfig()
        
        assert config.ruby_api_url == "http://localhost:3000"
        assert config.rust_api_url == "http://localhost:4000"
        assert config.api_timeout == 10
        assert config.max_concurrent_actions == 5
        assert config.retry_attempts == 2
        assert config.retry_delay == 1


class TestActionResult:
    """Test cases for ActionResult"""
    
    def test_action_result_creation(self):
        """Test action result creation"""
        result = ActionResult(
            action_id="test-action-123",
            action_type=ActionType.FREEZE_OBJECT,
            status=ExecutionStatus.SUCCESS,
            message="Object frozen successfully",
            metadata={"object_id": "obj-123"}
        )
        
        assert result.action_id == "test-action-123"
        assert result.action_type == ActionType.FREEZE_OBJECT
        assert result.status == ExecutionStatus.SUCCESS
        assert result.message == "Object frozen successfully"
        assert result.metadata["object_id"] == "obj-123"
        assert result.error is None
    
    def test_action_result_with_error(self):
        """Test action result with error"""
        result = ActionResult(
            action_id="failed-action",
            action_type=ActionType.DELETE_OBJECT,
            status=ExecutionStatus.FAILED,
            message="Action failed",
            error="Object not found"
        )
        
        assert result.status == ExecutionStatus.FAILED
        assert result.error == "Object not found"


class TestStorageActionExecutor:
    """Test cases for StorageActionExecutor"""
    
    @pytest.fixture
    def action_config(self):
        """Action configuration for testing"""
        return ActionConfig(
            ruby_api_url="http://test-ruby:3000",
            rust_api_url="http://test-rust:4000",
            api_key="test-key",
            api_timeout=10
        )
    
    @pytest.fixture
    def storage_executor(self, action_config):
        """Create storage action executor for testing"""
        return StorageActionExecutor(action_config)
    
    @pytest.fixture
    def sample_action(self):
        """Sample action for testing"""
        return Action(
            id="storage-action-123",
            action_type=ActionType.FREEZE_OBJECT,
            parameters={
                "bucket_name": "test-bucket",
                "object_key": "test-object.txt",
                "reason": "Security policy violation"
            }
        )
    
    @pytest.mark.asyncio
    async def test_freeze_object_success(self, storage_executor, sample_action):
        """Test successful object freezing"""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "frozen", "object_id": "obj-123"}
            mock_session.post.return_value = mock_response
            
            result = await storage_executor.execute(sample_action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "frozen" in result.message.lower()
            assert result.metadata["object_id"] == "obj-123"
            
            # Verify correct API call
            mock_session.post.assert_called_once()
            call_args = mock_session.post.call_args
            assert "freeze" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_quarantine_object_success(self, storage_executor):
        """Test successful object quarantining"""
        action = Action(
            id="quarantine-action",
            action_type=ActionType.QUARANTINE_OBJECT,
            parameters={
                "bucket_name": "test-bucket",
                "object_key": "suspicious.exe",
                "reason": "Potential malware"
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "quarantined"}
            mock_session.post.return_value = mock_response
            
            result = await storage_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "quarantin" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_compress_object_success(self, storage_executor):
        """Test successful object compression"""
        action = Action(
            id="compress-action",
            action_type=ActionType.COMPRESS_OBJECT,
            parameters={
                "bucket_name": "test-bucket",
                "object_key": "large-file.log",
                "compression_type": "gzip"
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {
                "status": "compressed",
                "original_size": 1048576,
                "compressed_size": 524288
            }
            mock_session.post.return_value = mock_response
            
            result = await storage_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert result.metadata["original_size"] == 1048576
            assert result.metadata["compressed_size"] == 524288
    
    @pytest.mark.asyncio
    async def test_move_to_cold_storage_success(self, storage_executor):
        """Test successful move to cold storage"""
        action = Action(
            id="cold-storage-action",
            action_type=ActionType.MOVE_TO_COLD_STORAGE,
            parameters={
                "bucket_name": "test-bucket",
                "object_key": "archive-data.zip",
                "storage_class": "GLACIER"
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "moved_to_cold"}
            mock_session.post.return_value = mock_response
            
            result = await storage_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "cold" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_delete_old_versions_success(self, storage_executor):
        """Test successful deletion of old versions"""
        action = Action(
            id="cleanup-action",
            action_type=ActionType.DELETE_OLD_VERSIONS,
            parameters={
                "bucket_name": "test-bucket",
                "object_key": "versioned-file.txt",
                "keep_versions": 5
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"deleted_versions": 10}
            mock_session.delete.return_value = mock_response
            
            result = await storage_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert result.metadata["deleted_versions"] == 10
    
    @pytest.mark.asyncio
    async def test_storage_action_api_error(self, storage_executor, sample_action):
        """Test storage action with API error"""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 500
            mock_response.text.return_value = "Internal Server Error"
            mock_session.post.return_value = mock_response
            
            result = await storage_executor.execute(sample_action)
            
            assert result.status == ExecutionStatus.FAILED
            assert "500" in result.error
    
    @pytest.mark.asyncio
    async def test_storage_action_timeout(self, storage_executor, sample_action):
        """Test storage action with timeout"""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_session.post.side_effect = asyncio.TimeoutError("Request timed out")
            
            result = await storage_executor.execute(sample_action)
            
            assert result.status == ExecutionStatus.FAILED
            assert "timed out" in result.error.lower()


class TestSecurityActionExecutor:
    """Test cases for SecurityActionExecutor"""
    
    @pytest.fixture
    def security_executor(self):
        """Create security action executor for testing"""
        config = ActionConfig(
            ruby_api_url="http://test-ruby:3000",
            rust_api_url="http://test-rust:4000",
            api_key="test-key"
        )
        return SecurityActionExecutor(config)
    
    @pytest.mark.asyncio
    async def test_change_acl_success(self, security_executor):
        """Test successful ACL change"""
        action = Action(
            id="acl-action",
            action_type=ActionType.CHANGE_ACL,
            parameters={
                "bucket_name": "test-bucket",
                "new_acl": "private",
                "reason": "Security policy update"
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "acl_updated"}
            mock_session.put.return_value = mock_response
            
            result = await security_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "acl" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_block_ip_success(self, security_executor):
        """Test successful IP blocking"""
        action = Action(
            id="block-ip-action",
            action_type=ActionType.BLOCK_IP,
            parameters={
                "ip_address": "192.168.1.100",
                "duration": 3600,
                "reason": "Suspicious activity detected"
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "ip_blocked"}
            mock_session.post.return_value = mock_response
            
            result = await security_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "blocked" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_enable_mfa_success(self, security_executor):
        """Test successful MFA enablement"""
        action = Action(
            id="mfa-action",
            action_type=ActionType.ENABLE_MFA,
            parameters={
                "user_id": "user-123",
                "enforce": True
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "mfa_enabled"}
            mock_session.post.return_value = mock_response
            
            result = await security_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "mfa" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_suspend_account_success(self, security_executor):
        """Test successful account suspension"""
        action = Action(
            id="suspend-action",
            action_type=ActionType.SUSPEND_ACCOUNT,
            parameters={
                "account_id": "acct-123",
                "reason": "Policy violation",
                "duration": 86400
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "suspended"}
            mock_session.post.return_value = mock_response
            
            result = await security_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "suspend" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_log_security_event_success(self, security_executor):
        """Test successful security event logging"""
        action = Action(
            id="log-action",
            action_type=ActionType.LOG_SECURITY_EVENT,
            parameters={
                "event_type": "unauthorized_access",
                "severity": "high",
                "details": {
                    "ip": "192.168.1.100",
                    "user": "unknown",
                    "resource": "/admin"
                }
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 201
            mock_response.json.return_value = {"event_id": "sec-123"}
            mock_session.post.return_value = mock_response
            
            result = await security_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert result.metadata["event_id"] == "sec-123"


class TestPerformanceActionExecutor:
    """Test cases for PerformanceActionExecutor"""
    
    @pytest.fixture
    def performance_executor(self):
        """Create performance action executor for testing"""
        config = ActionConfig(
            ruby_api_url="http://test-ruby:3000",
            rust_api_url="http://test-rust:4000",
            api_key="test-key"
        )
        return PerformanceActionExecutor(config)
    
    @pytest.mark.asyncio
    async def test_throttle_key_success(self, performance_executor):
        """Test successful API key throttling"""
        action = Action(
            id="throttle-action",
            action_type=ActionType.THROTTLE_KEY,
            parameters={
                "api_key_id": "key-123",
                "requests_per_second": 10,
                "duration": 3600
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "throttled"}
            mock_session.post.return_value = mock_response
            
            result = await performance_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "throttl" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_apply_retention_success(self, performance_executor):
        """Test successful retention policy application"""
        action = Action(
            id="retention-action",
            action_type=ActionType.APPLY_RETENTION,
            parameters={
                "bucket_name": "test-bucket",
                "retention_days": 30,
                "apply_to_existing": True
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {"status": "retention_applied"}
            mock_session.post.return_value = mock_response
            
            result = await performance_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert "retention" in result.message.lower()
    
    @pytest.mark.asyncio
    async def test_scan_for_viruses_success(self, performance_executor):
        """Test successful virus scanning"""
        action = Action(
            id="scan-action",
            action_type=ActionType.SCAN_FOR_VIRUSES,
            parameters={
                "bucket_name": "test-bucket",
                "object_key": "suspicious.exe",
                "scan_engine": "clamav"
            }
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.json.return_value = {
                "status": "scanned",
                "clean": True,
                "scan_id": "scan-123"
            }
            mock_session.post.return_value = mock_response
            
            result = await performance_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert result.metadata["clean"] is True
            assert result.metadata["scan_id"] == "scan-123"


class TestActionExecutor:
    """Test cases for main ActionExecutor"""
    
    @pytest.fixture
    def action_config(self):
        """Action configuration for testing"""
        return ActionConfig(
            ruby_api_url="http://test-ruby:3000",
            rust_api_url="http://test-rust:4000",
            api_key="test-key",
            max_concurrent_actions=3,
            retry_attempts=2,
            retry_delay=0.1
        )
    
    @pytest.fixture
    def action_executor(self, action_config):
        """Create action executor for testing"""
        return ActionExecutor(action_config)
    
    @pytest.fixture
    def sample_actions(self):
        """Sample actions for testing"""
        return [
            Action(
                id="action-1",
                action_type=ActionType.FREEZE_OBJECT,
                parameters={"bucket_name": "test", "object_key": "file1.txt"}
            ),
            Action(
                id="action-2",
                action_type=ActionType.BLOCK_IP,
                parameters={"ip_address": "192.168.1.100"}
            ),
            Action(
                id="action-3",
                action_type=ActionType.THROTTLE_KEY,
                parameters={"api_key_id": "key-123"}
            )
        ]
    
    @pytest.mark.asyncio
    async def test_execute_single_action_success(self, action_executor):
        """Test successful single action execution"""
        action = Action(
            id="test-action",
            action_type=ActionType.FREEZE_OBJECT,
            parameters={"bucket_name": "test", "object_key": "file.txt"}
        )
        
        with patch.object(action_executor.storage_executor, 'execute') as mock_execute:
            mock_result = ActionResult(
                action_id="test-action",
                action_type=ActionType.FREEZE_OBJECT,
                status=ExecutionStatus.SUCCESS,
                message="Object frozen"
            )
            mock_execute.return_value = mock_result
            
            result = await action_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            mock_execute.assert_called_once_with(action)
    
    @pytest.mark.asyncio
    async def test_execute_single_action_retry_success(self, action_executor):
        """Test single action execution with retry success"""
        action = Action(
            id="retry-action",
            action_type=ActionType.FREEZE_OBJECT,
            parameters={"bucket_name": "test", "object_key": "file.txt"}
        )
        
        with patch.object(action_executor.storage_executor, 'execute') as mock_execute:
            # First call fails, second succeeds
            fail_result = ActionResult(
                action_id="retry-action",
                action_type=ActionType.FREEZE_OBJECT,
                status=ExecutionStatus.FAILED,
                error="Temporary failure"
            )
            success_result = ActionResult(
                action_id="retry-action",
                action_type=ActionType.FREEZE_OBJECT,
                status=ExecutionStatus.SUCCESS,
                message="Object frozen"
            )
            mock_execute.side_effect = [fail_result, success_result]
            
            result = await action_executor.execute(action)
            
            assert result.status == ExecutionStatus.SUCCESS
            assert mock_execute.call_count == 2
    
    @pytest.mark.asyncio
    async def test_execute_single_action_max_retries_exceeded(self, action_executor):
        """Test single action execution with max retries exceeded"""
        action = Action(
            id="fail-action",
            action_type=ActionType.FREEZE_OBJECT,
            parameters={"bucket_name": "test", "object_key": "file.txt"}
        )
        
        with patch.object(action_executor.storage_executor, 'execute') as mock_execute:
            fail_result = ActionResult(
                action_id="fail-action",
                action_type=ActionType.FREEZE_OBJECT,
                status=ExecutionStatus.FAILED,
                error="Persistent failure"
            )
            mock_execute.return_value = fail_result
            
            result = await action_executor.execute(action)
            
            assert result.status == ExecutionStatus.FAILED
            assert mock_execute.call_count == 3  # Initial + 2 retries
    
    @pytest.mark.asyncio
    async def test_execute_batch_actions(self, action_executor, sample_actions):
        """Test batch action execution"""
        with patch.object(action_executor, 'execute') as mock_execute:
            mock_results = [
                ActionResult(
                    action_id="action-1",
                    action_type=ActionType.FREEZE_OBJECT,
                    status=ExecutionStatus.SUCCESS,
                    message="Action 1 completed"
                ),
                ActionResult(
                    action_id="action-2",
                    action_type=ActionType.BLOCK_IP,
                    status=ExecutionStatus.SUCCESS,
                    message="Action 2 completed"
                ),
                ActionResult(
                    action_id="action-3",
                    action_type=ActionType.THROTTLE_KEY,
                    status=ExecutionStatus.SUCCESS,
                    message="Action 3 completed"
                )
            ]
            mock_execute.side_effect = mock_results
            
            results = await action_executor.execute_batch(sample_actions)
            
            assert len(results) == 3
            assert all(result.status == ExecutionStatus.SUCCESS for result in results)
            assert mock_execute.call_count == 3
    
    @pytest.mark.asyncio
    async def test_execute_batch_with_semaphore(self, action_executor, sample_actions):
        """Test batch execution respects concurrency limit"""
        with patch.object(action_executor, 'execute') as mock_execute:
            mock_result = ActionResult(
                action_id="test",
                action_type=ActionType.FREEZE_OBJECT,
                status=ExecutionStatus.SUCCESS,
                message="Completed"
            )
            mock_execute.return_value = mock_result
            
            # Track concurrent executions
            concurrent_count = 0
            max_concurrent = 0
            
            async def track_execute(action):
                nonlocal concurrent_count, max_concurrent
                concurrent_count += 1
                max_concurrent = max(max_concurrent, concurrent_count)
                await asyncio.sleep(0.1)  # Simulate work
                concurrent_count -= 1
                return mock_result
            
            mock_execute.side_effect = track_execute
            
            results = await action_executor.execute_batch(sample_actions)
            
            assert len(results) == 3
            assert max_concurrent <= 3  # Should not exceed max_concurrent_actions
    
    @pytest.mark.asyncio
    async def test_get_action_status(self, action_executor):
        """Test getting action status"""
        action_id = "test-action-123"
        status = ExecutionStatus.SUCCESS
        message = "Action completed successfully"
        
        # Store result in executor
        result = ActionResult(
            action_id=action_id,
            action_type=ActionType.FREEZE_OBJECT,
            status=status,
            message=message
        )
        action_executor.action_results[action_id] = result
        
        retrieved_status = action_executor.get_action_status(action_id)
        
        assert retrieved_status == status
    
    @pytest.mark.asyncio
    async def test_get_action_status_not_found(self, action_executor):
        """Test getting status for non-existent action"""
        status = action_executor.get_action_status("non-existent")
        assert status is None
    
    def test_executor_initialization(self, action_config):
        """Test action executor initialization"""
        executor = ActionExecutor(action_config)
        
        assert executor.config == action_config
        assert isinstance(executor.storage_executor, StorageActionExecutor)
        assert isinstance(executor.security_executor, SecurityActionExecutor)
        assert isinstance(executor.performance_executor, PerformanceActionExecutor)
        assert executor.max_concurrent_actions == 3
    
    @pytest.mark.asyncio
    async def test_cleanup_old_results(self, action_executor):
        """Test cleanup of old action results"""
        # Add some results
        old_result = ActionResult(
            action_id="old-action",
            action_type=ActionType.FREEZE_OBJECT,
            status=ExecutionStatus.SUCCESS,
            message="Old action"
        )
        new_result = ActionResult(
            action_id="new-action",
            action_type=ActionType.BLOCK_IP,
            status=ExecutionStatus.SUCCESS,
            message="New action"
        )
        
        action_executor.action_results["old-action"] = old_result
        action_executor.action_results["new-action"] = new_result
        
        # Cleanup (simulate old results removal)
        await action_executor.cleanup_old_results(max_age_hours=1)
        
        # Verify cleanup logic would work
        assert "new-action" in action_executor.action_results


if __name__ == "__main__":
    pytest.main([__file__])
