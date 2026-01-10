#[cfg(test)]
mod integration_tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;

    // Test data
    const TEST_BUCKET: &str = "test-bucket";
    const TEST_KEY: &str = "test-object.txt";
    const TEST_DATA: &[u8] = b"Hello, World! This is test data for chunking.";
    const UPLOAD_ID: &str = "test-upload-123";
    const PART_NUMBER: u32 = 1;

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = create_app().await;
        
        let request = Request::builder()
            .uri("/healthz")
            .body(Body::empty())
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_upload_part_success() {
        let app = create_app().await;
        
        // Create valid JWT token
        let token = create_test_token("put_part", TEST_BUCKET, TEST_KEY, Some(UPLOAD_ID), Some(PART_NUMBER));
        
        let request = Request::builder()
            .method("PUT")
            .uri(&format!("/dp/v1/uploads/{}/parts/{}", UPLOAD_ID, PART_NUMBER))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Length", TEST_DATA.len())
            .header("Content-Checksum", "sha256-1234567890abcdef")
            .body(Body::from(TEST_DATA))
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::OK);
        
        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        
        assert!(response_json.get("part_etag").is_some());
        assert!(response_json.get("part_size").is_some());
        assert!(response_json.get("chunk_manifest_fragment").is_some());
    }

    #[tokio::test]
    async fn test_upload_part_invalid_token() {
        let app = create_app().await;
        
        let request = Request::builder()
            .method("PUT")
            .uri(&format!("/dp/v1/uploads/{}/parts/{}", UPLOAD_ID, PART_NUMBER))
            .header("Authorization", "Bearer invalid-token")
            .header("Content-Length", TEST_DATA.len())
            .body(Body::from(TEST_DATA))
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_upload_part_missing_checksum() {
        let app = create_app().await;
        
        let token = create_test_token("put_part", TEST_BUCKET, TEST_KEY, Some(UPLOAD_ID), Some(PART_NUMBER));
        
        let request = Request::builder()
            .method("PUT")
            .uri(&format!("/dp/v1/uploads/{}/parts/{}", UPLOAD_ID, PART_NUMBER))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Length", TEST_DATA.len())
            .body(Body::from(TEST_DATA))
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn test_get_object_success() {
        let app = create_app().await;
        
        // First store an object
        let object_id = store_test_object(&app).await;
        
        let token = create_test_token("get_object", TEST_BUCKET, TEST_KEY, None, None);
        
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/dp/v1/objects/{}", object_id))
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::OK);
        
        // Verify headers
        assert_eq!(response.headers().get("content-type").unwrap(), "application/octet-stream");
        assert!(response.headers().get("etag").is_some());
        assert!(response.headers().get("x-checksum-sha256").is_some());
        assert_eq!(response.headers().get("accept-ranges").unwrap(), "bytes");
    }

    #[tokio::test]
    async fn test_get_object_range_request() {
        let app = create_app().await;
        
        let object_id = store_test_object(&app).await;
        let token = create_test_token("get_object", TEST_BUCKET, TEST_KEY, None, None);
        
        let request = Request::builder()
            .method("GET")
            .uri(&format!("/dp/v1/objects/{}", object_id))
            .header("Authorization", format!("Bearer {}", token))
            .header("Range", "bytes=0-4")
            .body(Body::empty())
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.headers().get("content-range").unwrap(), "bytes 0-4/46");
    }

    #[tokio::test]
    async fn test_head_object_success() {
        let app = create_app().await;
        
        let object_id = store_test_object(&app).await;
        let token = create_test_token("get_object", TEST_BUCKET, TEST_KEY, None, None);
        
        let request = Request::builder()
            .method("HEAD")
            .uri(&format!("/dp/v1/objects/{}", object_id))
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();
        
        let response = app.oneshot(request).await.unwrap();
        
        assert_eq!(response.status(), StatusCode::OK);
        
        // Verify headers are present but no body
        assert!(response.headers().get("content-type").is_some());
        assert!(response.headers().get("etag").is_some());
        assert!(response.headers().get("content-length").is_some());
        
        // Verify no body
        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        assert!(body.is_empty());
    }

    #[tokio::test]
    async fn test_chunker_fixed_size() {
        let chunker = Chunker::new_fixed(8);
        let data = b"Hello, World! This is test data.";
        
        let chunks = chunker.chunk_data(data).unwrap();
        
        // Should create chunks of 8 bytes each (except last)
        assert_eq!(chunks.len(), 4);
        assert_eq!(chunks[0].size, 8);
        assert_eq!(chunks[1].size, 8);
        assert_eq!(chunks[2].size, 8);
        assert_eq!(chunks[3].size, 6); // Remaining data
    }

    #[tokio::test]
    async fn test_chunker_content_defined() {
        let chunker = Chunker::new_content_defined(8, 64);
        let data = b"Hello, World! Hello, World! Hello, World!";
        
        let chunks = chunker.chunk_data(data).unwrap();
        
        // Content-defined chunking should create variable-sized chunks
        assert!(chunks.len() > 0);
        assert!(chunks.iter().all(|c| c.size > 0));
    }

    #[tokio::test]
    async fn test_storage_service_store_and_retrieve() {
        let storage = StorageService::new();
        
        // Store data
        let data = b"Test data for storage".to_vec();
        let result = storage.store_object("test-key", data.clone()).await.unwrap();
        
        assert_eq!(result.size, data.len());
        assert!(!result.checksum.is_empty());
        
        // Retrieve data
        let retrieved = storage.get_object("test-key").await.unwrap();
        assert_eq!(retrieved.data, data);
        assert_eq!(retrieved.checksum, result.checksum);
    }

    #[tokio::test]
    async fn test_storage_service_part_operations() {
        let storage = StorageService::new();
        
        // Store part
        let part_data = b"Part data".to_vec();
        let result = storage.store_part(UPLOAD_ID, PART_NUMBER, part_data.clone()).await.unwrap();
        
        assert_eq!(result.size, part_data.len());
        assert!(!result.checksum.is_empty());
        
        // Retrieve part
        let retrieved = storage.get_part(UPLOAD_ID, PART_NUMBER).await.unwrap();
        assert_eq!(retrieved.data, part_data);
        assert_eq!(retrieved.checksum, result.checksum);
        
        // List parts
        let parts = storage.list_parts(UPLOAD_ID).await.unwrap();
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].part_number, PART_NUMBER);
    }

    #[tokio::test]
    async fn test_auth_service_valid_token() {
        let auth_service = AuthService::new("test-secret");
        
        let token = create_test_token("put_object", TEST_BUCKET, TEST_KEY, None, None);
        let claims = auth_service.validate_token(&token).unwrap();
        
        assert_eq!(claims.act, "put_object");
        assert_eq!(claims.bucket, TEST_BUCKET);
        assert_eq!(claims.key, TEST_KEY);
    }

    #[tokio::test]
    async fn test_auth_service_invalid_token() {
        let auth_service = AuthService::new("test-secret");
        
        let result = auth_service.validate_token("invalid-token");
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_auth_service_authorization() {
        let auth_service = AuthService::new("test-secret");
        
        let token = create_test_token("put_part", TEST_BUCKET, TEST_KEY, Some(UPLOAD_ID), Some(PART_NUMBER));
        let claims = auth_service.validate_token(&token).unwrap();
        
        // Should authorize correct action
        auth_service.authorize_put_part(&claims, TEST_BUCKET, TEST_KEY, UPLOAD_ID, PART_NUMBER).unwrap();
        
        // Should fail wrong action
        let result = auth_service.authorize_get_object(&claims, TEST_BUCKET, TEST_KEY);
        assert!(result.is_err());
    }

    // Helper functions
    async fn create_app() -> axum::Router {
        let storage = StorageService::new();
        let auth_service = AuthService::new("test-secret");
        let chunker = Chunker::new_fixed(8 * 1024 * 1024); // 8MB chunks
        
        crate::main::create_app(storage, auth_service, chunker).await
    }

    fn create_test_token(
        action: &str,
        bucket: &str,
        key: &str,
        upload_id: Option<&str>,
        part_number: Option<u32>,
    ) -> String {
        use jsonwebtoken::{encode, EncodingKey, Header};
        
        let now = chrono::Utc::now();
        let mut claims = serde_json::json!({
            "iss": "storage-control-plane",
            "aud": "chunk-gateway",
            "sub": "test-account",
            "iat": now.timestamp(),
            "exp": now.timestamp() + 3600,
            "jti": uuid::Uuid::new_v4().to_string(),
            "api_key_id": "test-key",
            "region": "us-west-2",
            "act": action,
            "bucket": bucket,
            "key": key
        });
        
        if let Some(upload_id) = upload_id {
            claims["upload_id"] = serde_json::Value::String(upload_id.to_string());
        }
        
        if let Some(part_number) = part_number {
            claims["part_number"] = serde_json::Value::Number(part_number.into());
        }
        
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret("test-secret"),
        ).unwrap()
    }

    async fn store_test_object(app: &axum::Router) -> String {
        let token = create_test_token("put_object", TEST_BUCKET, TEST_KEY, None, None);
        
        let request = Request::builder()
            .method("PUT")
            .uri(&format!("/dp/v1/objects/{}", uuid::Uuid::new_v4()))
            .header("Authorization", format!("Bearer {}", token))
            .header("Content-Length", TEST_DATA.len())
            .header("Content-Checksum", "sha256-1234567890abcdef")
            .body(Body::from(TEST_DATA))
            .unwrap();
        
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        
        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        
        response_json["object_id"].as_str().unwrap().to_string()
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[tokio::test]
    async fn test_chunker_checksum_calculation() {
        let chunker = Chunker::new_fixed(8);
        let data = b"Hello, World!";
        
        let chunks = chunker.chunk_data(data).unwrap();
        
        // Verify checksums are calculated
        for chunk in &chunks {
            assert!(!chunk.checksum.is_empty());
            assert_eq!(chunk.checksum.len(), 64); // SHA256 hex length
        }
    }

    #[tokio::test]
    async fn test_utils_range_parsing() {
        // Valid range header
        let range = crate::utils::parse_range_header("bytes=0-499", 1000).unwrap();
        assert_eq!(range.start, 0);
        assert_eq!(range.end, 499);
        
        // Range from start
        let range = crate::utils::parse_range_header("bytes=500-", 1000).unwrap();
        assert_eq!(range.start, 500);
        assert_eq!(range.end, 999);
        
        // Last bytes
        let range = crate::utils::parse_range_header("bytes=-500", 1000).unwrap();
        assert_eq!(range.start, 500);
        assert_eq!(range.end, 999);
    }

    #[tokio::test]
    async fn test_utils_date_formatting() {
        let date = chrono::Utc::now();
        let formatted = crate::utils::format_http_date(date);
        
        // Should be valid HTTP date format
        assert!(formatted.len() > 0);
        assert!(formatted.contains("GMT"));
    }

    #[tokio::test]
    async fn test_error_handling() {
        use crate::errors::ApiError;
        
        let error = ApiError::NotFound("test".to_string());
        let response = error.into_response();
        
        assert_eq!(response.status(), axum::http::StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_models_serialization() {
        use crate::models::{ChunkInfo, ChunkManifestFragment};
        
        let chunk = ChunkInfo {
            offset: 0,
            size: 1024,
            checksum: "test-checksum".to_string(),
            chunk_id: "test-chunk".to_string(),
        };
        
        let serialized = serde_json::to_string(&chunk).unwrap();
        let deserialized: ChunkInfo = serde_json::from_str(&serialized).unwrap();
        
        assert_eq!(chunk.offset, deserialized.offset);
        assert_eq!(chunk.size, deserialized.size);
        assert_eq!(chunk.checksum, deserialized.checksum);
    }
}
