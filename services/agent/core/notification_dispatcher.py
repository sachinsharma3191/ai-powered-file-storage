import asyncio
import logging
import smtplib
import json
from abc import ABC, abstractmethod
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

import httpx
from jinja2 import Environment, FileSystemLoader, Template
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from models.events import BaseEvent
from models.decisions import NotificationMessage, NotificationChannel, NotificationDelivery, ActionStatus


@dataclass
class NotificationConfig:
    """Notification configuration"""
    email: Dict[str, Any] = None
    slack: Dict[str, Any] = None
    webhook: Dict[str, Any] = None
    sms: Dict[str, Any] = None
    templates_dir: str = "templates"
    retry_attempts: int = 3
    retry_delay: int = 5  # seconds


class BaseNotificationProvider(ABC):
    """Abstract base class for notification providers"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    @abstractmethod
    async def send(self, notification: NotificationMessage) -> NotificationDelivery:
        """Send notification"""
        pass
    
    @abstractmethod
    def validate_config(self) -> bool:
        """Validate provider configuration"""
        pass


class EmailNotificationProvider(BaseNotificationProvider):
    """Email notification provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.smtp_host = config.get('smtp_host', 'localhost')
        self.smtp_port = config.get('smtp_port', 587)
        self.username = config.get('username')
        self.password = config.get('password')
        self.from_address = config.get('from_address', 'noreply@example.com')
        self.use_tls = config.get('use_tls', True)
    
    def validate_config(self) -> bool:
        """Validate email configuration"""
        return all([
            self.smtp_host,
            self.smtp_port,
            self.from_address
        ])
    
    async def send(self, notification: NotificationMessage) -> NotificationDelivery:
        """Send email notification"""
        delivery_id = f"email_{datetime.utcnow().timestamp()}"
        delivery = NotificationDelivery(
            notification_id=delivery_id,
            event_id=notification.metadata.get('event_id', 'unknown'),
            channel=NotificationChannel.EMAIL,
            recipient=notification.recipient,
            status=ActionStatus.PENDING
        )
        
        try:
            # Create message
            msg = MIMEMultipart()
            msg['From'] = self.from_address
            msg['To'] = notification.recipient
            msg['Subject'] = notification.subject
            
            # Add body
            msg.attach(MIMEText(notification.body, 'plain'))
            
            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.use_tls:
                    server.starttls()
                if self.username and self.password:
                    server.login(self.username, self.password)
                server.send_message(msg)
            
            delivery.status = ActionStatus.COMPLETED
            delivery.sent_at = datetime.utcnow()
            self.logger.info(f"Email sent to {notification.recipient}")
            
        except Exception as e:
            delivery.status = ActionStatus.FAILED
            delivery.error_message = str(e)
            self.logger.error(f"Failed to send email: {e}")
        
        return delivery


class SlackNotificationProvider(BaseNotificationProvider):
    """Slack notification provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.bot_token = config.get('bot_token')
        self.client = WebClient(token=self.bot_token) if self.bot_token else None
    
    def validate_config(self) -> bool:
        """Validate Slack configuration"""
        return self.bot_token is not None
    
    async def send(self, notification: NotificationMessage) -> NotificationDelivery:
        """Send Slack notification"""
        delivery_id = f"slack_{datetime.utcnow().timestamp()}"
        delivery = NotificationDelivery(
            notification_id=delivery_id,
            event_id=notification.metadata.get('event_id', 'unknown'),
            channel=NotificationChannel.SLACK,
            recipient=notification.recipient,
            status=ActionStatus.PENDING
        )
        
        if not self.client:
            delivery.status = ActionStatus.FAILED
            delivery.error_message = "Slack client not initialized"
            return delivery
        
        try:
            # Send message to Slack channel/user
            response = self.client.chat_postMessage(
                channel=notification.recipient,
                text=notification.subject,
                blocks=[
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"*{notification.subject}*\n{notification.body}"
                        }
                    }
                ]
            )
            
            delivery.status = ActionStatus.COMPLETED
            delivery.sent_at = datetime.utcnow()
            delivery.result_data = {"slack_ts": response['ts']}
            self.logger.info(f"Slack message sent to {notification.recipient}")
            
        except SlackApiError as e:
            delivery.status = ActionStatus.FAILED
            delivery.error_message = str(e)
            self.logger.error(f"Failed to send Slack message: {e}")
        
        return delivery


class WebhookNotificationProvider(BaseNotificationProvider):
    """Webhook notification provider"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.timeout = config.get('timeout', 30)
        self.headers = config.get('headers', {})
    
    def validate_config(self) -> bool:
        """Validate webhook configuration"""
        return True  # Webhooks are validated per call
    
    async def send(self, notification: NotificationMessage) -> NotificationDelivery:
        """Send webhook notification"""
        delivery_id = f"webhook_{datetime.utcnow().timestamp()}"
        delivery = NotificationDelivery(
            notification_id=delivery_id,
            event_id=notification.metadata.get('event_id', 'unknown'),
            channel=NotificationChannel.WEBHOOK,
            recipient=notification.recipient,
            status=ActionStatus.PENDING
        )
        
        try:
            # Prepare webhook payload
            payload = {
                'id': delivery_id,
                'subject': notification.subject,
                'body': notification.body,
                'severity': notification.severity,
                'metadata': notification.metadata,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            # Send webhook
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    notification.recipient,
                    json=payload,
                    headers=self.headers
                )
                response.raise_for_status()
            
            delivery.status = ActionStatus.COMPLETED
            delivery.sent_at = datetime.utcnow()
            delivery.result_data = {
                'status_code': response.status_code,
                'response': response.text
            }
            self.logger.info(f"Webhook sent to {notification.recipient}")
            
        except Exception as e:
            delivery.status = ActionStatus.FAILED
            delivery.error_message = str(e)
            self.logger.error(f"Failed to send webhook: {e}")
        
        return delivery


class SMSNotificationProvider(BaseNotificationProvider):
    """SMS notification provider (placeholder implementation)"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.provider = config.get('provider', 'twilio')
        self.account_sid = config.get('account_sid')
        self.auth_token = config.get('auth_token')
        self.from_number = config.get('from_number')
    
    def validate_config(self) -> bool:
        """Validate SMS configuration"""
        return all([
            self.provider,
            self.account_sid,
            self.auth_token,
            self.from_number
        ])
    
    async def send(self, notification: NotificationMessage) -> NotificationDelivery:
        """Send SMS notification"""
        delivery_id = f"sms_{datetime.utcnow().timestamp()}"
        delivery = NotificationDelivery(
            notification_id=delivery_id,
            event_id=notification.metadata.get('event_id', 'unknown'),
            channel=NotificationChannel.SMS,
            recipient=notification.recipient,
            status=ActionStatus.PENDING
        )
        
        # Placeholder implementation - would integrate with Twilio, AWS SNS, etc.
        self.logger.warning("SMS provider not fully implemented")
        delivery.status = ActionStatus.FAILED
        delivery.error_message = "SMS provider not implemented"
        
        return delivery


class NotificationDispatcher:
    """Main notification dispatcher"""
    
    def __init__(self, config: NotificationConfig):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.providers: Dict[NotificationChannel, BaseNotificationProvider] = {}
        self.template_env: Optional[Environment] = None
        
        # Initialize providers
        self._initialize_providers()
        self._initialize_templates()
    
    def _initialize_providers(self):
        """Initialize notification providers"""
        if self.config.email:
            provider = EmailNotificationProvider(self.config.email)
            if provider.validate_config():
                self.providers[NotificationChannel.EMAIL] = provider
            else:
                self.logger.warning("Email provider configuration invalid")
        
        if self.config.slack:
            provider = SlackNotificationProvider(self.config.slack)
            if provider.validate_config():
                self.providers[NotificationChannel.SLACK] = provider
            else:
                self.logger.warning("Slack provider configuration invalid")
        
        if self.config.webhook:
            provider = WebhookNotificationProvider(self.config.webhook)
            self.providers[NotificationChannel.WEBHOOK] = provider
        
        if self.config.sms:
            provider = SMSNotificationProvider(self.config.sms)
            if provider.validate_config():
                self.providers[NotificationChannel.SMS] = provider
            else:
                self.logger.warning("SMS provider configuration invalid")
    
    def _initialize_templates(self):
        """Initialize Jinja2 template environment"""
        try:
            self.template_env = Environment(
                loader=FileSystemLoader(self.config.templates_dir),
                autoescape=True
            )
        except Exception as e:
            self.logger.warning(f"Failed to initialize templates: {e}")
    
    async def send_notification(self, notification: NotificationMessage, event: BaseEvent = None) -> NotificationDelivery:
        """Send notification through appropriate channel"""
        provider = self.providers.get(notification.channel)
        if not provider:
            raise ValueError(f"No provider configured for channel {notification.channel}")
        
        # Apply template if specified
        if notification.template_name and self.template_env:
            notification = await self._apply_template(notification, event)
        
        # Send with retry logic
        delivery = await self._send_with_retry(provider, notification)
        
        self.logger.info(f"Notification sent via {notification.channel}: {delivery.status}")
        return delivery
    
    async def _apply_template(self, notification: NotificationMessage, event: BaseEvent = None) -> NotificationMessage:
        """Apply Jinja2 template to notification"""
        try:
            template = self.template_env.get_template(f"{notification.template_name}.jinja2")
            
            context = {
                'notification': notification,
                'event': event,
                'timestamp': datetime.utcnow()
            }
            
            rendered_body = template.render(**context)
            
            # Update notification with rendered content
            notification.body = rendered_body
            
        except Exception as e:
            self.logger.error(f"Template application failed: {e}")
        
        return notification
    
    async def _send_with_retry(self, provider: BaseNotificationProvider, notification: NotificationMessage) -> NotificationDelivery:
        """Send notification with retry logic"""
        last_delivery = None
        
        for attempt in range(self.config.retry_attempts):
            try:
                delivery = await provider.send(notification)
                
                if delivery.status == ActionStatus.COMPLETED:
                    return delivery
                
                last_delivery = delivery
                
                if attempt < self.config.retry_attempts - 1:
                    self.logger.warning(f"Notification attempt {attempt + 1} failed, retrying...")
                    await asyncio.sleep(self.config.retry_delay)
                
            except Exception as e:
                self.logger.error(f"Notification attempt {attempt + 1} error: {e}")
                if attempt == self.config.retry_attempts - 1:
                    last_delivery = NotificationDelivery(
                        notification_id=f"failed_{datetime.utcnow().timestamp()}",
                        event_id=notification.metadata.get('event_id', 'unknown'),
                        channel=notification.channel,
                        recipient=notification.recipient,
                        status=ActionStatus.FAILED,
                        error_message=str(e),
                        delivery_attempts=attempt + 1
                    )
        
        return last_delivery
    
    async def send_bulk_notifications(self, notifications: List[NotificationMessage], events: List[BaseEvent] = None) -> List[NotificationDelivery]:
        """Send multiple notifications concurrently"""
        tasks = []
        
        for i, notification in enumerate(notifications):
            event = events[i] if events and i < len(events) else None
            task = self.send_notification(notification, event)
            tasks.append(task)
        
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    def get_supported_channels(self) -> List[NotificationChannel]:
        """Get list of supported notification channels"""
        return list(self.providers.keys())
    
    def is_channel_supported(self, channel: NotificationChannel) -> bool:
        """Check if a notification channel is supported"""
        return channel in self.providers
