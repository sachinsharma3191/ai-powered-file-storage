#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use std::collections::HashMap;

    #[tokio::test]
    async fn test_store_object() {
        let storage_service = StorageService::new();
        
        let object_id = "test-object-123";
        let data = b"test data content".to_vec();
        let content_type = "text/plain".to_string();
        let etag = "\"test-etag-123\"".to_string();
        
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: data.clone(),
            content_type: content_type.clone(),
            etag: etag.clone(),
            created_at: Utc::now(),
        };

        let result = storage_service.store_object(object_id, stored_object).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_get_existing_object() {
        let storage_service = StorageService::new();
        
        let object_id = "test-object-456";
        let data = b"test data content".to_vec();
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: data.clone(),
            content_type: "text/plain".to_string(),
            etag: "\"test-etag-456\"".to_string(),
            created_at: Utc::now(),
        };

        // Store the object
        storage_service.store_object(object_id, stored_object).await.unwrap();

        // Retrieve the object
        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert_eq!(retrieved.id, object_id);
        assert_eq!(retrieved.data, data);
        assert_eq!(retrieved.content_type, "text/plain");
        assert_eq!(retrieved.etag, "\"test-etag-456\"");
    }

    #[tokio::test]
    async fn test_get_nonexistent_object() {
        let storage_service = StorageService::new();
        
        let result = storage_service.get_object("nonexistent-object").await;
        assert!(result.is_err());
        
        match result.unwrap_err() {
            StorageError::ObjectNotFound(id) => {
                assert_eq!(id, "nonexistent-object");
            }
            _ => panic!("Expected ObjectNotFound error"),
        }
    }

    #[tokio::test]
    async fn test_delete_existing_object() {
        let storage_service = StorageService::new();
        
        let object_id = "test-object-789";
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: b"test data".to_vec(),
            content_type: "application/octet-stream".to_string(),
            etag: "\"test-etag-789\"".to_string(),
            created_at: Utc::now(),
        };

        // Store the object
        storage_service.store_object(object_id, stored_object).await.unwrap();

        // Verify it exists
        assert!(storage_service.get_object(object_id).await.is_ok());

        // Delete the object
        let result = storage_service.delete_object(object_id).await;
        assert!(result.is_ok());

        // Verify it's gone
        assert!(storage_service.get_object(object_id).await.is_err());
    }

    #[tokio::test]
    async fn test_delete_nonexistent_object() {
        let storage_service = StorageService::new();
        
        let result = storage_service.delete_object("nonexistent-object").await;
        assert!(result.is_err());
        
        match result.unwrap_err() {
            StorageError::ObjectNotFound(id) => {
                assert_eq!(id, "nonexistent-object");
            }
            _ => panic!("Expected ObjectNotFound error"),
        }
    }

    #[tokio::test]
    async fn test_overwrite_object() {
        let storage_service = StorageService::new();
        
        let object_id = "test-object-overwrite";
        
        // Store first object
        let first_object = StoredObject {
            id: object_id.to_string(),
            data: b"first data".to_vec(),
            content_type: "text/plain".to_string(),
            etag: "\"first-etag\"".to_string(),
            created_at: Utc::now(),
        };
        storage_service.store_object(object_id, first_object).await.unwrap();

        // Store second object with same ID
        let second_object = StoredObject {
            id: object_id.to_string(),
            data: b"second data".to_vec(),
            content_type: "application/json".to_string(),
            etag: "\"second-etag\"".to_string(),
            created_at: Utc::now(),
        };
        storage_service.store_object(object_id, second_object).await.unwrap();

        // Retrieve should get the second object
        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert_eq!(retrieved.data, b"second data");
        assert_eq!(retrieved.content_type, "application/json");
        assert_eq!(retrieved.etag, "\"second-etag\"");
    }

    #[tokio::test]
    async fn test_store_large_object() {
        let storage_service = StorageService::new();
        
        let object_id = "large-object";
        let large_data = vec![0u8; 10 * 1024 * 1024]; // 10MB
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: large_data.clone(),
            content_type: "application/octet-stream".to_string(),
            etag: "\"large-etag\"".to_string(),
            created_at: Utc::now(),
        };

        let result = storage_service.store_object(object_id, stored_object).await;
        assert!(result.is_ok());

        // Retrieve and verify
        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert_eq!(retrieved.data.len(), large_data.len());
        assert_eq!(retrieved.data, large_data);
    }

    #[tokio::test]
    async fn test_concurrent_operations() {
        let storage_service = std::sync::Arc::new(StorageService::new());
        let mut handles = vec![];

        // Concurrent store operations
        for i in 0..10 {
            let service_clone = storage_service.clone();
            let handle = tokio::spawn(async move {
                let object_id = format!("concurrent-object-{}", i);
                let data = format!("data-{}", i).into_bytes();
                let stored_object = StoredObject {
                    id: object_id.clone(),
                    data,
                    content_type: "text/plain".to_string(),
                    etag: format!("\"etag-{}\"", i),
                    created_at: Utc::now(),
                };
                
                service_clone.store_object(&object_id, stored_object).await
            });
            handles.push(handle);
        }

        // Wait for all stores to complete
        for handle in handles {
            let result = handle.await.unwrap();
            assert!(result.is_ok());
        }

        // Verify all objects exist
        for i in 0..10 {
            let object_id = format!("concurrent-object-{}", i);
            let retrieved = storage_service.get_object(&object_id).await.unwrap();
            assert_eq!(retrieved.data, format!("data-{}", i).into_bytes());
        }
    }

    #[tokio::test]
    async fn test_empty_object() {
        let storage_service = StorageService::new();
        
        let object_id = "empty-object";
        let empty_object = StoredObject {
            id: object_id.to_string(),
            data: vec![],
            content_type: "application/octet-stream".to_string(),
            etag: "\"empty-etag\"".to_string(),
            created_at: Utc::now(),
        };

        storage_service.store_object(object_id, empty_object).await.unwrap();

        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert!(retrieved.data.is_empty());
        assert_eq!(retrieved.data.len(), 0);
    }

    #[tokio::test]
    async fn test_object_with_special_characters() {
        let storage_service = StorageService::new();
        
        let object_id = "object-with-special-chars_测试-123";
        let data = "测试数据 with émojis 🚀".as_bytes().to_vec();
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: data.clone(),
            content_type: "text/plain; charset=utf-8".to_string(),
            etag: "\"special-etag\"".to_string(),
            created_at: Utc::now(),
        };

        storage_service.store_object(object_id, stored_object).await.unwrap();

        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert_eq!(retrieved.data, data);
        assert_eq!(retrieved.content_type, "text/plain; charset=utf-8");
    }

    #[tokio::test]
    async fn test_binary_data() {
        let storage_service = StorageService::new();
        
        let object_id = "binary-object";
        let binary_data = vec![
            0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD, 0xFC,
            0x80, 0x81, 0x82, 0x83, 0x7F, 0x7E, 0x7D, 0x7C,
        ];
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: binary_data.clone(),
            content_type: "application/octet-stream".to_string(),
            etag: "\"binary-etag\"".to_string(),
            created_at: Utc::now(),
        };

        storage_service.store_object(object_id, stored_object).await.unwrap();

        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert_eq!(retrieved.data, binary_data);
    }

    #[tokio::test]
    async fn test_multiple_content_types() {
        let storage_service = StorageService::new();
        
        let test_cases = vec![
            ("text/plain", b"plain text".to_vec()),
            ("application/json", b"{\"key\": \"value\"}".to_vec()),
            ("image/png", vec![0x89, 0x50, 0x4E, 0x47]), // PNG header
            ("application/pdf", b"%PDF-".to_vec()),
            ("application/xml", b"<?xml version=\"1.0\"?>".to_vec()),
        ];

        for (i, (content_type, data)) in test_cases.into_iter().enumerate() {
            let object_id = format!("content-type-test-{}", i);
            let stored_object = StoredObject {
                id: object_id.clone(),
                data: data.clone(),
                content_type: content_type.to_string(),
                etag: format!("\"etag-{}\"", i),
                created_at: Utc::now(),
            };

            storage_service.store_object(&object_id, stored_object).await.unwrap();

            let retrieved = storage_service.get_object(&object_id).await.unwrap();
            assert_eq!(retrieved.content_type, content_type);
            assert_eq!(retrieved.data, data);
        }
    }

    #[tokio::test]
    async fn test_object_metadata() {
        let storage_service = StorageService::new();
        
        let object_id = "metadata-test";
        let created_at = Utc::now();
        let stored_object = StoredObject {
            id: object_id.to_string(),
            data: b"test data".to_vec(),
            content_type: "text/plain".to_string(),
            etag: "\"metadata-etag\"".to_string(),
            created_at,
        };

        storage_service.store_object(object_id, stored_object).await.unwrap();

        let retrieved = storage_service.get_object(object_id).await.unwrap();
        assert_eq!(retrieved.id, object_id);
        assert_eq!(retrieved.etag, "\"metadata-etag\"");
        assert!(retrieved.created_at <= Utc::now());
        assert!(retrieved.created_at >= created_at);
    }

    #[tokio::test]
    async fn test_error_handling() {
        let storage_service = StorageService::new();
        
        // Test various error conditions
        let test_cases = vec![
            ("", "empty object id"),
            (" ", "whitespace object id"),
            ("\0", "null byte object id"),
        ];

        for (object_id, description) in test_cases {
            let stored_object = StoredObject {
                id: object_id.to_string(),
                data: b"test data".to_vec(),
                content_type: "text/plain".to_string(),
                etag: "\"test-etag\"".to_string(),
                created_at: Utc::now(),
            };

            // These should either succeed or fail gracefully
            let result = storage_service.store_object(object_id, stored_object).await;
            // The exact behavior depends on implementation
            // Just ensure it doesn't panic
            let _ = result;
        }
    }

    #[tokio::test]
    async fn test_performance_large_number_of_objects() {
        let storage_service = StorageService::new();
        
        let num_objects = 1000;
        
        // Store many objects
        for i in 0..num_objects {
            let object_id = format!("perf-object-{}", i);
            let data = format!("data-{}", i).into_bytes();
            let stored_object = StoredObject {
                id: object_id,
                data,
                content_type: "text/plain".to_string(),
                etag: format!("\"etag-{}\"", i),
                created_at: Utc::now(),
            };
            
            storage_service.store_object(&format!("perf-object-{}", i), stored_object).await.unwrap();
        }

        // Retrieve and verify a sample
        for i in [0, 100, 500, 999] {
            let object_id = format!("perf-object-{}", i);
            let retrieved = storage_service.get_object(&object_id).await.unwrap();
            assert_eq!(retrieved.data, format!("data-{}", i).into_bytes());
        }
    }
}
