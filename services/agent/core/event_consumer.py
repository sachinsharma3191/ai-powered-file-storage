import asyncio
import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Callable, Dict, List, Optional, Type, Union
from dataclasses import dataclass
from enum import Enum

import redis.asyncio as redis
from kafka import KafkaConsumer
import pika
from pika.adapters.asyncio_connection import AsyncioConnection
from pika.channel import Channel

from models.events import EventWrapper, BaseEvent, EventSeverity
from core.decision_engine import DecisionEngine
from core.notification_dispatcher import NotificationDispatcher
from core.action_executor import ActionExecutor


class QueueType(str, Enum):
    """Supported queue types"""
    REDIS_STREAMS = "redis_streams"
    KAFKA = "kafka"
    RABBITMQ = "rabbitmq"


@dataclass
class QueueConfig:
    """Queue configuration"""
    queue_type: QueueType
    connection_params: Dict[str, any]
    consumer_group: str
    topics: List[str]
    max_retries: int = 3
    dead_letter_queue: str = "dead_letter"
    batch_size: int = 10
    processing_timeout: int = 30


class BaseEventConsumer(ABC):
    """Abstract base class for event consumers"""
    
    def __init__(
        self,
        config: QueueConfig,
        decision_engine: DecisionEngine,
        notification_dispatcher: NotificationDispatcher,
        action_executor: ActionExecutor
    ):
        self.config = config
        self.decision_engine = decision_engine
        self.notification_dispatcher = notification_dispatcher
        self.action_executor = action_executor
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self._running = False
        
    @abstractmethod
    async def connect(self) -> None:
        """Connect to the message queue"""
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """Disconnect from the message queue"""
        pass
    
    @abstractmethod
    async def consume_events(self) -> None:
        """Consume events from the queue"""
        pass
    
    async def start(self) -> None:
        """Start the event consumer"""
        self.logger.info(f"Starting {self.config.queue_type} event consumer")
        self._running = True
        await self.connect()
        
        try:
            await self.consume_events()
        except Exception as e:
            self.logger.error(f"Event consumer error: {e}")
            raise
        finally:
            await self.disconnect()
    
    async def stop(self) -> None:
        """Stop the event consumer"""
        self.logger.info("Stopping event consumer")
        self._running = False
    
    async def process_event(self, event_wrapper: EventWrapper) -> bool:
        """Process a single event"""
        try:
            event = event_wrapper.event
            self.logger.info(f"Processing event {event.event_id} of type {event.event_type}")
            
            # Process through decision engine
            decisions = await self.decision_engine.process_event(event)
            
            # Execute actions
            for decision in decisions.actions:
                try:
                    await self.action_executor.execute(decision, event)
                except Exception as e:
                    self.logger.error(f"Action execution failed: {e}")
                    # Continue with other actions
            
            # Send notifications
            if decisions.notification:
                await self.notification_dispatcher.send_notification(
                    decisions.notification, event
                )
            
            return True
            
        except Exception as e:
            self.logger.error(f"Event processing failed: {e}")
            return False


class RedisStreamsConsumer(BaseEventConsumer):
    """Redis Streams event consumer"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.redis_client: Optional[redis.Redis] = None
        
    async def connect(self) -> None:
        """Connect to Redis"""
        self.redis_client = redis.Redis(
            host=self.config.connection_params.get('host', 'localhost'),
            port=self.config.connection_params.get('port', 6379),
            db=self.config.connection_params.get('db', 0),
            password=self.config.connection_params.get('password'),
            decode_responses=True
        )
        
        # Test connection
        await self.redis_client.ping()
        self.logger.info("Connected to Redis Streams")
    
    async def disconnect(self) -> None:
        """Disconnect from Redis"""
        if self.redis_client:
            await self.redis_client.close()
    
    async def consume_events(self) -> None:
        """Consume events from Redis Streams"""
        consumer_name = f"{self.config.consumer_group}-{datetime.now().timestamp()}"
        
        # Create consumer group if it doesn't exist
        for topic in self.config.topics:
            try:
                await self.redis_client.xgroup_create(
                    topic, self.config.consumer_group, id='0', mkstream=True
                )
            except redis.ResponseError as e:
                if "BUSYGROUP" not in str(e):
                    raise
        
        while self._running:
            try:
                # Read messages from streams
                messages = await self.redis_client.xreadgroup(
                    self.config.consumer_group,
                    consumer_name,
                    self.config.topics,
                    count=self.config.batch_size,
                    block=1000  # 1 second timeout
                )
                
                for stream, stream_messages in messages:
                    for message_id, fields in stream_messages:
                        await self._process_redis_message(stream, message_id, fields)
                        
            except Exception as e:
                self.logger.error(f"Redis consume error: {e}")
                await asyncio.sleep(1)
    
    async def _process_redis_message(self, stream: str, message_id: str, fields: Dict) -> None:
        """Process a single Redis message"""
        try:
            # Parse event from Redis fields
            event_data = json.loads(fields.get('event', '{}'))
            event_wrapper = EventWrapper(**event_data)
            
            # Process the event
            success = await self.process_event(event_wrapper)
            
            if success:
                # Acknowledge message
                await self.redis_client.xack(stream, self.config.consumer_group, message_id)
            else:
                # Handle retry logic
                await self._handle_retry(stream, message_id, event_wrapper)
                
        except Exception as e:
            self.logger.error(f"Error processing Redis message {message_id}: {e}")
    
    async def _handle_retry(self, stream: str, message_id: str, event_wrapper: EventWrapper) -> None:
        """Handle retry logic for failed events"""
        event_wrapper.retry_count += 1
        
        if event_wrapper.retry_count <= event_wrapper.max_retries:
            # Re-add to stream for retry
            await self.redis_client.xadd(
                stream,
                {'event': event_wrapper.json()},
                maxlen=10000  # Keep stream size manageable
            )
            await self.redis_client.xack(stream, self.config.consumer_group, message_id)
        else:
            # Send to dead letter queue
            await self.redis_client.xadd(
                self.config.dead_letter_queue,
                {
                    'original_stream': stream,
                    'original_message_id': message_id,
                    'event': event_wrapper.json(),
                    'error': 'Max retries exceeded'
                }
            )
            await self.redis_client.xack(stream, self.config.consumer_group, message_id)


class KafkaConsumer(BaseEventConsumer):
    """Apache Kafka event consumer"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.consumer: Optional[KafkaConsumer] = None
        
    async def connect(self) -> None:
        """Connect to Kafka"""
        loop = asyncio.get_event_loop()
        
        self.consumer = KafkaConsumer(
            *self.config.topics,
            bootstrap_servers=self.config.connection_params.get('bootstrap_servers', ['localhost:9092']),
            group_id=self.config.consumer_group,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            key_deserializer=lambda m: m.decode('utf-8') if m else None,
            enable_auto_commit=False,
            auto_offset_reset='earliest'
        )
        
        self.logger.info("Connected to Kafka")
    
    async def disconnect(self) -> None:
        """Disconnect from Kafka"""
        if self.consumer:
            self.consumer.close()
    
    async def consume_events(self) -> None:
        """Consume events from Kafka"""
        loop = asyncio.get_event_loop()
        
        while self._running:
            try:
                # Poll for messages
                message_batch = await loop.run_in_executor(
                    None, self.consumer.poll, 1000  # 1 second timeout
                )
                
                for topic_partition, messages in message_batch.items():
                    for message in messages:
                        await self._process_kafka_message(message)
                        
                # Commit offsets
                await loop.run_in_executor(None, self.consumer.commit)
                        
            except Exception as e:
                self.logger.error(f"Kafka consume error: {e}")
                await asyncio.sleep(1)
    
    async def _process_kafka_message(self, message) -> None:
        """Process a single Kafka message"""
        try:
            event_wrapper = EventWrapper(**message.value)
            success = await self.process_event(event_wrapper)
            
            if not success:
                self.logger.warning(f"Failed to process message {message.offset}")
                
        except Exception as e:
            self.logger.error(f"Error processing Kafka message: {e}")


class RabbitMQConsumer(BaseEventConsumer):
    """RabbitMQ event consumer"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.connection: Optional[AsyncioConnection] = None
        self.channel: Optional[Channel] = None
        
    async def connect(self) -> None:
        """Connect to RabbitMQ"""
        credentials = pika.PlainCredentials(
            self.config.connection_params.get('username', 'guest'),
            self.config.connection_params.get('password', 'guest')
        )
        
        parameters = pika.ConnectionParameters(
            host=self.config.connection_params.get('host', 'localhost'),
            port=self.config.connection_params.get('port', 5672),
            virtual_host=self.config.connection_params.get('virtual_host', '/'),
            credentials=credentials
        )
        
        self.connection = await AsyncioConnection.create(parameters)
        self.channel = await self.connection.channel()
        
        # Set QoS to limit unacknowledged messages
        await self.channel.basic_qos(prefetch_count=self.config.batch_size)
        
        self.logger.info("Connected to RabbitMQ")
    
    async def disconnect(self) -> None:
        """Disconnect from RabbitMQ"""
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
    
    async def consume_events(self) -> None:
        """Consume events from RabbitMQ"""
        for topic in self.config.topics:
            await self.channel.queue_declare(queue=topic, durable=True)
            await self.channel.basic_consume(
                queue=topic,
                on_message_callback=self._process_rabbitmq_message
            )
        
        self.logger.info("Starting RabbitMQ consumption")
        while self._running:
            await asyncio.sleep(1)
    
    async def _process_rabbitmq_message(self, channel, method, properties, body) -> None:
        """Process a single RabbitMQ message"""
        try:
            event_data = json.loads(body.decode('utf-8'))
            event_wrapper = EventWrapper(**event_data)
            
            success = await self.process_event(event_wrapper)
            
            if success:
                await channel.basic_ack(delivery_tag=method.delivery_tag)
            else:
                # Negative acknowledgment with requeue
                await channel.basic_nack(
                    delivery_tag=method.delivery_tag,
                    requeue=False
                )
                
        except Exception as e:
            self.logger.error(f"Error processing RabbitMQ message: {e}")
            await channel.basic_nack(
                delivery_tag=method.delivery_tag,
                requeue=False
            )


class EventConsumerFactory:
    """Factory for creating event consumers"""
    
    @staticmethod
    def create_consumer(
        config: QueueConfig,
        decision_engine: DecisionEngine,
        notification_dispatcher: NotificationDispatcher,
        action_executor: ActionExecutor
    ) -> BaseEventConsumer:
        """Create an event consumer based on queue type"""
        
        if config.queue_type == QueueType.REDIS_STREAMS:
            return RedisStreamsConsumer(config, decision_engine, notification_dispatcher, action_executor)
        elif config.queue_type == QueueType.KAFKA:
            return KafkaConsumer(config, decision_engine, notification_dispatcher, action_executor)
        elif config.queue_type == QueueType.RABBITMQ:
            return RabbitMQConsumer(config, decision_engine, notification_dispatcher, action_executor)
        else:
            raise ValueError(f"Unsupported queue type: {config.queue_type}")
