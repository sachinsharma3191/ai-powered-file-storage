#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_metrics_service_initialization() {
        let metrics_service = MetricsService::new(100, 60);
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 0);
        assert_eq!(metrics.objects_downloaded.len(), 0);
        assert!(!metrics.is_threshold_exceeded);
        assert!(metrics.window_start <= Utc::now());
        assert!(metrics.window_end > metrics.window_start);
    }

    #[tokio::test]
    async fn test_record_single_download() {
        let metrics_service = MetricsService::new(100, 60);
        
        let object_id = "test-object-123".to_string();
        metrics_service.record_download(object_id.clone()).await;
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 1);
        assert_eq!(metrics.objects_downloaded.len(), 1);
        assert_eq!(metrics.objects_downloaded.get(&object_id), Some(&1));
        assert!(!metrics.is_threshold_exceeded);
    }

    #[tokio::test]
    async fn test_record_multiple_downloads_same_object() {
        let metrics_service = MetricsService::new(100, 60);
        
        let object_id = "test-object-456".to_string();
        for _ in 0..5 {
            metrics_service.record_download(object_id.clone()).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 5);
        assert_eq!(metrics.objects_downloaded.len(), 1);
        assert_eq!(metrics.objects_downloaded.get(&object_id), Some(&5));
        assert!(!metrics.is_threshold_exceeded);
    }

    #[tokio::test]
    async fn test_record_multiple_downloads_different_objects() {
        let metrics_service = MetricsService::new(100, 60);
        
        let object_ids = vec!["obj1", "obj2", "obj3"];
        for (i, object_id) in object_ids.iter().enumerate() {
            for _ in 0..(i + 1) {
                metrics_service.record_download(object_id.to_string()).await;
            }
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 6); // 1 + 2 + 3
        assert_eq!(metrics.objects_downloaded.len(), 3);
        assert_eq!(metrics.objects_downloaded.get("obj1"), Some(&1));
        assert_eq!(metrics.objects_downloaded.get("obj2"), Some(&2));
        assert_eq!(metrics.objects_downloaded.get("obj3"), Some(&3));
        assert!(!metrics.is_threshold_exceeded);
    }

    #[tokio::test]
    async fn test_threshold_exceeded() {
        let threshold = 5;
        let metrics_service = MetricsService::new(threshold, 60);
        
        // Record downloads up to threshold
        for i in 0..threshold {
            metrics_service.record_download(format!("object-{}", i)).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, threshold);
        assert!(metrics.is_threshold_exceeded);
    }

    #[tokio::test]
    async fn test_threshold_not_exceeded() {
        let threshold = 10;
        let metrics_service = MetricsService::new(threshold, 60);
        
        // Record downloads below threshold
        for i in 0..(threshold - 1) {
            metrics_service.record_download(format!("object-{}", i)).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, threshold - 1);
        assert!(!metrics.is_threshold_exceeded);
    }

    #[tokio::test]
    async fn test_time_window() {
        let window_minutes = 5;
        let metrics_service = MetricsService::new(100, window_minutes);
        
        let now = Utc::now();
        let metrics = metrics_service.get_metrics().await;
        
        assert!(metrics.window_start <= now);
        assert!(metrics.window_end >= now);
        
        let expected_duration = Duration::minutes(window_minutes);
        let actual_duration = metrics.window_end - metrics.window_start;
        
        // Allow small tolerance for timing
        assert!(actual_duration.num_minutes() >= window_minutes - 1);
        assert!(actual_duration.num_minutes() <= window_minutes + 1);
    }

    #[tokio::test]
    async fn test_concurrent_downloads() {
        let metrics_service = std::sync::Arc::new(MetricsService::new(100, 60));
        let mut handles = vec![];
        
        // Record downloads concurrently
        for i in 0..10 {
            let service_clone = metrics_service.clone();
            let handle = tokio::spawn(async move {
                service_clone.record_download(format!("concurrent-object-{}", i)).await;
            });
            handles.push(handle);
        }
        
        // Wait for all operations to complete
        for handle in handles {
            handle.await.unwrap();
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 10);
        assert_eq!(metrics.objects_downloaded.len(), 10);
    }

    #[tokio::test]
    async fn test_object_id_with_special_characters() {
        let metrics_service = MetricsService::new(100, 60);
        
        let special_object_ids = vec![
            "object-with-dashes".to_string(),
            "object_with_underscores".to_string(),
            "object.with.dots".to_string(),
            "object with spaces".to_string(),
            "对象-中文".to_string(),
            "emoji-🚀".to_string(),
        ];
        
        for object_id in special_object_ids.iter() {
            metrics_service.record_download(object_id.clone()).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, special_object_ids.len());
        assert_eq!(metrics.objects_downloaded.len(), special_object_ids.len());
        
        for object_id in special_object_ids {
            assert_eq!(metrics.objects_downloaded.get(&object_id), Some(&1));
        }
    }

    #[tokio::test]
    async fn test_large_number_of_downloads() {
        let metrics_service = MetricsService::new(10000, 60);
        
        let num_downloads = 5000;
        for i in 0..num_downloads {
            metrics_service.record_download(format!("large-test-object-{}", i % 100)).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, num_downloads);
        assert_eq!(metrics.objects_downloaded.len(), 100); // 100 unique objects
        
        // Each object should have been downloaded 50 times (5000 / 100)
        for count in metrics.objects_downloaded.values() {
            assert_eq!(*count, 50);
        }
    }

    #[tokio::test]
    async fn test_metrics_persistence_across_calls() {
        let metrics_service = MetricsService::new(100, 60);
        
        // Record some downloads
        metrics_service.record_download("persistent-object".to_string()).await;
        metrics_service.record_download("persistent-object".to_string()).await;
        
        // Get metrics multiple times
        let metrics1 = metrics_service.get_metrics().await;
        let metrics2 = metrics_service.get_metrics().await;
        let metrics3 = metrics_service.get_metrics().await;
        
        // Should be consistent
        assert_eq!(metrics1.total_downloads, metrics2.total_downloads);
        assert_eq!(metrics2.total_downloads, metrics3.total_downloads);
        assert_eq!(metrics1.total_downloads, 2);
    }

    #[tokio::test]
    async fn test_zero_threshold() {
        let metrics_service = MetricsService::new(0, 60);
        
        // Any download should exceed threshold
        metrics_service.record_download("zero-threshold-test".to_string()).await;
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 1);
        assert!(metrics.is_threshold_exceeded);
    }

    #[tokio::test]
    async fn test_very_small_window() {
        let metrics_service = MetricsService::new(100, 1); // 1 minute window
        
        metrics_service.record_download("small-window-test".to_string()).await;
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 1);
        
        let window_duration = metrics.window_end - metrics.window_start;
        assert!(window_duration.num_minutes() >= 0);
        assert!(window_duration.num_minutes() <= 2); // Allow some tolerance
    }

    #[tokio::test]
    async fn test_very_large_window() {
        let metrics_service = MetricsService::new(100, 1440); // 24 hours
        
        metrics_service.record_download("large-window-test".to_string()).await;
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 1);
        
        let window_duration = metrics.window_end - metrics.window_start;
        assert!(window_duration.num_hours() >= 23);
        assert!(window_duration.num_hours() <= 25); // Allow some tolerance
    }

    #[tokio::test]
    async fn test_metrics_accuracy_under_load() {
        let metrics_service = MetricsService::new(1000, 60);
        
        let num_operations = 1000;
        let num_objects = 100;
        
        for i in 0..num_operations {
            let object_id = format!("load-test-object-{}", i % num_objects);
            metrics_service.record_download(object_id).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, num_operations);
        assert_eq!(metrics.objects_downloaded.len(), num_objects);
        
        // Each object should have been downloaded approximately the same number of times
        let expected_per_object = num_operations / num_objects;
        for count in metrics.objects_downloaded.values() {
            assert!(*count >= expected_per_object - 1);
            assert!(*count <= expected_per_object + 1);
        }
    }

    #[tokio::test]
    async fn test_empty_object_id() {
        let metrics_service = MetricsService::new(100, 60);
        
        // Recording with empty object ID should not panic
        metrics_service.record_download("".to_string()).await;
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 1);
        assert!(metrics.objects_downloaded.contains_key(""));
    }

    #[tokio::test]
    async fn test_metrics_reset_behavior() {
        let metrics_service = MetricsService::new(10, 60);
        
        // Record downloads to exceed threshold
        for i in 0..15 {
            metrics_service.record_download(format!("reset-test-{}", i)).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 15);
        assert!(metrics.is_threshold_exceeded);
        
        // Note: Actual reset behavior depends on implementation
        // This test documents current behavior
    }

    #[tokio::test]
    async fn test_thread_safety() {
        let metrics_service = std::sync::Arc::new(MetricsService::new(100, 60));
        let mut handles = vec![];
        
        // Spawn multiple threads recording downloads
        for thread_id in 0..5 {
            let service_clone = metrics_service.clone();
            let handle = tokio::spawn(async move {
                for i in 0..100 {
                    let object_id = format!("thread-{}-object-{}", thread_id, i);
                    service_clone.record_download(object_id).await;
                }
            });
            handles.push(handle);
        }
        
        // Wait for all threads to complete
        for handle in handles {
            handle.await.unwrap();
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 500); // 5 threads * 100 downloads each
        assert_eq!(metrics.objects_downloaded.len(), 500); // All unique objects
    }

    #[tokio::test]
    async fn test_memory_usage() {
        let metrics_service = MetricsService::new(100, 60);
        
        // Record many downloads to test memory growth
        for i in 0..10000 {
            metrics_service.record_download(format!("memory-test-{}", i)).await;
        }
        
        let metrics = metrics_service.get_metrics().await;
        assert_eq!(metrics.total_downloads, 10000);
        assert_eq!(metrics.objects_downloaded.len(), 10000);
        
        // Verify all objects are tracked correctly
        for i in 0..10000 {
            let object_id = format!("memory-test-{}", i);
            assert!(metrics.objects_downloaded.contains_key(&object_id));
        }
    }
}
