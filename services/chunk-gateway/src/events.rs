use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use tracing::{info, warn};
use redis::{Client, AsyncCommands};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadEvent {
    pub event_id: String,
    pub event_type: String,
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub severity: String,
    pub account_id: String,
    pub user_id: String,
    pub region: Option<String>,
    pub bucket_name: String,
    pub object_key: String,
    pub download_size: u64,
    pub download_count: u64,
    pub threshold: u64,
    pub metadata: HashMap<String, serde_json::Value>,
}

#[derive(Clone)]
pub struct EventService {
    redis_client: Option<redis::Client>,
    config: EventConfig,
}

#[derive(Debug, Clone)]
pub struct EventConfig {
    pub redis_url: String,
    pub stream_name: String,
    pub enabled: bool,
}

impl EventService {
    pub fn new(config: EventConfig) -> Self {
        let redis_client = if config.enabled {
            Some(redis::Client::open(config.redis_url.as_str()).unwrap())
        } else {
            None
        };

        Self {
            redis_client,
            config,
        }
    }

    pub async fn emit_download_event(
        &self,
        user_id: &str,
        bucket: &str,
        key: &str,
        download_size: u64,
        download_count: u64,
        threshold: u64,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.config.enabled {
            return Ok(());
        }

        let event = DownloadEvent {
            event_id: Uuid::new_v4().to_string(),
            event_type: "ObjectDownloaded".to_string(),
            timestamp: Utc::now(),
            source: "rust_data_plane".to_string(),
            severity: if download_count > threshold * 2 {
                "high".to_string()
            } else {
                "medium".to_string()
            },
            account_id: self.extract_account_id(user_id)?,
            user_id: user_id.to_string(),
            region: None, // Could be extracted from context
            bucket_name: bucket.to_string(),
            object_key: key.to_string(),
            download_size,
            download_count,
            threshold,
            metadata: {
                let mut meta = HashMap::new();
                meta.insert("threshold_exceeded".to_string(), 
                          serde_json::Value::Bool(download_count > threshold));
                meta.insert("anomaly_factor".to_string(), 
                          serde_json::Value::Number(serde_json::Number::from(download_count / threshold.max(1))));
                meta.insert("monitoring_window".to_string(), 
                          serde_json::Value::String("60_minutes".to_string()));
                meta.insert("ruby_version".to_string(), 
                          serde_json::Value::String("3.2.0".to_string()));
                meta
            },
        };

        self.publish_event(event).await
    }

    async fn publish_event(&self, event: DownloadEvent) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref client) = self.redis_client {
            let mut conn = client.get_async_connection().await?;
            
            let wrapped_event = serde_json::json!({
                "event": event,
                "retry_count": 0,
                "max_retries": 3,
                "dead_letter": false,
                "processed_at": Option::<String>::None
            });

            let _: String = conn
                .xadd(
                    &self.config.stream_name,
                    "*",
                    &[
                        ("data", serde_json::to_string(&wrapped_event)?),
                        ("event_id", event.event_id.clone()),
                        ("event_type", event.event_type.clone()),
                        ("timestamp", event.timestamp.to_rfc3339()),
                    ],
                )
                .await?;

            info!("Event published: {} ({})", event.event_type, event.event_id);
        } else {
            warn!("Event service disabled, skipping event publication");
        }

        Ok(())
    }

    fn extract_account_id(&self, user_id: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        // Extract account_id from user_id or JWT claims
        // This is a simplified implementation
        if user_id.contains("::") {
            let parts: Vec<&str> = user_id.split("::").collect();
            if parts.len() >= 2 {
                return Ok(parts[0].to_string());
            }
        }
        
        // Default fallback - in production, this should be extracted from JWT
        Ok("default-account".to_string())
    }

    pub async fn emit_custom_event(
        &self,
        event_type: &str,
        user_id: &str,
        account_id: &str,
        severity: &str,
        metadata: HashMap<String, serde_json::Value>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if !self.config.enabled {
            return Ok(());
        }

        let event = DownloadEvent {
            event_id: Uuid::new_v4().to_string(),
            event_type: event_type.to_string(),
            timestamp: Utc::now(),
            source: "rust_data_plane".to_string(),
            severity: severity.to_string(),
            account_id: account_id.to_string(),
            user_id: user_id.to_string(),
            region: None,
            bucket_name: String::new(),
            object_key: String::new(),
            download_size: 0,
            download_count: 0,
            threshold: 0,
            metadata,
        };

        self.publish_event(event).await
    }

    pub async fn health_check(&self) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref client) = self.redis_client {
            let mut conn = client.get_async_connection().await?;
            let _: String = redis::cmd("PING").query_async(&mut conn).await?;
            Ok(true)
        } else {
            Ok(true) // Disabled is still "healthy"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_event_service_disabled() {
        let config = EventConfig {
            redis_url: "redis://localhost:6379".to_string(),
            stream_name: "test-events".to_string(),
            enabled: false,
        };

        let service = EventService::new(config);
        
        // Should not fail when disabled
        let result = service.emit_download_event(
            "user1",
            "bucket1",
            "file1.txt",
            1024,
            5,
            3
        ).await;
        
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_custom_event() {
        let config = EventConfig {
            redis_url: "redis://localhost:6379".to_string(),
            stream_name: "test-events".to_string(),
            enabled: false, // Disabled for testing
        };

        let service = EventService::new(config);
        
        let mut metadata = HashMap::new();
        metadata.insert("test".to_string(), serde_json::Value::String("value".to_string()));
        
        let result = service.emit_custom_event(
            "CustomEvent",
            "user1",
            "account1",
            "low",
            metadata
        ).await;
        
        assert!(result.is_ok());
    }

    #[test]
    fn test_extract_account_id() {
        let config = EventConfig {
            redis_url: "redis://localhost:6379".to_string(),
            stream_name: "test-events".to_string(),
            enabled: false,
        };

        let service = EventService::new(config);
        
        // Test with format "account::user"
        let account_id = service.extract_account_id("account123::user456").unwrap();
        assert_eq!(account_id, "account123");
        
        // Test fallback
        let account_id = service.extract_account_id("user456").unwrap();
        assert_eq!(account_id, "default-account");
    }
}
