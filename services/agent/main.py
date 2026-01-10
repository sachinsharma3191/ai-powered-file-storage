#!/usr/bin/env python3
"""
S3 AI MCP Agent - Event-driven automation and notification system

This agent connects to both Ruby control plane and Rust data plane,
processing events and executing automated actions based on rules
and LLM-powered decision making.
"""

import asyncio
import logging
import signal
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import structlog
from prometheus_client import Counter, Histogram, Gauge, start_http_server
import sentry_sdk

from core.event_consumer import EventConsumerFactory, QueueConfig, QueueType
from core.decision_engine import DecisionEngine, LLMDecisionEngine, DEFAULT_RULES
from core.notification_dispatcher import NotificationDispatcher, NotificationConfig
from core.action_executor import ActionExecutor, ActionConfig
from models.events import BaseEvent, EventWrapper
from models.decisions import Decision


class Agent:
    """Main agent application"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = structlog.get_logger(__name__)
        self.running = False
        
        # Initialize components
        self.decision_engine: Optional[DecisionEngine] = None
        self.notification_dispatcher: Optional[NotificationDispatcher] = None
        self.action_executor: Optional[ActionExecutor] = None
        self.event_consumer = None
        
        # Metrics
        self.setup_metrics()
        
        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def setup_metrics(self):
        """Setup Prometheus metrics"""
        self.metrics = {
            'events_processed': Counter('agent_events_processed_total', 'Total events processed', ['event_type']),
            'events_failed': Counter('agent_events_failed_total', 'Total events failed', ['event_type']),
            'actions_executed': Counter('agent_actions_executed_total', 'Total actions executed', ['action_type']),
            'notifications_sent': Counter('agent_notifications_sent_total', 'Total notifications sent', ['channel']),
            'processing_duration': Histogram('agent_event_processing_seconds', 'Event processing duration'),
            'active_connections': Gauge('agent_active_connections', 'Active connections to message queue'),
            'decisions_made': Counter('agent_decisions_made_total', 'Total decisions made'),
            'llm_calls': Counter('agent_llm_calls_total', 'Total LLM calls', ['provider']),
        }
    
    async def initialize(self):
        """Initialize agent components"""
        self.logger.info("Initializing S3 AI MCP Agent")
        
        try:
            # Initialize decision engine
            await self._initialize_decision_engine()
            
            # Initialize notification dispatcher
            await self._initialize_notification_dispatcher()
            
            # Initialize action executor
            await self._initialize_action_executor()
            
            # Initialize event consumer
            await self._initialize_event_consumer()
            
            self.logger.info("Agent initialization completed")
            
        except Exception as e:
            self.logger.error(f"Agent initialization failed: {e}")
            raise
    
    async def _initialize_decision_engine(self):
        """Initialize decision engine"""
        llm_config = self.config.get('llm', {})
        
        # Initialize LLM engine if configured
        llm_engine = None
        if llm_config.get('enabled', False):
            llm_engine = LLMDecisionEngine(
                openai_api_key=llm_config.get('openai_api_key'),
                anthropic_api_key=llm_config.get('anthropic_api_key')
            )
            self.logger.info("LLM decision engine initialized")
        
        # Initialize decision engine with default rules
        self.decision_engine = DecisionEngine(
            rules=DEFAULT_RULES,
            llm_engine=llm_engine,
            enable_llm=llm_config.get('enabled', False)
        )
        
        self.logger.info(f"Decision engine initialized with {len(DEFAULT_RULES)} rules")
    
    async def _initialize_notification_dispatcher(self):
        """Initialize notification dispatcher"""
        notification_config = NotificationConfig(
            email=self.config.get('notifications', {}).get('email', {}),
            slack=self.config.get('notifications', {}).get('slack', {}),
            webhook=self.config.get('notifications', {}).get('webhook', {}),
            sms=self.config.get('notifications', {}).get('sms', {}),
            templates_dir=self.config.get('notifications', {}).get('templates_dir', 'templates'),
            retry_attempts=self.config.get('notifications', {}).get('retry_attempts', 3),
            retry_delay=self.config.get('notifications', {}).get('retry_delay', 5)
        )
        
        self.notification_dispatcher = NotificationDispatcher(notification_config)
        
        supported_channels = self.notification_dispatcher.get_supported_channels()
        self.logger.info(f"Notification dispatcher initialized with channels: {supported_channels}")
    
    async def _initialize_action_executor(self):
        """Initialize action executor"""
        action_config = ActionConfig(
            ruby_api_url=self.config.get('ruby_api_url', 'http://localhost:3000'),
            rust_api_url=self.config.get('rust_api_url', 'http://localhost:4000'),
            api_key=self.config.get('api_key'),
            api_timeout=self.config.get('api_timeout', 30),
            max_concurrent_actions=self.config.get('max_concurrent_actions', 10),
            retry_attempts=self.config.get('retry_attempts', 3),
            retry_delay=self.config.get('retry_delay', 5)
        )
        
        self.action_executor = ActionExecutor(action_config)
        
        supported_actions = self.action_executor.get_supported_actions()
        self.logger.info(f"Action executor initialized with {len(supported_actions)} supported actions")
    
    async def _initialize_event_consumer(self):
        """Initialize event consumer"""
        queue_config = self.config.get('queue', {})
        
        # Determine queue type
        queue_type_str = queue_config.get('type', 'redis_streams')
        try:
            queue_type = QueueType(queue_type_str)
        except ValueError:
            raise ValueError(f"Unsupported queue type: {queue_type_str}")
        
        # Create queue configuration
        queue_config_obj = QueueConfig(
            queue_type=queue_type,
            connection_params=queue_config.get('connection', {}),
            consumer_group=queue_config.get('consumer_group', 's3-ai-agent'),
            topics=queue_config.get('topics', ['storage-events']),
            max_retries=queue_config.get('max_retries', 3),
            dead_letter_queue=queue_config.get('dead_letter_queue', 'dead-letter'),
            batch_size=queue_config.get('batch_size', 10),
            processing_timeout=queue_config.get('processing_timeout', 30)
        )
        
        # Create event consumer
        self.event_consumer = EventConsumerFactory.create_consumer(
            queue_config_obj,
            self.decision_engine,
            self.notification_dispatcher,
            self.action_executor
        )
        
        self.logger.info(f"Event consumer initialized for {queue_type_str}")
    
    async def start(self):
        """Start the agent"""
        self.logger.info("Starting S3 AI MCP Agent")
        self.running = True
        
        # Start metrics server
        metrics_port = self.config.get('metrics_port', 8080)
        start_http_server(metrics_port)
        self.logger.info(f"Metrics server started on port {metrics_port}")
        
        try:
            # Start event consumer
            await self.event_consumer.start()
        except Exception as e:
            self.logger.error(f"Agent failed: {e}")
            raise
        finally:
            await self.stop()
    
    async def stop(self):
        """Stop the agent"""
        self.logger.info("Stopping S3 AI MCP Agent")
        self.running = False
        
        if self.event_consumer:
            await self.event_consumer.stop()
        
        if self.action_executor:
            await self.action_executor.cleanup()
        
        self.logger.info("Agent stopped")
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        self.logger.info(f"Received signal {signum}, shutting down")
        self.running = False
    
    def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
        return {
            'running': self.running,
            'started_at': datetime.utcnow().isoformat(),
            'components': {
                'decision_engine': self.decision_engine is not None,
                'notification_dispatcher': self.notification_dispatcher is not None,
                'action_executor': self.action_executor is not None,
                'event_consumer': self.event_consumer is not None
            },
            'metrics': {
                'events_processed': self.metrics['events_processed']._value.get(),
                'events_failed': self.metrics['events_failed']._value.get(),
                'actions_executed': self.metrics['actions_executed']._value.get(),
                'notifications_sent': self.metrics['notifications_sent']._value.get(),
            }
        }


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """Load configuration from file and environment"""
    import os
    from dotenv import load_dotenv
    import json
    
    # Load environment variables
    load_dotenv()
    
    # Default configuration
    config = {
        'queue': {
            'type': os.getenv('QUEUE_TYPE', 'redis_streams'),
            'connection': {
                'host': os.getenv('REDIS_HOST', 'localhost'),
                'port': int(os.getenv('REDIS_PORT', 6379)),
                'password': os.getenv('REDIS_PASSWORD'),
                'db': int(os.getenv('REDIS_DB', 0))
            },
            'consumer_group': os.getenv('CONSUMER_GROUP', 's3-ai-agent'),
            'topics': os.getenv('QUEUE_TOPICS', 'storage-events').split(','),
            'max_retries': int(os.getenv('MAX_RETRIES', 3)),
            'batch_size': int(os.getenv('BATCH_SIZE', 10))
        },
        'ruby_api_url': os.getenv('RUBY_API_URL', 'http://localhost:3000'),
        'rust_api_url': os.getenv('RUST_API_URL', 'http://localhost:4000'),
        'api_key': os.getenv('API_KEY'),
        'api_timeout': int(os.getenv('API_TIMEOUT', 30)),
        'max_concurrent_actions': int(os.getenv('MAX_CONCURRENT_ACTIONS', 10)),
        'metrics_port': int(os.getenv('METRICS_PORT', 8080)),
        'llm': {
            'enabled': os.getenv('LLM_ENABLED', 'false').lower() == 'true',
            'openai_api_key': os.getenv('OPENAI_API_KEY'),
            'anthropic_api_key': os.getenv('ANTHROPIC_API_KEY')
        },
        'notifications': {
            'email': {
                'smtp_host': os.getenv('SMTP_HOST'),
                'smtp_port': int(os.getenv('SMTP_PORT', 587)),
                'username': os.getenv('SMTP_USERNAME'),
                'password': os.getenv('SMTP_PASSWORD'),
                'from_address': os.getenv('FROM_ADDRESS', 'noreply@example.com'),
                'use_tls': os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
            },
            'slack': {
                'bot_token': os.getenv('SLACK_BOT_TOKEN')
            },
            'templates_dir': os.getenv('TEMPLATES_DIR', 'templates')
        },
        'logging': {
            'level': os.getenv('LOG_LEVEL', 'INFO'),
            'format': os.getenv('LOG_FORMAT', 'json')
        }
    }
    
    # Load config file if provided
    if config_path and Path(config_path).exists():
        with open(config_path, 'r') as f:
            file_config = json.load(f)
        config.update(file_config)
    
    return config


def setup_logging(config: Dict[str, Any]):
    """Setup structured logging"""
    log_level = config.get('logging', {}).get('level', 'INFO')
    log_format = config.get('logging', {}).get('format', 'json')
    
    # Configure structlog
    if log_format == 'json':
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.processors.JSONRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )
    else:
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_logger_name,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                structlog.dev.ConsoleRenderer()
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )
    
    # Setup standard library logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, log_level.upper())
    )


def setup_sentry(config: Dict[str, Any]):
    """Setup Sentry error tracking"""
    sentry_dsn = os.getenv('SENTRY_DSN')
    if sentry_dsn:
        sentry_sdk.init(
            dsn=sentry_dsn,
            traces_sample_rate=config.get('sentry', {}).get('traces_sample_rate', 0.1),
            environment=config.get('environment', 'development')
        )


async def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='S3 AI MCP Agent')
    parser.add_argument('--config', '-c', help='Configuration file path')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose logging')
    args = parser.parse_args()
    
    # Load configuration
    config = load_config(args.config)
    
    if args.verbose:
        config['logging']['level'] = 'DEBUG'
    
    # Setup logging
    setup_logging(config)
    logger = structlog.get_logger(__name__)
    
    # Setup Sentry
    setup_sentry(config)
    
    # Create and start agent
    agent = Agent(config)
    
    try:
        await agent.initialize()
        await agent.start()
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
    except Exception as e:
        logger.error(f"Agent failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
