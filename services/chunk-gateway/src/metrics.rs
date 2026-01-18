use std::collections::HashMap;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadMetrics {
    pub user_id: String,
    pub bucket: String,
    pub key: String,
    pub download_count: u64,
    pub total_bytes: u64,
    pub window_start: SystemTime,
    pub last_download: SystemTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadAnomaly {
    pub user_id: String,
    pub bucket: String,
    pub key: String,
    pub download_count: u64,
    pub threshold: u64,
    pub window_minutes: u64,
}

pub struct MetricsService {
    // In-memory metrics tracking (in production, use Redis/database)
    metrics: RwLock<HashMap<String, DownloadMetrics>>,
    threshold: u64,
    window_minutes: u64,
}

impl MetricsService {
    pub fn new(threshold: u64, window_minutes: u64) -> Self {
        Self {
            metrics: RwLock::new(HashMap::new()),
            threshold,
            window_minutes,
        }
    }

    pub async fn record_download(
        &self,
        user_id: &str,
        bucket: &str,
        key: &str,
        bytes: u64,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let key = format!("{}:{}:{}", user_id, bucket, key);
        let mut metrics = self.metrics.write().await;
        
        let now = SystemTime::now();
        
        if let Some(metric) = metrics.get_mut(&key) {
            // Update existing metric
            metric.download_count += 1;
            metric.total_bytes += bytes;
            metric.last_download = now;
            
            // Reset window if expired
            if now.duration_since(metric.window_start).unwrap_or(Duration::ZERO) > Duration::from_secs(self.window_minutes * 60) {
                metric.download_count = 1;
                metric.total_bytes = bytes;
                metric.window_start = now;
            }
        } else {
            // Create new metric
            metrics.insert(key.clone(), DownloadMetrics {
                user_id: user_id.to_string(),
                bucket: bucket.to_string(),
                key: key.to_string(),
                download_count: 1,
                total_bytes: bytes,
                window_start: SystemTime::now(),
                last_download: now,
            });
        }
        
        Ok(())
    }

    pub async fn check_download_anomaly(
        &self,
        user_id: &str,
        bucket: &str,
        key: &str,
    ) -> Option<DownloadAnomaly> {
        let key = format!("{}:{}:{}", user_id, bucket, key);
        let metrics = self.metrics.read().await;
        
        if let Some(metric) = metrics.get(&key) {
            // Check if within window and exceeds threshold
            let now = SystemTime::now();
            let window_duration = now.duration_since(metric.window_start).unwrap_or(Duration::ZERO);
            
            if window_duration <= Duration::from_secs(self.window_minutes * 60) 
                && metric.download_count > self.threshold {
                
                return Some(DownloadAnomaly {
                    user_id: metric.user_id.clone(),
                    bucket: metric.bucket.clone(),
                    key: metric.key.clone(),
                    download_count: metric.download_count,
                    threshold: self.threshold,
                    window_minutes: self.window_minutes,
                });
            }
        }
        
        None
    }

    pub async fn get_metrics(&self, user_id: &str, bucket: &str, key: &str) -> Option<DownloadMetrics> {
        let key = format!("{}:{}:{}", user_id, bucket, key);
        let metrics = self.metrics.read().await;
        metrics.get(&key).cloned()
    }

    pub async fn cleanup_expired_metrics(&self) {
        let mut metrics = self.metrics.write().await;
        let now = SystemTime::now();
        let window_duration = Duration::from_secs(self.window_minutes * 60);
        
        metrics.retain(|_, metric| {
            now.duration_since(metric.window_start).unwrap_or(Duration::ZERO) <= window_duration * 2 // Keep for 2x window time
        });
    }

    pub async fn get_user_stats(&self, user_id: &str) -> Vec<DownloadMetrics> {
        let metrics = self.metrics.read().await;
        metrics
            .values()
            .filter(|m| m.user_id == user_id)
            .cloned()
            .collect()
    }

    pub async fn get_bucket_stats(&self, bucket: &str) -> Vec<DownloadMetrics> {
        let metrics = self.metrics.read().await;
        metrics
            .values()
            .filter(|m| m.bucket == bucket)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration as TokioDuration};

    #[tokio::test]
    async fn test_record_download() {
        let service = MetricsService::new(10, 60); // 10 downloads per hour threshold
        
        service.record_download("user1", "bucket1", "file1.txt", 1024).await.unwrap();
        
        let metrics = service.get_metrics("user1", "bucket1", "file1.txt").await.unwrap();
        assert_eq!(metrics.download_count, 1);
        assert_eq!(metrics.total_bytes, 1024);
    }

    #[tokio::test]
    async fn test_download_anomaly_detection() {
        let service = MetricsService::new(2, 1); // 2 downloads per minute threshold
        
        // Record downloads that exceed threshold
        service.record_download("user1", "bucket1", "file1.txt", 1024).await.unwrap();
        service.record_download("user1", "bucket1", "file1.txt", 1024).await.unwrap();
        service.record_download("user1", "bucket1", "file1.txt", 1024).await.unwrap();
        
        let anomaly = service.check_download_anomaly("user1", "bucket1", "file1.txt").await;
        assert!(anomaly.is_some());
        assert_eq!(anomaly.unwrap().download_count, 3);
    }

    #[tokio::test]
    async fn test_window_reset() {
        let service = MetricsService::new(10, 1); // 1 minute window
        
        service.record_download("user1", "bucket1", "file1.txt", 1024).await.unwrap();
        
        // Wait for window to expire
        sleep(TokioDuration::from_secs(2)).await;
        
        service.record_download("user1", "bucket1", "file1.txt", 1024).await.unwrap();
        
        let metrics = service.get_metrics("user1", "bucket1", "file1.txt").await.unwrap();
        assert_eq!(metrics.download_count, 1); // Should reset to 1
    }
}
