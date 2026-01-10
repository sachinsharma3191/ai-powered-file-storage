import asyncio
import json
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import redis.asyncio as redis

from core.event_consumer import (
    RedisStreamsConsumer, KafkaConsumer, RabbitMQConsumer,
    QueueConfig, QueueType, EventConsumerFactory
)
from models.events import (
    ObjectEvent, EventWrapper, EventType, EventSource, EventSeverity
)
from core.decision_engine import DecisionEngine
from core.notification_dispatcher import NotificationDispatcher
from core.action_executor import ActionExecutor


@pytest.fixture
async def redis_client():
    """Mock Redis client for testing"""
    client = AsyncMock(spec=redis.Redis)
    client.ping.return_value = True
    client.xgroup_create.return_value = None
    client.xreadgroup.return_value = []
    client.xadd.return_value = "1234567890-0"
    client.xack.return_value = 1
    return client


@pytest.fixture
def queue_config():
    """Test queue configuration"""
    return QueueConfig(
        queue_type=QueueType.REDIS_STREAMS,
        connection_params={
            'host': 'localhost',
            'port': 6379,
            'password': None,
            'db': 0
        },
        consumer_group='test-consumer',
        topics=['test-stream'],
        max_retries=3,
        batch_size=5
    )


@pytest.fixture
def mock_components():
    """Mock decision engine, notification dispatcher, and action executor"""
    decision_engine = AsyncMock(spec=DecisionEngine)
    notification_dispatcher = AsyncMock(spec=NotificationDispatcher)
    action_executor = AsyncMock(spec=ActionExecutor)
    return decision_engine, notification_dispatcher, action_executor


@pytest.fixture
def sample_object_event():
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
        object_key="test-object.txt",
        object_size=1024,
        object_etag="test-etag",
        content_type="text/plain"
    )


@pytest.fixture
def sample_event_wrapper(sample_object_event):
    """Sample event wrapper for testing"""
    return EventWrapper(
        event=sample_object_event,
        retry_count=0,
        max_retries=3,
        dead_letter=False
    )


class TestRedisStreamsConsumer:
    """Test Redis Streams event consumer"""
    
    @pytest.fixture
    def consumer(self, queue_config, mock_components, redis_client):
        """Create Redis consumer for testing"""
        decision_engine, notification_dispatcher, action_executor = mock_components
        consumer = RedisStreamsConsumer(
            queue_config, decision_engine, notification_dispatcher, action_executor
        )
        consumer.redis_client = redis_client
        return consumer
    
    async def test_connect_success(self, consumer, redis_client):
        """Test successful Redis connection"""
        await consumer.connect()
        redis_client.ping.assert_called_once()
    
    async def test_connect_failure(self, consumer, redis_client):
        """Test Redis connection failure"""
        redis_client.ping.side_effect = redis.ConnectionError("Connection failed")
        
        with pytest.raises(redis.ConnectionError):
            await consumer.connect()
    
    async def test_disconnect(self, consumer, redis_client):
        """Test Redis disconnection"""
        await consumer.disconnect()
        redis_client.close.assert_called_once()
    
    async def test_process_event_success(self, consumer, sample_event_wrapper, mock_components):
        """Test successful event processing"""
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        # Mock decision engine response
        from models.decisions import Decision, NotificationMessage
        decision = Decision(
            event_id=sample_event_wrapper.event.event_id,
            actions=[],
            notification=None,
            triggered_rules=[],
            processed_at=datetime.utcnow()
        )
        decision_engine.process_event.return_value = decision
        
        # Process event
        result = await consumer.process_event(sample_event_wrapper)
        
        assert result is True
        decision_engine.process_event.assert_called_once_with(sample_event_wrapper.event)
    
    async def test_process_event_failure(self, consumer, sample_event_wrapper, mock_components):
        """Test event processing failure"""
        decision_engine, _, _ = mock_components
        decision_engine.process_event.side_effect = Exception("Processing failed")
        
        result = await consumer.process_event(sample_event_wrapper)
        
        assert result is False
    
    async def test_consume_events_basic(self, consumer, redis_client, sample_event_wrapper, mock_components):
        """Test basic event consumption"""
        decision_engine, _, _ = mock_components
        
        # Mock Redis response
        event_data = {'event': sample_event_wrapper.json()}
        redis_client.xreadgroup.return_value = [
            ('test-stream', [('1234567890-0', event_data)])
        ]
        
        # Mock decision engine
        from models.decisions import Decision
        decision = Decision(
            event_id=sample_event_wrapper.event.event_id,
            actions=[],
            notification=None,
            triggered_rules=[],
            processed_at=datetime.utcnow()
        )
        decision_engine.process_event.return_value = decision
        
        # Set consumer as running
        consumer._running = True
        
        # Mock sleep to avoid actual waiting
        with patch('asyncio.sleep', new_callable=AsyncMock):
            # Run one iteration
            await consumer._process_redis_message('test-stream', '1234567890-0', event_data)
            
            # Verify event was processed
            decision_engine.process_event.assert_called_once()
            redis_client.xack.assert_called_once()
    
    async def test_retry_logic(self, consumer, redis_client, sample_event_wrapper, mock_components):
        """Test retry logic for failed events"""
        decision_engine, _, _ = mock_components
        decision_engine.process_event.return_value = None  # Simulate failure
        
        event_data = {'event': sample_event_wrapper.json()}
        
        # Process with retry
        await consumer._handle_retry('test-stream', '1234567890-0', sample_event_wrapper)
        
        # Should add back to stream and acknowledge original
        redis_client.xadd.assert_called()
        redis_client.xack.assert_called_once()
    
    async def test_max_retries_exceeded(self, consumer, redis_client, sample_event_wrapper):
        """Test handling when max retries exceeded"""
        sample_event_wrapper.retry_count = 3  # At max retries
        
        await consumer._handle_retry('test-stream', '1234567890-0', sample_event_wrapper)
        
        # Should send to dead letter queue
        redis_client.xadd.assert_called_with(
            consumer.config.dead_letter_queue,
            {
                'original_stream': 'test-stream',
                'original_message_id': '1234567890-0',
                'event': sample_event_wrapper.json(),
                'error': 'Max retries exceeded'
            }
        )


class TestEventConsumerFactory:
    """Test event consumer factory"""
    
    def test_create_redis_consumer(self, queue_config, mock_components):
        """Test creating Redis consumer"""
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        consumer = EventConsumerFactory.create_consumer(
            queue_config, decision_engine, notification_dispatcher, action_executor
        )
        
        assert isinstance(consumer, RedisStreamsConsumer)
        assert consumer.config == queue_config
    
    def test_create_kafka_consumer(self, mock_components):
        """Test creating Kafka consumer"""
        queue_config = QueueConfig(
            queue_type=QueueType.KAFKA,
            connection_params={'bootstrap_servers': ['localhost:9092']},
            consumer_group='test-group',
            topics=['test-topic']
        )
        
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        consumer = EventConsumerFactory.create_consumer(
            queue_config, decision_engine, notification_dispatcher, action_executor
        )
        
        assert isinstance(consumer, KafkaConsumer)
    
    def test_create_rabbitmq_consumer(self, mock_components):
        """Test creating RabbitMQ consumer"""
        queue_config = QueueConfig(
            queue_type=QueueType.RABBITMQ,
            connection_params={'host': 'localhost'},
            consumer_group='test-group',
            topics=['test-queue']
        )
        
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        consumer = EventConsumerFactory.create_consumer(
            queue_config, decision_engine, notification_dispatcher, action_executor
        )
        
        assert isinstance(consumer, RabbitMQConsumer)
    
    def test_unsupported_queue_type(self, queue_config, mock_components):
        """Test handling unsupported queue type"""
        queue_config.queue_type = "unsupported"
        
        with pytest.raises(ValueError, match="Unsupported queue type"):
            EventConsumerFactory.create_consumer(
                queue_config, *mock_components
            )


class TestKafkaConsumer:
    """Test Kafka event consumer"""
    
    @pytest.fixture
    def kafka_config(self):
        """Kafka configuration for testing"""
        return QueueConfig(
            queue_type=QueueType.KAFKA,
            connection_params={'bootstrap_servers': ['localhost:9092']},
            consumer_group='test-group',
            topics=['test-topic']
        )
    
    def test_kafka_consumer_creation(self, kafka_config, mock_components):
        """Test Kafka consumer creation"""
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        consumer = KafkaConsumer(kafka_config, decision_engine, notification_dispatcher, action_executor)
        
        assert consumer.config == kafka_config
        assert consumer.consumer is None  # Not connected yet


class TestRabbitMQConsumer:
    """Test RabbitMQ event consumer"""
    
    @pytest.fixture
    def rabbitmq_config(self):
        """RabbitMQ configuration for testing"""
        return QueueConfig(
            queue_type=QueueType.RABBITMQ,
            connection_params={'host': 'localhost', 'port': 5672},
            consumer_group='test-group',
            topics=['test-queue']
        )
    
    def test_rabbitmq_consumer_creation(self, rabbitmq_config, mock_components):
        """Test RabbitMQ consumer creation"""
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        consumer = RabbitMQConsumer(rabbitmq_config, decision_engine, notification_dispatcher, action_executor)
        
        assert consumer.config == rabbitmq_config
        assert consumer.connection is None  # Not connected yet


# Integration Tests
class TestEventConsumerIntegration:
    """Integration tests for event consumer"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_event_processing(self, queue_config, mock_components, sample_object_event):
        """Test end-to-end event processing"""
        decision_engine, notification_dispatcher, action_executor = mock_components
        
        # Create consumer
        consumer = RedisStreamsConsumer(
            queue_config, decision_engine, notification_dispatcher, action_executor
        )
        
        # Mock Redis client
        mock_redis = AsyncMock(spec=redis.Redis)
        mock_redis.ping.return_value = True
        consumer.redis_client = mock_redis
        
        # Mock decision response
        from models.decisions import Decision, NotificationMessage, ActionType
        notification = NotificationMessage(
            channel="email",
            recipient="test@example.com",
            subject="Test Event",
            body="Test notification"
        )
        decision = Decision(
            event_id=sample_object_event.event_id,
            actions=[ActionType.SEND_NOTIFICATION],
            notification=notification,
            triggered_rules=["test-rule"],
            processed_at=datetime.utcnow()
        )
        decision_engine.process_event.return_value = decision
        
        # Process event
        event_wrapper = EventWrapper(event=sample_object_event)
        result = await consumer.process_event(event_wrapper)
        
        # Verify processing
        assert result is True
        decision_engine.process_event.assert_called_once_with(sample_object_event)
        
        # Verify notification was sent
        notification_dispatcher.send_notification.assert_called_once_with(notification, sample_object_event)
        
        # Verify action was executed
        action_executor.execute.assert_called_once()


if __name__ == '__main__':
    pytest.main([__file__])
