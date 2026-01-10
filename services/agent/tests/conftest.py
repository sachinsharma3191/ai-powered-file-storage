import asyncio
import pytest
import tempfile
import os
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

from core.decision_engine import DecisionEngine, LLMDecisionEngine, DEFAULT_RULES
from core.notification_dispatcher import NotificationDispatcher, NotificationConfig
from core.action_executor import ActionExecutor, ActionConfig
from core.event_consumer import QueueConfig, QueueType


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def mock_redis():
    """Mock Redis client for testing."""
    redis_client = AsyncMock()
    redis_client.ping.return_value = True
    redis_client.xgroup_create.return_value = None
    redis_client.xreadgroup.return_value = []
    redis_client.xadd.return_value = "1234567890-0"
    redis_client.xack.return_value = 1
    redis_client.close.return_value = None
    return redis_client


@pytest.fixture
def mock_kafka_consumer():
    """Mock Kafka consumer for testing."""
    consumer = MagicMock()
    consumer.__aenter__ = AsyncMock(return_value=consumer)
    consumer.__aexit__ = AsyncMock(return_value=None)
    return consumer


@pytest.fixture
def mock_rabbitmq_connection():
    """Mock RabbitMQ connection for testing."""
    connection = AsyncMock()
    channel = AsyncMock()
    connection.channel.return_value = channel
    return connection


@pytest.fixture
def queue_config_redis():
    """Redis queue configuration for testing."""
    return QueueConfig(
        queue_type=QueueType.REDIS_STREAMS,
        connection_params={
            'host': 'localhost',
            'port': 6379,
            'password': None,
            'db': 0
        },
        consumer_group='test-consumer-group',
        topics=['test-stream'],
        max_retries=3,
        dead_letter_queue='test-dead-letter',
        batch_size=5,
        processing_timeout=30
    )


@pytest.fixture
def queue_config_kafka():
    """Kafka queue configuration for testing."""
    return QueueConfig(
        queue_type=QueueType.KAFKA,
        connection_params={
            'bootstrap_servers': ['localhost:9092'],
            'group_id': 'test-group'
        },
        consumer_group='test-consumer-group',
        topics=['test-topic'],
        max_retries=3,
        dead_letter_queue='test-dead-letter',
        batch_size=5,
        processing_timeout=30
    )


@pytest.fixture
def queue_config_rabbitmq():
    """RabbitMQ queue configuration for testing."""
    return QueueConfig(
        queue_type=QueueType.RABBITMQ,
        connection_params={
            'host': 'localhost',
            'port': 5672,
            'username': 'guest',
            'password': 'guest'
        },
        consumer_group='test-consumer-group',
        topics=['test-queue'],
        max_retries=3,
        dead_letter_queue='test-dead-letter',
        batch_size=5,
        processing_timeout=30
    )


@pytest.fixture
def notification_config():
    """Notification configuration for testing."""
    return NotificationConfig(
        email={
            'smtp_host': 'localhost',
            'smtp_port': 1025,  # Use test port
            'username': 'test@example.com',
            'password': 'test-password',
            'from_address': 'test@example.com',
            'use_tls': False
        },
        slack={
            'bot_token': 'test-slack-token'
        },
        webhook={
            'timeout': 30,
            'headers': {
                'Authorization': 'Bearer test-webhook-token'
            }
        },
        templates_dir=tempfile.gettempdir(),
        retry_attempts=2,
        retry_delay=1
    )


@pytest.fixture
def action_config():
    """Action configuration for testing."""
    return ActionConfig(
        ruby_api_url='http://localhost:3000',
        rust_api_url='http://localhost:4000',
        api_key='test-api-key',
        api_timeout=10,
        max_concurrent_actions=5,
        retry_attempts=2,
        retry_delay=1
    )


@pytest.fixture
def mock_llm_engine():
    """Mock LLM engine for testing."""
    engine = AsyncMock(spec=LLMDecisionEngine)
    engine.analyze_event.return_value = {
        'risk_assessment': 'medium',
        'recommended_actions': ['send_notification'],
        'notification_required': True,
        'notification_message': 'Test notification',
        'security_implications': 'Test security impact',
        'operational_impact': 'Test operational impact'
    }
    return engine


@pytest.fixture
def decision_engine(mock_llm_engine):
    """Decision engine for testing."""
    return DecisionEngine(
        rules=DEFAULT_RULES[:2],  # Use only a subset for testing
        llm_engine=mock_llm_engine,
        enable_llm=True
    )


@pytest.fixture
def notification_dispatcher(notification_config):
    """Notification dispatcher for testing."""
    return NotificationDispatcher(notification_config)


@pytest.fixture
def action_executor(action_config):
    """Action executor for testing."""
    return ActionExecutor(action_config)


@pytest.fixture
def sample_events():
    """Sample events for testing."""
    from models.events import (
        ObjectEvent, BucketEvent, SecurityEvent, MetricEvent,
        EventType, EventSource, EventSeverity
    )
    
    now = datetime.utcnow()
    
    return {
        'object_created': ObjectEvent(
            event_id="obj-123",
            event_type=EventType.OBJECT_CREATED,
            timestamp=now,
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.LOW,
            account_id="acct-123",
            region="us-west-2",
            bucket_name="test-bucket",
            object_key="test-file.txt",
            object_size=1024,
            object_etag="etag-123",
            content_type="text/plain"
        ),
        'object_deleted': ObjectEvent(
            event_id="obj-456",
            event_type=EventType.OBJECT_DELETED,
            timestamp=now,
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.MEDIUM,
            account_id="acct-123",
            region="us-west-2",
            bucket_name="test-bucket",
            object_key="deleted-file.txt"
        ),
        'public_bucket_detected': SecurityEvent(
            event_id="sec-123",
            event_type=EventType.PUBLIC_BUCKET_DETECTED,
            timestamp=now,
            source=EventSource.AGENT,
            severity=EventSeverity.HIGH,
            account_id="acct-123",
            region="us-west-2",
            bucket_name="public-bucket",
            user_id="user-123",
            ip_address="192.168.1.1"
        ),
        'download_spiked': MetricEvent(
            event_id="metric-123",
            event_type=EventType.DOWNLOAD_SPIKED,
            timestamp=now,
            source=EventSource.RUST_DATA_PLANE,
            severity=EventSeverity.MEDIUM,
            account_id="acct-123",
            region="us-west-2",
            bucket_name="busy-bucket",
            object_key="popular-file.txt",
            metric_name="download_count",
            metric_value=1500,
            metric_unit="count",
            threshold=1000
        )
    }


@pytest.fixture
def mock_http_client():
    """Mock HTTP client for testing."""
    client = AsyncMock()
    
    # Mock successful response
    response = AsyncMock()
    response.status_code = 200
    response.json.return_value = {"status": "success"}
    response.raise_for_status.return_value = None
    client.post.return_value = response
    client.get.return_value = response
    client.put.return_value = response
    client.delete.return_value = response
    
    return client


@pytest.fixture
def mock_smtp_server():
    """Mock SMTP server for testing."""
    import smtplib
    from unittest.mock import patch
    
    with patch('smtplib.SMTP') as mock_smtp:
        server = MagicMock()
        mock_smtp.return_value.__enter__.return_value = server
        yield server


@pytest.fixture
def mock_slack_client():
    """Mock Slack client for testing."""
    from unittest.mock import patch
    
    with patch('slack_sdk.WebClient') as mock_client:
        client = MagicMock()
        mock_client.return_value = client
        yield client


@pytest.fixture
async def cleanup_tasks():
    """Cleanup tasks for async tests."""
    tasks = []
    
    def add_cleanup(coro):
        tasks.append(coro)
    
    yield add_cleanup
    
    # Cleanup
    for task in tasks:
        try:
            if asyncio.iscoroutine(task):
                await task
            else:
                task()
        except Exception:
            pass  # Ignore cleanup errors


@pytest.fixture
def test_config():
    """Test configuration dictionary."""
    return {
        'queue': {
            'type': 'redis_streams',
            'connection': {
                'host': 'localhost',
                'port': 6379,
                'password': None,
                'db': 0
            },
            'consumer_group': 'test-consumer',
            'topics': ['test-events'],
            'max_retries': 3,
            'batch_size': 5
        },
        'ruby_api_url': 'http://localhost:3000',
        'rust_api_url': 'http://localhost:4000',
        'api_key': 'test-key',
        'api_timeout': 10,
        'max_concurrent_actions': 5,
        'llm': {
            'enabled': True,
            'openai_api_key': 'test-openai-key',
            'anthropic_api_key': 'test-anthropic-key'
        },
        'notifications': {
            'email': {
                'smtp_host': 'localhost',
                'smtp_port': 1025,
                'from_address': 'test@example.com'
            },
            'slack': {
                'bot_token': 'test-slack-token'
            },
            'templates_dir': tempfile.gettempdir()
        },
        'logging': {
            'level': 'DEBUG',
            'format': 'json'
        }
    }


# Test markers
pytest_plugins = []

def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "integration: mark test as integration test"
    )
    config.addinivalue_line(
        "markers", "unit: mark test as unit test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "redis: mark test as requiring Redis"
    )
    config.addinivalue_line(
        "markers", "kafka: mark test as requiring Kafka"
    )
    config.addinivalue_line(
        "markers", "rabbitmq: mark test as requiring RabbitMQ"
    )


# Helper functions for tests
def create_test_event(event_type="ObjectCreated", **kwargs):
    """Create a test event with default values."""
    from models.events import ObjectEvent, EventType, EventSource, EventSeverity
    
    defaults = {
        'event_id': 'test-event-123',
        'event_type': EventType(event_type),
        'timestamp': datetime.utcnow(),
        'source': EventSource.RUBY_CONTROL_PLANE,
        'severity': EventSeverity.LOW,
        'account_id': 'test-account',
        'bucket_name': 'test-bucket',
        'object_key': 'test-file.txt',
        'object_size': 1024
    }
    
    defaults.update(kwargs)
    return ObjectEvent(**defaults)


def create_test_notification():
    """Create a test notification."""
    from models.decisions import NotificationMessage, NotificationChannel
    
    return NotificationMessage(
        channel=NotificationChannel.EMAIL,
        recipient='test@example.com',
        subject='Test Notification',
        body='This is a test notification',
        severity='medium'
    )


async def wait_for_condition(condition, timeout=5.0, interval=0.1):
    """Wait for a condition to become true."""
    import time
    
    start_time = time.time()
    while time.time() - start_time < timeout:
        if condition():
            return True
        await asyncio.sleep(interval)
    
    return False


# Mock data generators
def generate_large_file(size_mb=10):
    """Generate large file data for testing."""
    import os
    
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(os.urandom(size_mb * 1024 * 1024))
        return f.name


def cleanup_file(filepath):
    """Clean up a temporary file."""
    try:
        os.unlink(filepath)
    except OSError:
        pass


# Database fixtures for integration tests
@pytest.fixture
async def test_database():
    """Create a test database for integration tests."""
    # This would set up a test database
    # Implementation depends on your database setup
    yield {}
    # Cleanup


# Redis fixture for integration tests
@pytest.fixture
async def test_redis():
    """Create a test Redis instance for integration tests."""
    try:
        import redis.asyncio as redis
        client = redis.Redis(host='localhost', port=6379, db=15)  # Use test DB
        await client.ping()
        yield client
        await client.flushdb()  # Clean up test data
        await client.close()
    except Exception:
        pytest.skip("Redis not available for integration tests")
