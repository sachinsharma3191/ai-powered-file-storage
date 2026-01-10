from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, validator


class EventType(str, Enum):
    """Storage event types"""
    OBJECT_CREATED = "ObjectCreated"
    OBJECT_DELETED = "ObjectDeleted"
    OBJECT_MODIFIED = "ObjectModified"
    MULTIPART_COMPLETED = "MultipartCompleted"
    MULTIPART_ABORTED = "MultipartAborted"
    BUCKET_CREATED = "BucketCreated"
    BUCKET_DELETED = "BucketDeleted"
    BUCKET_POLICY_CHANGED = "BucketPolicyChanged"
    DOWNLOAD_SPIKED = "DownloadSpiked"
    PUBLIC_BUCKET_DETECTED = "PublicBucketDetected"
    VIRUS_SCAN_FAILED = "VirusScanFailed"
    ACCESS_DENIED = "AccessDenied"
    RETENTION_POLICY_APPLIED = "RetentionPolicyApplied"
    THROTTLING_ACTIVATED = "ThrottlingActivated"


class EventSeverity(str, Enum):
    """Event severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EventSource(str, Enum):
    """Event sources"""
    RUBY_CONTROL_PLANE = "ruby_control_plane"
    RUST_DATA_PLANE = "rust_data_plane"
    AGENT = "agent"
    EXTERNAL = "external"


class BaseEvent(BaseModel):
    """Base event model"""
    event_id: str = Field(..., description="Unique event identifier")
    event_type: EventType = Field(..., description="Type of event")
    timestamp: datetime = Field(..., description="Event timestamp")
    source: EventSource = Field(..., description="Event source")
    severity: EventSeverity = Field(default=EventSeverity.LOW, description="Event severity")
    account_id: str = Field(..., description="Account identifier")
    region: Optional[str] = Field(None, description="Region identifier")
    bucket_name: Optional[str] = Field(None, description="Bucket name")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    
    @validator('timestamp', pre=True)
    def parse_timestamp(cls, v):
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace('Z', '+00:00'))
        return v


class ObjectEvent(BaseEvent):
    """Object-related events"""
    object_key: str = Field(..., description="Object key")
    object_size: Optional[int] = Field(None, description="Object size in bytes")
    object_etag: Optional[str] = Field(None, description="Object ETag")
    content_type: Optional[str] = Field(None, description="Object content type")
    version_id: Optional[str] = Field(None, description="Object version ID")
    storage_class: Optional[str] = Field(None, description="Storage class")
    
    class Config:
        use_enum_values = True


class BucketEvent(BaseEvent):
    """Bucket-related events"""
    bucket_policy: Optional[Dict[str, Any]] = Field(None, description="Bucket policy")
    bucket_owner: Optional[str] = Field(None, description="Bucket owner")
    public_read: Optional[bool] = Field(None, description="Public read access")
    public_write: Optional[bool] = Field(None, description="Public write access")
    
    class Config:
        use_enum_values = True


class MultipartEvent(BaseEvent):
    """Multipart upload events"""
    upload_id: str = Field(..., description="Multipart upload ID")
    object_key: str = Field(..., description="Object key")
    total_size: Optional[int] = Field(None, description="Total upload size")
    part_count: Optional[int] = Field(None, description="Number of parts")
    
    class Config:
        use_enum_values = True


class SecurityEvent(BaseEvent):
    """Security-related events"""
    user_id: Optional[str] = Field(None, description="User identifier")
    ip_address: Optional[str] = Field(None, description="Client IP address")
    user_agent: Optional[str] = Field(None, description="User agent string")
    request_id: Optional[str] = Field(None, description="Request identifier")
    error_message: Optional[str] = Field(None, description="Error message")
    
    class Config:
        use_enum_values = True


class MetricEvent(BaseEvent):
    """Metric and monitoring events"""
    metric_name: str = Field(..., description="Metric name")
    metric_value: Union[int, float] = Field(..., description="Metric value")
    metric_unit: Optional[str] = Field(None, description="Metric unit")
    threshold: Optional[float] = Field(None, description="Threshold value")
    
    class Config:
        use_enum_values = True


class EventWrapper(BaseModel):
    """Event wrapper for queue transport"""
    event: Union[ObjectEvent, BucketEvent, MultipartEvent, SecurityEvent, MetricEvent] = Field(..., description="Event data")
    retry_count: int = Field(default=0, description="Number of retries")
    max_retries: int = Field(default=3, description="Maximum retry attempts")
    dead_letter: bool = Field(default=False, description="Sent to dead letter queue")
    processed_at: Optional[datetime] = Field(None, description="Processing timestamp")
    
    class Config:
        use_enum_values = True


# Event factory functions
def create_object_created_event(
    event_id: str,
    account_id: str,
    bucket_name: str,
    object_key: str,
    object_size: int,
    **kwargs
) -> ObjectEvent:
    """Create an ObjectCreated event"""
    return ObjectEvent(
        event_id=event_id,
        event_type=EventType.OBJECT_CREATED,
        timestamp=datetime.utcnow(),
        source=EventSource.RUBY_CONTROL_PLANE,
        account_id=account_id,
        bucket_name=bucket_name,
        object_key=object_key,
        object_size=object_size,
        **kwargs
    )


def create_download_spiked_event(
    event_id: str,
    account_id: str,
    bucket_name: str,
    object_key: str,
    download_count: int,
    **kwargs
) -> MetricEvent:
    """Create a DownloadSpiked event"""
    return MetricEvent(
        event_id=event_id,
        event_type=EventType.DOWNLOAD_SPIKED,
        timestamp=datetime.utcnow(),
        source=EventSource.RUST_DATA_PLANE,
        severity=EventSeverity.MEDIUM,
        account_id=account_id,
        bucket_name=bucket_name,
        object_key=object_key,
        metric_name="download_count",
        metric_value=download_count,
        metric_unit="count",
        **kwargs
    )


def create_public_bucket_event(
    event_id: str,
    account_id: str,
    bucket_name: str,
    bucket_policy: Dict[str, Any],
    **kwargs
) -> SecurityEvent:
    """Create a PublicBucketDetected event"""
    return SecurityEvent(
        event_id=event_id,
        event_type=EventType.PUBLIC_BUCKET_DETECTED,
        timestamp=datetime.utcnow(),
        source=EventSource.AGENT,
        severity=EventSeverity.HIGH,
        account_id=account_id,
        bucket_name=bucket_name,
        bucket_policy=bucket_policy,
        public_read=True,
        **kwargs
    )
