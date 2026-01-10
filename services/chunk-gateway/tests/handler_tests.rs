#[cfg(test)]
mod handler_tests {
    use super::*;
    use axum::{
        body::Body,
        extract::{Path, Query, State},
        http::{Request, StatusCode},
        response::Response,
    };
    use tower::ServiceExt;
    use serde_json::json;

    // Mock dependencies
    struct MockStorageService {
        objects: std::collections::HashMap<String, Vec<u8>>,
        parts: std::collections::HashMap<String, std::collections::HashMap<u32, Vec<u8>>>,
    }

    impl MockStorageService {
        fn new() -> Self {
            Self {
                objects: std::collections::HashMap::new(),
                parts: std::collections::HashMap::new(),
            }
        }

        async fn store_object(&mut self, key: &str, data: Vec<u8>) -> Result<crate::models::StorageResult, crate::errors::ApiError> {
            self.objects.insert(key.to_string(), data.clone());
            Ok(crate::models::StorageResult {
                size: data.len(),
                checksum: "mock-checksum".to_string(),
                chunk_manifest: vec![],
            })
        }

        async fn get_object(&self, key: &str) -> Result<crate::models::StoredObject, crate::errors::ApiError> {
            self.objects.get(key)
                .map(|data| crate::models::StoredObject {
                    data: data.clone(),
                    checksum: "mock-checksum".to_string(),
                    content_type: Some("application/octet-stream".to_string()),
                    last_modified: chrono::Utc::now(),
                })
                .ok_or_else(|| crate::errors::ApiError::NotFound(format!("Object {} not found", key)))
        }
    }

    #[tokio::test]
    async fn test_put_object_handler_success() {
        let mut storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let object_id = "test-object-123";
        let test_data = b"Hello, World! This is test data for chunking.";
        let checksum = "sha256-1234567890abcdef";

        // Create valid token
        let token = create_test_token("put_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        // Simulate request
        let result = crate::handlers::put_object(
            State(&storage),
            Path(object_id.to_string()),
            claims,
            test_data.len(),
            checksum.to_string(),
            Body::from(*test_data),
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(response_json["object_id"], object_id);
        assert!(response_json["chunk_manifest"].is_array());
    }

    #[tokio::test]
    async fn test_put_object_handler_invalid_checksum() {
        let storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let object_id = "test-object-123";
        let test_data = b"Hello, World!";
        let invalid_checksum = "invalid-checksum";

        let token = create_test_token("put_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        let result = crate::handlers::put_object(
            State(&storage),
            Path(object_id.to_string()),
            claims,
            test_data.len(),
            invalid_checksum.to_string(),
            Body::from(*test_data),
        ).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            crate::errors::ApiError::BadRequest(msg) => {
                assert!(msg.contains("checksum"));
            }
            _ => panic!("Expected BadRequest error"),
        }
    }

    #[tokio::test]
    async fn test_get_object_handler_success() {
        let mut storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        // Store test object
        let test_data = b"Hello, World! Test data for retrieval.";
        storage.store_object("test-object", test_data.to_vec()).await.unwrap();

        let token = create_test_token("get_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        let result = crate::handlers::get_object(
            State(&storage),
            Path("test-object".to_string()),
            claims,
            Query(std::collections::HashMap::new()),
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // Verify headers
        assert_eq!(response.headers().get("content-type").unwrap(), "application/octet-stream");
        assert_eq!(response.headers().get("accept-ranges").unwrap(), "bytes");

        // Verify body
        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        assert_eq!(&body[..], test_data);
    }

    #[tokio::test]
    async fn test_get_object_handler_not_found() {
        let storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let token = create_test_token("get_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        let result = crate::handlers::get_object(
            State(&storage),
            Path("nonexistent-object".to_string()),
            claims,
            Query(std::collections::HashMap::new()),
        ).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            crate::errors::ApiError::NotFound(msg) => {
                assert!(msg.contains("not found"));
            }
            _ => panic!("Expected NotFound error"),
        }
    }

    #[tokio::test]
    async fn test_get_object_handler_range_request() {
        let mut storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let test_data = b"Hello, World! Range request test data.";
        storage.store_object("test-object", test_data.to_vec()).await.unwrap();

        let token = create_test_token("get_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        let mut query_params = std::collections::HashMap::new();
        query_params.insert("range".to_string(), "bytes=0-4".to_string());

        let result = crate::handlers::get_object(
            State(&storage),
            Path("test-object".to_string()),
            claims,
            Query(query_params),
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);

        assert_eq!(response.headers().get("content-range").unwrap(), "bytes 0-4/36");
        assert_eq!(response.headers().get("content-length").unwrap(), "5");

        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        assert_eq!(&body[..], b"Hello");
    }

    #[tokio::test]
    async fn test_head_object_handler_success() {
        let mut storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let test_data = b"Hello, World! HEAD request test.";
        storage.store_object("test-object", test_data.to_vec()).await.unwrap();

        let token = create_test_token("get_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        let result = crate::handlers::head_object(
            State(&storage),
            Path("test-object".to_string()),
            claims,
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // Verify headers are present
        assert!(response.headers().get("content-type").is_some());
        assert!(response.headers().get("etag").is_some());
        assert!(response.headers().get("content-length").is_some());
        assert_eq!(response.headers().get("accept-ranges").unwrap(), "bytes");

        // Verify no body
        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        assert!(body.is_empty());
    }

    #[tokio::test]
    async fn test_upload_part_handler_success() {
        let mut storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let upload_id = "test-upload-123";
        let part_number = 1;
        let test_data = b"Part data for upload test.";
        let checksum = "sha256-1234567890abcdef";

        let token = create_test_token("put_part", "test-bucket", "test-key", Some(upload_id), Some(part_number));
        let claims = auth_service.validate_token(&token).unwrap();

        let result = crate::handlers::upload_part(
            State(&storage),
            Path((upload_id.to_string(), part_number)),
            claims,
            test_data.len(),
            checksum.to_string(),
            Body::from(*test_data),
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert!(response_json.get("part_etag").is_some());
        assert!(response_json.get("part_size").is_some());
        assert!(response_json.get("chunk_manifest_fragment").is_some());
    }

    #[tokio::test]
    async fn test_upload_part_handler_invalid_part_number() {
        let storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let upload_id = "test-upload-123";
        let part_number = 10001; // Invalid part number
        let test_data = b"Part data.";
        let checksum = "sha256-1234567890abcdef";

        let token = create_test_token("put_part", "test-bucket", "test-key", Some(upload_id), Some(part_number));
        let claims = auth_service.validate_token(&token).unwrap();

        let result = crate::handlers::upload_part(
            State(&storage),
            Path((upload_id.to_string(), part_number)),
            claims,
            test_data.len(),
            checksum.to_string(),
            Body::from(*test_data),
        ).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            crate::errors::ApiError::BadRequest(msg) => {
                assert!(msg.contains("part number"));
            }
            _ => panic!("Expected BadRequest error"),
        }
    }

    #[tokio::test]
    async fn test_health_handler() {
        let storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let result = crate::handlers::health_check(
            State(&storage),
            State(&auth_service),
            State(&chunker),
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(response_json["status"], "healthy");
        assert!(response_json["timestamp"].is_string());
    }

    #[tokio::test]
    async fn test_error_response_formatting() {
        use crate::errors::ApiError;
        use axum::response::IntoResponse;

        let error = ApiError::NotFound("Test object not found".to_string());
        let response = error.into_response();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(response_json["error"], "Not Found");
        assert_eq!(response_json["message"], "Test object not found");
        assert!(response_json["timestamp"].is_string());
    }

    #[tokio::test]
    async fn test_content_length_validation() {
        let storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let token = create_test_token("put_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        // Test with mismatched content length
        let test_data = b"Hello";
        let wrong_length = 1000;

        let result = crate::handlers::put_object(
            State(&storage),
            Path("test-object".to_string()),
            claims,
            wrong_length,
            "sha256-123".to_string(),
            Body::from(*test_data),
        ).await;

        assert!(result.is_err());
        match result.unwrap_err() {
            crate::errors::ApiError::BadRequest(msg) => {
                assert!(msg.contains("Content-Length"));
            }
            _ => panic!("Expected BadRequest error"),
        }
    }

    #[tokio::test]
    async fn test_large_request_handling() {
        let storage = MockStorageService::new();
        let auth_service = crate::auth::AuthService::new("test-secret");
        let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);

        let token = create_test_token("put_object", "test-bucket", "test-key", None, None);
        let claims = auth_service.validate_token(&token).unwrap();

        // Simulate large data (10MB)
        let large_data = vec![0u8; 10 * 1024 * 1024];
        let checksum = "sha256-large-data-checksum";

        let result = crate::handlers::put_object(
            State(&storage),
            Path("large-object".to_string()),
            claims,
            large_data.len(),
            checksum.to_string(),
            Body::from(large_data),
        ).await;

        assert!(result.is_ok());
        let response = result.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        // Verify chunking occurred
        let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
        let response_json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert!(response_json["chunk_manifest"].as_array().unwrap().len() > 1);
    }

    // Helper function to create test tokens
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
}

#[cfg(test)]
mod middleware_tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        middleware,
        response::Response,
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_auth_middleware_valid_token() {
        let auth_service = crate::auth::AuthService::new("test-secret");
        
        let token = create_test_token("get_object", "test-bucket", "test-key", None, None);
        
        let app = axum::Router::new()
            .route("/test", axum::routing::get(|| async { axum::response::Json(json!({"status": "ok"})) }))
            .layer(middleware::from_fn(move |req, next| {
                let auth_service = auth_service.clone();
                async move {
                    // Extract Authorization header
                    let auth_header = req.headers().get("authorization");
                    if auth_header.is_none() {
                        return Ok(crate::errors::ApiError::Unauthorized("Missing authorization header".to_string()).into_response());
                    }
                    
                    let token = auth_header.unwrap().to_str().unwrap().replace("Bearer ", "");
                    let claims = auth_service.validate_token(token);
                    
                    if claims.is_err() {
                        return Ok(crate::errors::ApiError::Unauthorized("Invalid token".to_string()).into_response());
                    }
                    
                    next.run(req).await
                }
            }));

        let request = Request::builder()
            .uri("/test")
            .header("Authorization", format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_auth_middleware_invalid_token() {
        let auth_service = crate::auth::AuthService::new("test-secret");
        
        let app = axum::Router::new()
            .route("/test", axum::routing::get(|| async { axum::response::Json(json!({"status": "ok"})) }))
            .layer(middleware::from_fn(move |req, next| {
                let auth_service = auth_service.clone();
                async move {
                    let auth_header = req.headers().get("authorization");
                    if auth_header.is_none() {
                        return Ok(crate::errors::ApiError::Unauthorized("Missing authorization header".to_string()).into_response());
                    }
                    
                    let token = auth_header.unwrap().to_str().unwrap().replace("Bearer ", "");
                    let claims = auth_service.validate_token(token);
                    
                    if claims.is_err() {
                        return Ok(crate::errors::ApiError::Unauthorized("Invalid token".to_string()).into_response());
                    }
                    
                    next.run(req).await
                }
            }));

        let request = Request::builder()
            .uri("/test")
            .header("Authorization", "Bearer invalid-token")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_cors_middleware() {
        let app = axum::Router::new()
            .route("/test", axum::routing::get(|| async { axum::response::Json(json!({"status": "ok"})) }))
            .layer(middleware::from_fn(|req, next| async move {
                let response = next.run(req).await;
                
                // Add CORS headers
                let mut response = response;
                let headers = response.headers_mut();
                headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
                headers.insert("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, HEAD, OPTIONS".parse().unwrap());
                headers.insert("Access-Control-Allow-Headers", "Content-Type, Authorization".parse().unwrap());
                
                Ok(response)
            }));

        let request = Request::builder()
            .uri("/test")
            .header("Origin", "http://localhost:3000")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers().get("Access-Control-Allow-Origin").unwrap(), "*");
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
}
