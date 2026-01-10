from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ActionType(str, Enum):
    """Action types that can be executed"""
    SEND_NOTIFICATION = "send_notification"
    LOG_SECURITY_EVENT = "log_security_event"
    APPLY_RETENTION = "apply_retention"
    CHANGE_ACL = "change_acl"
    FREEZE_OBJECT = "freeze_object"
    THROTTLE_KEY = "throttle_key"
    BLOCK_IP = "block_ip"
    QUARANTINE_OBJECT = "quarantine_object"
    SCAN_FOR_VIRUSES = "scan_for_viruses"
    ENABLE_MFA = "enable_mfa"
    SUSPEND_ACCOUNT = "suspend_account"
    CREATE_BACKUP = "create_backup"
    COMPRESS_OBJECT = "compress_object"
    MOVE_TO_COLD_STORAGE = "move_to_cold_storage"
    DELETE_OLD_VERSIONS = "delete_old_versions"


class NotificationChannel(str, Enum):
    """Notification channels"""
    EMAIL = "email"
    SLACK = "slack"
    WEBHOOK = "webhook"
    SMS = "sms"
    IN_APP = "in_app"


class ActionStatus(str, Enum):
    """Action execution status"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Action(BaseModel):
    """Action to be executed"""
    action_type: ActionType = Field(..., description="Type of action")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Action parameters")
    priority: int = Field(default=100, description="Action priority (lower = higher)")
    retry_count: int = Field(default=0, description="Number of retries")
    max_retries: int = Field(default=3, description="Maximum retry attempts")
    timeout_seconds: int = Field(default=300, description="Action timeout in seconds")
    
    class Config:
        use_enum_values = True


class NotificationMessage(BaseModel):
    """Notification message"""
    channel: NotificationChannel = Field(..., description="Notification channel")
    recipient: str = Field(..., description="Notification recipient")
    subject: str = Field(..., description="Notification subject")
    body: str = Field(..., description="Notification body")
    severity: str = Field(default="medium", description="Notification severity")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    template_name: Optional[str] = Field(None, description="Template name used")
    sent_at: Optional[datetime] = Field(None, description="When notification was sent")
    
    class Config:
        use_enum_values = True


class Decision(BaseModel):
    """Decision result from processing an event"""
    event_id: str = Field(..., description="Event ID this decision is for")
    actions: List[ActionType] = Field(..., description="Actions to take")
    notification: Optional[NotificationMessage] = Field(None, description="Notification to send")
    triggered_rules: List[str] = Field(default_factory=list, description="IDs of triggered rules")
    llm_analysis: Optional[Dict[str, Any]] = Field(None, description="LLM analysis results")
    processed_at: datetime = Field(..., description="When decision was made")
    
    class Config:
        use_enum_values = True


class ActionExecution(BaseModel):
    """Action execution result"""
    action_id: str = Field(..., description="Unique action execution ID")
    event_id: str = Field(..., description="Related event ID")
    action_type: ActionType = Field(..., description="Type of action executed")
    status: ActionStatus = Field(..., description="Execution status")
    started_at: datetime = Field(..., description="When action started")
    completed_at: Optional[datetime] = Field(None, description="When action completed")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    result_data: Dict[str, Any] = Field(default_factory=dict, description="Action result data")
    execution_time_ms: Optional[int] = Field(None, description="Execution time in milliseconds")
    
    class Config:
        use_enum_values = True


class NotificationDelivery(BaseModel):
    """Notification delivery result"""
    notification_id: str = Field(..., description="Unique notification ID")
    event_id: str = Field(..., description="Related event ID")
    channel: NotificationChannel = Field(..., description="Notification channel")
    recipient: str = Field(..., description="Notification recipient")
    status: ActionStatus = Field(..., description="Delivery status")
    sent_at: Optional[datetime] = Field(None, description="When notification was sent")
    error_message: Optional[str] = Field(None, description="Error message if failed")
    delivery_attempts: int = Field(default=1, description="Number of delivery attempts")
    
    class Config:
        use_enum_values = True


class EventProcessingSummary(BaseModel):
    """Summary of event processing"""
    total_events: int = Field(..., description="Total events processed")
    successful_events: int = Field(..., description="Successfully processed events")
    failed_events: int = Field(..., description="Failed events")
    actions_executed: int = Field(..., description="Total actions executed")
    notifications_sent: int = Field(..., description="Total notifications sent")
    processing_time_ms: int = Field(..., description="Total processing time")
    average_latency_ms: float = Field(..., description="Average event processing latency")
    
    class Config:
        use_enum_values = True
