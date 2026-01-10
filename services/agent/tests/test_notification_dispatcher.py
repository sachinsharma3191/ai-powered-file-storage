import pytest
import asyncio
import json
import smtplib
from unittest.mock import AsyncMock, MagicMock, patch
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiohttp

from core.notification_dispatcher import (
    NotificationDispatcher, NotificationConfig, NotificationProvider,
    EmailProvider, SlackProvider, WebhookProvider, SMSProvider,
    NotificationChannel, DeliveryStatus
)
from models.decisions import NotificationMessage
from models.events import ObjectEvent, EventType, EventSource, EventSeverity


class TestNotificationConfig:
    """Test cases for NotificationConfig"""
    
    def test_notification_config_creation(self):
        """Test notification configuration creation"""
        config = NotificationConfig(
            email={
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "username": "test@gmail.com",
                "password": "app-password",
                "from_address": "test@gmail.com"
            },
            slack={
                "bot_token": "xoxb-test-token"
            },
            webhook={
                "timeout": 30,
                "headers": {"Authorization": "Bearer token"}
            }
        )
        
        assert config.email["smtp_host"] == "smtp.gmail.com"
        assert config.slack["bot_token"] == "xoxb-test-token"
        assert config.webhook["timeout"] == 30
    
    def test_notification_config_defaults(self):
        """Test notification configuration with defaults"""
        config = NotificationConfig()
        
        assert config.retry_attempts == 3
        assert config.retry_delay == 1
        assert config.templates_dir == "templates"


class TestEmailProvider:
    """Test cases for EmailProvider"""
    
    @pytest.fixture
    def email_config(self):
        """Email configuration for testing"""
        return {
            "smtp_host": "localhost",
            "smtp_port": 1025,
            "username": "test@example.com",
            "password": "test-password",
            "from_address": "test@example.com",
            "use_tls": False
        }
    
    @pytest.fixture
    def email_provider(self, email_config):
        """Create email provider for testing"""
        return EmailProvider(email_config)
    
    @pytest.fixture
    def sample_notification(self):
        """Sample notification for testing"""
        return NotificationMessage(
            channel=NotificationChannel.EMAIL,
            recipient="recipient@example.com",
            subject="Test Subject",
            body="Test body content",
            severity="medium"
        )
    
    @pytest.mark.asyncio
    async def test_send_email_success(self, email_provider, sample_notification):
        """Test successful email sending"""
        with patch('smtplib.SMTP') as mock_smtp:
            mock_server = MagicMock()
            mock_smtp.return_value.__enter__.return_value = mock_server
            
            result = await email_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.SENT
            assert result.message_id is not None
            assert result.error is None
            
            # Verify SMTP calls
            mock_smtp.assert_called_once_with("localhost", 1025)
            mock_server.starttls.assert_called_once()
            mock_server.login.assert_called_once_with("test@example.com", "test-password")
            mock_server.send_message.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_send_email_with_tls(self, sample_notification):
        """Test email sending with TLS"""
        config = {
            "smtp_host": "smtp.gmail.com",
            "smtp_port": 587,
            "username": "test@gmail.com",
            "password": "app-password",
            "from_address": "test@gmail.com",
            "use_tls": True
        }
        provider = EmailProvider(config)
        
        with patch('smtplib.SMTP') as mock_smtp:
            mock_server = MagicMock()
            mock_smtp.return_value.__enter__.return_value = mock_server
            
            await provider.send(sample_notification)
            
            mock_server.starttls.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_send_email_smtp_error(self, email_provider, sample_notification):
        """Test email sending with SMTP error"""
        with patch('smtplib.SMTP', side_effect=smtplib.SMTPException("Connection failed")):
            result = await email_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.FAILED
            assert "Connection failed" in result.error
    
    @pytest.mark.asyncio
    async def test_send_email_with_template(self, email_provider):
        """Test email sending with Jinja2 template"""
        notification = NotificationMessage(
            channel=NotificationChannel.EMAIL,
            recipient="test@example.com",
            subject="Alert: {{ event.event_type }}",
            body="Event: {{ event.bucket_name }}/{{ event.object_key }}",
            severity="high",
            metadata={"template_data": {"event": {
                "event_type": "ObjectCreated",
                "bucket_name": "test-bucket",
                "object_key": "test-file.txt"
            }}}
        )
        
        with patch('smtplib.SMTP') as mock_smtp:
            mock_server = MagicMock()
            mock_smtp.return_value.__enter__.return_value = mock_server
            
            result = await email_provider.send(notification)
            
            assert result.status == DeliveryStatus.SENT
            
            # Verify template was rendered
            call_args = mock_server.send_message.call_args[0][0]
            assert "Alert: ObjectCreated" in call_args['Subject']
            assert "Event: test-bucket/test-file.txt" in call_args.get_payload()
    
    @pytest.mark.asyncio
    async def test_send_html_email(self, email_provider):
        """Test sending HTML email"""
        notification = NotificationMessage(
            channel=NotificationChannel.EMAIL,
            recipient="test@example.com",
            subject="HTML Test",
            body="<h1>HTML Content</h1><p>Test paragraph</p>",
            severity="low",
            metadata={"html": True}
        )
        
        with patch('smtplib.SMTP') as mock_smtp:
            mock_server = MagicMock()
            mock_smtp.return_value.__enter__.return_value = mock_server
            
            result = await email_provider.send(notification)
            
            assert result.status == DeliveryStatus.SENT
            
            # Verify HTML content
            call_args = mock_server.send_message.call_args[0][0]
            assert isinstance(call_args, MIMEMultipart)
            assert call_args.is_multipart()


class TestSlackProvider:
    """Test cases for SlackProvider"""
    
    @pytest.fixture
    def slack_config(self):
        """Slack configuration for testing"""
        return {
            "bot_token": "xoxb-test-token",
            "default_channel": "#alerts"
        }
    
    @pytest.fixture
    def slack_provider(self, slack_config):
        """Create Slack provider for testing"""
        return SlackProvider(slack_config)
    
    @pytest.fixture
    def sample_notification(self):
        """Sample notification for testing"""
        return NotificationMessage(
            channel=NotificationChannel.SLACK,
            recipient="#general",
            subject="Security Alert",
            body="A security event was detected",
            severity="high"
        )
    
    @pytest.mark.asyncio
    async def test_send_slack_message_success(self, slack_provider, sample_notification):
        """Test successful Slack message sending"""
        with patch('slack_sdk.WebClient') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.chat_postMessage.return_value = {
                "ok": True,
                "ts": "1234567890.123456",
                "channel": "C1234567890"
            }
            
            result = await slack_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.SENT
            assert result.message_id == "1234567890.123456"
            
            mock_client.chat_postMessage.assert_called_once()
            call_args = mock_client.chat_postMessage.call_args[1]
            assert call_args["channel"] == "#general"
            assert "Security Alert" in call_args["text"]
    
    @pytest.mark.asyncio
    async def test_send_slack_message_with_blocks(self, slack_provider):
        """Test Slack message with rich blocks"""
        notification = NotificationMessage(
            channel=NotificationChannel.SLACK,
            recipient="#alerts",
            subject="Alert",
            body="Test message",
            severity="medium",
            metadata={"blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*Alert Details*"}
                },
                {
                    "type": "divider"
                }
            ]}
        )
        
        with patch('slack_sdk.WebClient') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.chat_postMessage.return_value = {"ok": True}
            
            result = await slack_provider.send(notification)
            
            assert result.status == DeliveryStatus.SENT
            
            call_args = mock_client.chat_postMessage.call_args[1]
            assert "blocks" in call_args
            assert len(call_args["blocks"]) == 2
    
    @pytest.mark.asyncio
    async def test_send_slack_message_error(self, slack_provider, sample_notification):
        """Test Slack message sending with error"""
        with patch('slack_sdk.WebClient') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.chat_postMessage.side_effect = Exception("API Error")
            
            result = await slack_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.FAILED
            assert "API Error" in result.error
    
    @pytest.mark.asyncio
    async def test_send_slack_default_channel(self, slack_provider):
        """Test Slack message with default channel"""
        notification = NotificationMessage(
            channel=NotificationChannel.SLACK,
            recipient="",  # Empty recipient should use default
            subject="Test",
            body="Test message",
            severity="low"
        )
        
        with patch('slack_sdk.WebClient') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.chat_postMessage.return_value = {"ok": True}
            
            await slack_provider.send(notification)
            
            call_args = mock_client.chat_postMessage.call_args[1]
            assert call_args["channel"] == "#alerts"


class TestWebhookProvider:
    """Test cases for WebhookProvider"""
    
    @pytest.fixture
    def webhook_config(self):
        """Webhook configuration for testing"""
        return {
            "timeout": 30,
            "headers": {
                "Authorization": "Bearer webhook-token",
                "Content-Type": "application/json"
            }
        }
    
    @pytest.fixture
    def webhook_provider(self, webhook_config):
        """Create webhook provider for testing"""
        return WebhookProvider(webhook_config)
    
    @pytest.fixture
    def sample_notification(self):
        """Sample notification for testing"""
        return NotificationMessage(
            channel=NotificationChannel.WEBHOOK,
            recipient="https://hooks.slack.com/test/webhook",
            subject="Webhook Test",
            body='{"event": "test", "severity": "high"}',
            severity="high"
        )
    
    @pytest.mark.asyncio
    async def test_send_webhook_success(self, webhook_provider, sample_notification):
        """Test successful webhook sending"""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 200
            mock_response.text.return_value = "OK"
            mock_session.post.return_value = mock_response
            
            result = await webhook_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.SENT
            
            mock_session.post.assert_called_once()
            call_args = mock_session.post.call_args
            assert call_args[0][0] == "https://hooks.slack.com/test/webhook"
            assert "Authorization" in call_args[1]["headers"]
    
    @pytest.mark.asyncio
    async def test_send_webhook_json_body(self, webhook_provider):
        """Test webhook with JSON body"""
        notification = NotificationMessage(
            channel=NotificationChannel.WEBHOOK,
            recipient="https://api.example.com/webhook",
            subject="Alert",
            body='{"key": "value"}',
            severity="medium",
            metadata={"content_type": "application/json"}
        )
        
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 201
            mock_session.post.return_value = mock_response
            
            result = await webhook_provider.send(notification)
            
            assert result.status == DeliveryStatus.SENT
            
            call_args = mock_session.post.call_args
            assert call_args[1]["headers"]["Content-Type"] == "application/json"
    
    @pytest.mark.asyncio
    async def test_send_webhook_timeout(self, webhook_provider, sample_notification):
        """Test webhook sending with timeout"""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_session.post.side_effect = asyncio.TimeoutError("Request timed out")
            
            result = await webhook_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.FAILED
            assert "timed out" in result.error.lower()
    
    @pytest.mark.asyncio
    async def test_send_webhook_http_error(self, webhook_provider, sample_notification):
        """Test webhook sending with HTTP error"""
        with patch('aiohttp.ClientSession') as mock_session_class:
            mock_session = AsyncMock()
            mock_session_class.return_value.__aenter__.return_value = mock_session
            
            mock_response = AsyncMock()
            mock_response.status = 500
            mock_response.text.return_value = "Internal Server Error"
            mock_session.post.return_value = mock_response
            
            result = await webhook_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.FAILED
            assert "500" in result.error


class TestSMSProvider:
    """Test cases for SMSProvider"""
    
    @pytest.fixture
    def sms_config(self):
        """SMS configuration for testing"""
        return {
            "twilio_account_sid": "test-sid",
            "twilio_auth_token": "test-token",
            "from_number": "+1234567890"
        }
    
    @pytest.fixture
    def sms_provider(self, sms_config):
        """Create SMS provider for testing"""
        return SMSProvider(sms_config)
    
    @pytest.fixture
    def sample_notification(self):
        """Sample notification for testing"""
        return NotificationMessage(
            channel=NotificationChannel.SMS,
            recipient="+0987654321",
            subject="SMS Alert",
            body="A security event was detected. Please check your dashboard.",
            severity="high"
        )
    
    @pytest.mark.asyncio
    async def test_send_sms_success(self, sms_provider, sample_notification):
        """Test successful SMS sending"""
        with patch('twilio.rest.Client') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            
            mock_message = MagicMock()
            mock_message.sid = "SM1234567890"
            mock_client.messages.create.return_value = mock_message
            
            result = await sms_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.SENT
            assert result.message_id == "SM1234567890"
            
            mock_client.messages.create.assert_called_once()
            call_args = mock_client.messages.create.call_args
            assert call_args[1]["to"] == "+0987654321"
            assert call_args[1]["from_"] == "+1234567890"
            assert "security event" in call_args[1]["body"]
    
    @pytest.mark.asyncio
    async def test_send_sms_error(self, sms_provider, sample_notification):
        """Test SMS sending with error"""
        with patch('twilio.rest.Client') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            mock_client.messages.create.side_effect = Exception("Twilio API Error")
            
            result = await sms_provider.send(sample_notification)
            
            assert result.status == DeliveryStatus.FAILED
            assert "Twilio API Error" in result.error
    
    @pytest.mark.asyncio
    async def test_send_sms_long_message_truncation(self, sms_provider):
        """Test SMS message truncation for long content"""
        long_body = "A" * 2000  # Very long message
        notification = NotificationMessage(
            channel=NotificationChannel.SMS,
            recipient="+0987654321",
            subject="Alert",
            body=long_body,
            severity="medium"
        )
        
        with patch('twilio.rest.Client') as mock_client_class:
            mock_client = MagicMock()
            mock_client_class.return_value = mock_client
            
            mock_message = MagicMock()
            mock_message.sid = "SM1234567890"
            mock_client.messages.create.return_value = mock_message
            
            result = await sms_provider.send(notification)
            
            assert result.status == DeliveryStatus.SENT
            
            # Verify message was truncated (SMS limit is typically 1600 characters)
            call_args = mock_client.messages.create.call_args
            sent_body = call_args[1]["body"]
            assert len(sent_body) <= 1600


class TestNotificationDispatcher:
    """Test cases for NotificationDispatcher"""
    
    @pytest.fixture
    def notification_config(self):
        """Complete notification configuration"""
        return NotificationConfig(
            email={
                "smtp_host": "localhost",
                "smtp_port": 1025,
                "username": "test@example.com",
                "password": "test-password",
                "from_address": "test@example.com"
            },
            slack={
                "bot_token": "xoxb-test-token"
            },
            webhook={
                "timeout": 30
            },
            retry_attempts=2,
            retry_delay=0.1  # Short delay for testing
        )
    
    @pytest.fixture
    def dispatcher(self, notification_config):
        """Create notification dispatcher for testing"""
        return NotificationDispatcher(notification_config)
    
    @pytest.fixture
    def sample_event(self):
        """Sample event for testing"""
        return ObjectEvent(
            event_id="test-event-123",
            event_type=EventType.OBJECT_CREATED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.HIGH,
            account_id="account-123",
            bucket_name="test-bucket",
            object_key="test-file.txt",
            object_size=1024
        )
    
    @pytest.fixture
    def sample_notification(self):
        """Sample notification for testing"""
        return NotificationMessage(
            channel=NotificationChannel.EMAIL,
            recipient="test@example.com",
            subject="Test Alert",
            body="Test notification body",
            severity="medium"
        )
    
    @pytest.mark.asyncio
    async def test_send_notification_success(self, dispatcher, sample_notification, sample_event):
        """Test successful notification sending"""
        with patch.object(dispatcher.providers[NotificationChannel.EMAIL], 'send') as mock_send:
            mock_result = MagicMock()
            mock_result.status = DeliveryStatus.SENT
            mock_result.message_id = "test-message-id"
            mock_send.return_value = mock_result
            
            result = await dispatcher.send_notification(sample_notification, sample_event)
            
            assert result.status == DeliveryStatus.SENT
            assert result.message_id == "test-message-id"
            mock_send.assert_called_once_with(sample_notification)
    
    @pytest.mark.asyncio
    async def test_send_notification_retry_success(self, dispatcher, sample_notification, sample_event):
        """Test notification sending with retry on failure"""
        with patch.object(dispatcher.providers[NotificationChannel.EMAIL], 'send') as mock_send:
            # First call fails, second succeeds
            mock_result_fail = MagicMock()
            mock_result_fail.status = DeliveryStatus.FAILED
            mock_result_fail.error = "Temporary failure"
            
            mock_result_success = MagicMock()
            mock_result_success.status = DeliveryStatus.SENT
            mock_result_success.message_id = "retry-message-id"
            
            mock_send.side_effect = [mock_result_fail, mock_result_success]
            
            result = await dispatcher.send_notification(sample_notification, sample_event)
            
            assert result.status == DeliveryStatus.SENT
            assert result.message_id == "retry-message-id"
            assert mock_send.call_count == 2  # Should retry once
    
    @pytest.mark.asyncio
    async def test_send_notification_max_retries_exceeded(self, dispatcher, sample_notification, sample_event):
        """Test notification sending when max retries exceeded"""
        with patch.object(dispatcher.providers[NotificationChannel.EMAIL], 'send') as mock_send:
            mock_result = MagicMock()
            mock_result.status = DeliveryStatus.FAILED
            mock_result.error = "Persistent failure"
            mock_send.return_value = mock_result
            
            result = await dispatcher.send_notification(sample_notification, sample_event)
            
            assert result.status == DeliveryStatus.FAILED
            assert "Persistent failure" in result.error
            assert mock_send.call_count == 3  # Initial attempt + 2 retries
    
    @pytest.mark.asyncio
    async def test_send_notification_unsupported_channel(self, dispatcher, sample_event):
        """Test sending notification with unsupported channel"""
        notification = NotificationMessage(
            channel="unsupported_channel",  # Invalid channel
            recipient="test@example.com",
            subject="Test",
            body="Test",
            severity="low"
        )
        
        result = await dispatcher.send_notification(notification, sample_event)
        
        assert result.status == DeliveryStatus.FAILED
        assert "Unsupported channel" in result.error
    
    @pytest.mark.asyncio
    async def test_send_notification_with_template(self, dispatcher, sample_event):
        """Test notification sending with template rendering"""
        notification = NotificationMessage(
            channel=NotificationChannel.EMAIL,
            recipient="test@example.com",
            subject="Event: {{ event.event_type }}",
            body="Bucket: {{ event.bucket_name }}",
            severity="medium",
            metadata={"template_data": {"event": sample_event.dict()}}
        )
        
        with patch.object(dispatcher.providers[NotificationChannel.EMAIL], 'send') as mock_send:
            mock_result = MagicMock()
            mock_result.status = DeliveryStatus.SENT
            mock_send.return_value = mock_result
            
            result = await dispatcher.send_notification(notification, sample_event)
            
            assert result.status == DeliveryStatus.SENT
            
            # Verify template was rendered
            call_args = mock_send.call_args[0][0]
            assert "Event: ObjectCreated" in call_args.subject
            assert "Bucket: test-bucket" in call_args.body
    
    @pytest.mark.asyncio
    async def test_send_batch_notifications(self, dispatcher, sample_event):
        """Test sending multiple notifications in batch"""
        notifications = [
            NotificationMessage(
                channel=NotificationChannel.EMAIL,
                recipient="test1@example.com",
                subject="Test 1",
                body="Test 1",
                severity="low"
            ),
            NotificationMessage(
                channel=NotificationChannel.SLACK,
                recipient="#general",
                subject="Test 2",
                body="Test 2",
                severity="medium"
            )
        ]
        
        with patch.object(dispatcher.providers[NotificationChannel.EMAIL], 'send') as mock_email:
            with patch.object(dispatcher.providers[NotificationChannel.SLACK], 'send') as mock_slack:
                mock_email.return_value = MagicMock(status=DeliveryStatus.SENT)
                mock_slack.return_value = MagicMock(status=DeliveryStatus.SENT)
                
                results = await dispatcher.send_batch(notifications, sample_event)
                
                assert len(results) == 2
                assert all(r.status == DeliveryStatus.SENT for r in results)
                mock_email.assert_called_once()
                mock_slack.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_delivery_status(self, dispatcher, sample_notification, sample_event):
        """Test getting delivery status for notification"""
        with patch.object(dispatcher.providers[NotificationChannel.EMAIL], 'send') as mock_send:
            mock_result = MagicMock()
            mock_result.status = DeliveryStatus.SENT
            mock_result.message_id = "status-test-id"
            mock_send.return_value = mock_result
            
            # Send notification
            await dispatcher.send_notification(sample_notification, sample_event)
            
            # Get status
            status = dispatcher.get_delivery_status("status-test-id")
            
            assert status == DeliveryStatus.SENT
    
    def test_provider_initialization(self, notification_config):
        """Test that all providers are properly initialized"""
        dispatcher = NotificationDispatcher(notification_config)
        
        assert NotificationChannel.EMAIL in dispatcher.providers
        assert NotificationChannel.SLACK in dispatcher.providers
        assert NotificationChannel.WEBHOOK in dispatcher.providers
        assert NotificationChannel.SMS in dispatcher.providers
        
        assert isinstance(dispatcher.providers[NotificationChannel.EMAIL], EmailProvider)
        assert isinstance(dispatcher.providers[NotificationChannel.SLACK], SlackProvider)


if __name__ == "__main__":
    pytest.main([__file__])
