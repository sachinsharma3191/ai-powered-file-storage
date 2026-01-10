import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from core.decision_engine import DecisionEngine
from core.action_executor import ActionExecutor, ActionConfig
from models.events import ObjectEvent, EventType, EventSource, EventSeverity
from models.decisions import ActionType, Action


class TestDownloadFlow:
    """Test cases for complete download flow with anomaly detection"""
    
    @pytest.fixture
    def action_config(self):
        """Action configuration for testing"""
        return ActionConfig(
            ruby_api_url="http://test-ruby:3000",
            rust_api_url="http://test-rust:4000",
            api_key="test-key",
            api_timeout=10,
            max_concurrent_actions=5,
            retry_attempts=2,
            retry_delay=1
        )
    
    @pytest.fixture
    def decision_engine(self):
        """Decision engine for testing"""
        return DecisionEngine()
    
    @pytest.fixture
    def action_executor(self, action_config):
        """Action executor for testing"""
        return ActionExecutor(action_config)
    
    @pytest.fixture
    def sample_object_downloaded_event(self):
        """Sample ObjectDownloaded event"""
        return ObjectEvent(
            event_id="download-event-123",
            event_type=EventType.OBJECT_DOWNLOADED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUST_DATA_PLANE,
            severity=EventSeverity.LOW,
            account_id="account-123",
            region="us-west-2",
            bucket_name="test-bucket",
            object_key="test-file.txt",
            object_size=1024,
            user_id="user-456",
            download_size=1024
        )
    
    @pytest.fixture
    def sample_download_spike_event(self):
        """Sample DownloadSpiked event"""
        return ObjectEvent(
            event_id="spike-event-123",
            event_type=EventType.DOWNLOAD_SPIKED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_DATA_PLANE,
            severity=EventSeverity.HIGH,
            account_id="account-123",
            region="us-west-2",
            bucket_name="test-bucket",
            object_key="popular-file.txt",
            metric_name="download_count",
            metric_value=1500,
            threshold=1000,
            user_id="user-456"
        )
    
    @pytest.mark.asyncio
    async def test_object_downloaded_event_processing(self, decision_engine, sample_object_downloaded_event):
        """Test processing of ObjectDownloaded event"""
        # Process the event through decision engine
        decisions = await decision_engine.process_event(sample_object_downloaded_event)
        
        # Should generate LOG_METRIC action for tracking
        assert len(decisions) > 0
        
        # Check if LOG_METRIC action is generated
        metric_actions = [d for d in decisions if d.action_type == ActionType.LOG_METRIC]
        assert len(metric_actions) > 0
        
        metric_action = metric_actions[0]
        assert metric_action.action_type == ActionType.LOG_METRIC
        assert metric_action.parameters is not None
    
    @pytest.mark.asyncio
    async def test_download_spike_triggers_throttling(self, decision_engine, sample_download_spike_event):
        """Test that download spike triggers throttling actions"""
        # Process the spike event
        decisions = await decision_engine.process_event(sample_download_spike_event)
        
        # Should generate multiple actions for spike
        assert len(decisions) >= 2
        
        # Check for throttling action
        throttle_actions = [d for d in decisions if d.action_type == ActionType.THROTTLE_KEY]
        assert len(throttle_actions) > 0
        
        # Check for notification action
        notification_actions = [d for d in decisions if d.action_type == ActionType.SEND_NOTIFICATION]
        assert len(notification_actions) > 0
    
    @pytest.mark.asyncio
    async def test_log_metric_action_execution(self, action_executor, sample_object_downloaded_event):
        """Test execution of LOG_METRIC action"""
        # Create LOG_METRIC action
        action = Action(
            id="metric-action-123",
            action_type=ActionType.LOG_METRIC,
            parameters={
                "metric_name": "object_download",
                "metric_value": 1
            }
        )
        
        # Execute the action
        execution = await action_executor.execute(action, sample_object_downloaded_event)
        
        # Verify execution
        assert execution.action_type == ActionType.LOG_METRIC
        assert execution.status.value in ["completed", "failed"]
        
        if execution.status.value == "completed":
            assert execution.result_data is not None
            assert "status" in execution.result_data
            assert execution.result_data["status"] == "logged"
            assert "metric_data" in execution.result_data
    
    @pytest.mark.asyncio
    async def test_throttle_key_action_execution(self, action_executor, sample_download_spike_event):
        """Test execution of THROTTLE_KEY action"""
        # Create THROTTLE_KEY action
        action = Action(
            id="throttle-action-123",
            action_type=ActionType.THROTTLE_KEY,
            parameters={
                "api_key_id": "key-123",
                "requests_per_second": 10,
                "duration": 3600
            }
        )
        
        # Mock the HTTP client
        with patch.object(action_executor.executors['performance'].ruby_client, 'post') as mock_post:
            mock_response = MagicMock()
            mock_response.json.return_value = {"status": "throttled"}
            mock_response.raise_for_status = MagicMock()
            mock_post.return_value = mock_response
            
            # Execute the action
            execution = await action_executor.execute(action, sample_download_spike_event)
            
            # Verify execution
            assert execution.action_type == ActionType.THROTTLE_KEY
            assert execution.status.value == "completed"
            
            # Verify API call was made
            mock_post.assert_called_once()
            call_args = mock_post.call_args
            assert "throttle_key" in call_args[0][0]
    
    @pytest.mark.asyncio
    async def test_complete_download_flow(self, decision_engine, action_executor, sample_download_spike_event):
        """Test complete download flow from event to action execution"""
        # Step 1: Process event through decision engine
        decisions = await decision_engine.process_event(sample_download_spike_event)
        
        # Should have decisions
        assert len(decisions) > 0
        
        # Step 2: Execute actions
        executions = []
        for decision in decisions:
            execution = await action_executor.execute(decision, sample_download_spike_event)
            executions.append(execution)
        
        # Verify executions
        assert len(executions) == len(decisions)
        
        # Check that we have the expected action types
        executed_types = [e.action_type for e in executions]
        assert ActionType.THROTTLE_KEY in executed_types
        assert ActionType.SEND_NOTIFICATION in executed_types
    
    @pytest.mark.asyncio
    async def test_concurrent_download_tracking(self, decision_engine):
        """Test tracking multiple concurrent downloads"""
        # Create multiple download events
        events = []
        for i in range(10):
            event = ObjectEvent(
                event_id=f"download-event-{i}",
                event_type=EventType.OBJECT_DOWNLOADED,
                timestamp=datetime.utcnow(),
                source=EventSource.RUST_DATA_PLANE,
                severity=EventSeverity.LOW,
                account_id="account-123",
                region="us-west-2",
                bucket_name="test-bucket",
                object_key=f"file-{i}.txt",
                object_size=1024,
                user_id="user-456",
                download_size=1024
            )
            events.append(event)
        
        # Process all events concurrently
        tasks = [decision_engine.process_event(event) for event in events]
        results = await asyncio.gather(*tasks)
        
        # All should generate LOG_METRIC actions
        for decisions in results:
            metric_actions = [d for d in decisions if d.action_type == ActionType.LOG_METRIC]
            assert len(metric_actions) > 0
    
    @pytest.mark.asyncio
    async def test_download_anomaly_scenarios(self, decision_engine):
        """Test various download anomaly scenarios"""
        scenarios = [
            # High volume download
            {
                "metric_value": 5000,
                "threshold": 1000,
                "expected_actions": [ActionType.THROTTLE_KEY, ActionType.SEND_NOTIFICATION]
            },
            # Moderate spike
            {
                "metric_value": 1500,
                "threshold": 1000,
                "expected_actions": [ActionType.THROTTLE_KEY, ActionType.SEND_NOTIFICATION]
            }
        ]
        
        for scenario in scenarios:
            event = ObjectEvent(
                event_id="spike-test",
                event_type=EventType.DOWNLOAD_SPIKED,
                timestamp=datetime.utcnow(),
                source=EventSource.RUST_DATA_PLANE,
                severity=EventSeverity.HIGH,
                account_id="account-123",
                region="us-west-2",
                bucket_name="test-bucket",
                object_key="popular-file.txt",
                metric_name="download_count",
                metric_value=scenario["metric_value"],
                threshold=scenario["threshold"],
                user_id="user-456"
            )
            
            decisions = await decision_engine.process_event(event)
            decision_types = [d.action_type for d in decisions]
            
            for expected_action in scenario["expected_actions"]:
                assert expected_action in decision_types
    
    def test_event_serialization(self, sample_object_downloaded_event):
        """Test event serialization for Redis streaming"""
        # Convert event to dict
        event_dict = sample_object_downloaded_event.dict()
        
        # Verify required fields
        required_fields = [
            "event_id", "event_type", "timestamp", "source", "severity",
            "account_id", "bucket_name", "object_key", "download_size"
        ]
        
        for field in required_fields:
            assert field in event_dict
        
        # Test JSON serialization
        json_str = json.dumps(event_dict, default=str)
        assert isinstance(json_str, str)
        
        # Test deserialization
        parsed = json.loads(json_str)
        assert parsed["event_type"] == EventType.OBJECT_DOWNLOADED
        assert parsed["bucket_name"] == "test-bucket"
    
    @pytest.mark.asyncio
    async def test_action_error_handling(self, action_executor, sample_object_downloaded_event):
        """Test error handling in action execution"""
        action = Action(
            id="failing-action",
            action_type=ActionType.LOG_METRIC,
            parameters={}
        )
        
        # Mock logger to capture error
        with patch.object(action_executor.executors['performance'], '_log_metric') as mock_log:
            mock_log.side_effect = Exception("Test error")
            
            execution = await action_executor.execute(action, sample_object_downloaded_event)
            
            # Should handle error gracefully
            assert execution.status.value == "failed"
            assert execution.error_message is not None


if __name__ == "__main__":
    pytest.main([__file__])
