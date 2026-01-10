#[cfg(test)]
mod test_config {
    use super::*;
    use std::collections::HashMap;

    /// Test configuration for the chunk gateway
    pub struct TestConfig {
        pub redis_url: String,
        pub jwt_secret: String,
        pub chunk_size: usize,
        pub max_upload_size: usize,
        pub temp_dir: String,
    }

    impl Default for TestConfig {
        fn default() -> Self {
            Self {
                redis_url: "redis://localhost:6379/15".to_string(),
                jwt_secret: "test-secret-key".to_string(),
                chunk_size: 8 * 1024 * 1024, // 8MB
                max_upload_size: 5 * 1024 * 1024 * 1024, // 5GB
                temp_dir: std::env::temp_dir().to_string_lossy().to_string(),
            }
        }
    }

    impl TestConfig {
        pub fn from_env() -> Self {
            Self {
                redis_url: std::env::var("TEST_REDIS_URL")
                    .unwrap_or_else(|_| "redis://localhost:6379/15".to_string()),
                jwt_secret: std::env::var("TEST_JWT_SECRET")
                    .unwrap_or_else(|_| "test-secret-key".to_string()),
                chunk_size: std::env::var("TEST_CHUNK_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(8 * 1024 * 1024),
                max_upload_size: std::env::var("TEST_MAX_UPLOAD_SIZE")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(5 * 1024 * 1024 * 1024),
                temp_dir: std::env::var("TEST_TEMP_DIR")
                    .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string()),
            }
        }
    }

    /// Test data generator
    pub struct TestDataGenerator;

    impl TestDataGenerator {
        /// Generate test data of specified size
        pub fn generate_data(size: usize) -> Vec<u8> {
            let mut data = Vec::with_capacity(size);
            for i in 0..size {
                data.push((i % 256) as u8);
            }
            data
        }

        /// Generate random test data
        pub fn generate_random_data(size: usize) -> Vec<u8> {
            use rand::{thread_rng, Rng};
            let mut rng = thread_rng();
            let mut data = Vec::with_capacity(size);
            for _ in 0..size {
                data.push(rng.gen());
            }
            data
        }

        /// Generate test file with content
        pub fn create_test_file(path: &str, size: usize) -> std::io::Result<()> {
            use std::fs::File;
            use std::io::Write;
            
            let data = Self::generate_data(size);
            let mut file = File::create(path)?;
            file.write_all(&data)?;
            Ok(())
        }

        /// Clean up test file
        pub fn cleanup_test_file(path: &str) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Mock HTTP client for testing
    pub struct MockHttpClient {
        pub responses: HashMap<String, (u16, String)>,
    }

    impl MockHttpClient {
        pub fn new() -> Self {
            Self {
                responses: HashMap::new(),
            }
        }

        pub fn add_response(&mut self, url: &str, status: u16, body: &str) {
            self.responses.insert(url.to_string(), (status, body.to_string()));
        }

        pub fn add_success_response(&mut self, url: &str, body: &str) {
            self.add_response(url, 200, body);
        }

        pub fn add_error_response(&mut self, url: &str, status: u16, body: &str) {
            self.add_response(url, status, body);
        }
    }

    /// Test utilities
    pub struct TestUtils;

    impl TestUtils {
        /// Create a temporary directory for tests
        pub fn create_temp_dir() -> String {
            let temp_dir = std::env::temp_dir();
            let test_dir = temp_dir.join(format!("chunk-gateway-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir_all(&test_dir).unwrap();
            test_dir.to_string_lossy().to_string()
        }

        /// Clean up temporary directory
        pub fn cleanup_temp_dir(path: &str) {
            let _ = std::fs::remove_dir_all(path);
        }

        /// Wait for async operation with timeout
        pub async fn wait_with_timeout<F, T>(
            future: F,
            timeout_ms: u64,
        ) -> Result<T, &'static str>
        where
            F: std::future::Future<Output = T>,
        {
            use tokio::time::{timeout, Duration};
            
            match timeout(Duration::from_millis(timeout_ms), future).await {
                Ok(result) => Ok(result),
                Err(_) => Err("Operation timed out"),
            }
        }

        /// Retry operation with exponential backoff
        pub async fn retry_with_backoff<F, T, E>(
            operation: F,
            max_retries: u32,
            initial_delay_ms: u64,
        ) -> Result<T, E>
        where
            F: Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, E>> + Send>>,
            E: std::fmt::Debug,
        {
            let mut delay = initial_delay_ms;
            
            for attempt in 0..=max_retries {
                match operation().await {
                    Ok(result) => return Ok(result),
                    Err(e) => {
                        if attempt == max_retries {
                            return Err(e);
                        }
                        tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                        delay *= 2; // Exponential backoff
                    }
                }
            }
            
            unreachable!()
        }

        /// Compare two byte slices and return differences
        pub fn compare_bytes(a: &[u8], b: &[u8]) -> Vec<usize> {
            let mut differences = Vec::new();
            let min_len = a.len().min(b.len());
            
            for i in 0..min_len {
                if a[i] != b[i] {
                    differences.push(i);
                }
            }
            
            // Add remaining bytes if lengths differ
            if a.len() > b.len() {
                differences.extend(min_len..a.len());
            } else if b.len() > a.len() {
                differences.extend(min_len..b.len());
            }
            
            differences
        }

        /// Generate checksum for test data
        pub fn generate_checksum(data: &[u8]) -> String {
            use sha2::{Sha256, Digest};
            let mut hasher = Sha256::new();
            hasher.update(data);
            format!("{:x}", hasher.finalize())
        }

        /// Verify checksum matches data
        pub fn verify_checksum(data: &[u8], expected: &str) -> bool {
            let actual = Self::generate_checksum(data);
            actual == expected
        }
    }

    /// Test assertions
    pub mod assertions {
        use super::*;

        /// Assert that two byte slices are equal
        pub fn assert_bytes_equal(a: &[u8], b: &[u8]) {
            assert_eq!(a.len(), b.len(), "Byte slices have different lengths");
            
            let differences = TestUtils::compare_bytes(a, b);
            if !differences.is_empty() {
                panic!("Byte slices differ at positions: {:?}", differences);
            }
        }

        /// Assert that response contains expected JSON field
        pub fn assert_json_contains(json: &serde_json::Value, field: &str) {
            if !json.get(field).is_some() {
                panic!("JSON does not contain field '{}': {}", field, json);
            }
        }

        /// Assert that response has expected status code
        pub fn assert_status_code(response: &axum::response::Response, expected: u16) {
            assert_eq!(
                response.status().as_u16(),
                expected,
                "Expected status {}, got {}",
                expected,
                response.status().as_u16()
            );
        }

        /// Assert that response has expected header
        pub fn assert_has_header(response: &axum::response::Response, name: &str) {
            if response.headers().get(name).is_none() {
                panic!("Response does not have header '{}'", name);
            }
        }

        /// Assert that header has expected value
        pub fn assert_header_value(response: &axum::response::Response, name: &str, value: &str) {
            let header_value = response.headers()
                .get(name)
                .unwrap_or_else(|| panic!("Response does not have header '{}'", name))
                .to_str()
                .unwrap_or_else(|_| panic!("Header '{}' is not valid UTF-8", name));
            
            assert_eq!(header_value, value);
        }
    }

    /// Mock services for testing
    pub mod mocks {
        use super::*;

        /// Mock storage service
        pub struct MockStorageService {
            objects: std::collections::HashMap<String, Vec<u8>>,
            parts: std::collections::HashMap<String, std::collections::HashMap<u32, Vec<u8>>>,
        }

        impl MockStorageService {
            pub fn new() -> Self {
                Self {
                    objects: std::collections::HashMap::new(),
                    parts: std::collections::HashMap::new(),
                }
            }

            pub async fn store_object(&mut self, key: &str, data: Vec<u8>) -> crate::models::StorageResult {
                self.objects.insert(key.to_string(), data.clone());
                crate::models::StorageResult {
                    size: data.len(),
                    checksum: TestUtils::generate_checksum(&data),
                    chunk_manifest: vec![],
                }
            }

            pub async fn get_object(&self, key: &str) -> Option<crate::models::StoredObject> {
                self.objects.get(key).map(|data| crate::models::StoredObject {
                    data: data.clone(),
                    checksum: TestUtils::generate_checksum(data),
                    content_type: Some("application/octet-stream".to_string()),
                    last_modified: chrono::Utc::now(),
                })
            }

            pub async fn store_part(&mut self, upload_id: &str, part_number: u32, data: Vec<u8>) -> crate::models::StorageResult {
                let parts = self.parts.entry(upload_id.to_string()).or_insert_with(std::collections::HashMap::new);
                parts.insert(part_number, data.clone());
                crate::models::StorageResult {
                    size: data.len(),
                    checksum: TestUtils::generate_checksum(&data),
                    chunk_manifest: vec![],
                }
            }

            pub async fn get_part(&self, upload_id: &str, part_number: u32) -> Option<crate::models::StoredObject> {
                self.parts.get(upload_id)
                    .and_then(|parts| parts.get(&part_number))
                    .map(|data| crate::models::StoredObject {
                        data: data.clone(),
                        checksum: TestUtils::generate_checksum(data),
                        content_type: Some("application/octet-stream".to_string()),
                        last_modified: chrono::Utc::now(),
                    })
            }
        }

        /// Mock authentication service
        pub struct MockAuthService {
            secret: String,
        }

        impl MockAuthService {
            pub fn new(secret: &str) -> Self {
                Self { secret: secret.to_string() }
            }

            pub fn create_token(&self, claims: &serde_json::Value) -> String {
                use jsonwebtoken::{encode, EncodingKey, Header};
                
                encode(
                    &Header::default(),
                    claims,
                    &EncodingKey::from_secret(self.secret.as_ref()),
                ).unwrap()
            }

            pub fn validate_token(&self, token: &str) -> Result<crate::auth::Claims, jsonwebtoken::errors::Error> {
                use jsonwebtoken::{decode, DecodingKey, Validation};
                
                let token_data = decode::<crate::auth::Claims>(
                    token,
                    &DecodingKey::from_secret(self.secret.as_ref()),
                    &Validation::default(),
                )?;
                
                Ok(token_data.claims)
            }
        }
    }

    /// Test macros
    #[macro_export]
    macro_rules! async_test {
        ($name:ident, $body:block) => {
            #[tokio::test]
            async fn $name() {
                let _ = env_logger::builder()
                    .filter_level(log::LevelFilter::Debug)
                    .is_test(true)
                    .try_init();
                
                $body
            }
        };
    }

    #[macro_export]
    macro_rules! integration_test {
        ($name:ident, $body:block) => {
            #[tokio::test]
            #[ignore] // Integration tests are ignored by default
            async fn $name() {
                let _ = env_logger::builder()
                    .filter_level(log::LevelFilter::Info)
                    .is_test(true)
                    .try_init();
                
                $body
            }
        };
    }

    #[cfg(test)]
    pub mod test_helpers {
        use super::*;

        /// Create a test application instance
        pub async fn create_test_app() -> axum::Router {
            let storage = crate::storage::StorageService::new();
            let auth_service = crate::auth::AuthService::new("test-secret");
            let chunker = crate::chunking::Chunker::new_fixed(8 * 1024 * 1024);
            
            crate::main::create_app(storage, auth_service, chunker).await
        }

        /// Create a test JWT token
        pub fn create_test_token(
            action: &str,
            bucket: &str,
            key: &str,
            upload_id: Option<&str>,
            part_number: Option<u32>,
        ) -> String {
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
            
            let mock_auth = mocks::MockAuthService::new("test-secret");
            mock_auth.create_token(&claims)
        }

        /// Make a test request to the application
        pub async fn make_request(
            app: axum::Router,
            method: &str,
            uri: &str,
            headers: Vec<(&str, &str)>,
            body: Option<Vec<u8>>,
        ) -> axum::response::Response {
            use axum::body::Body;
            use http::Request;
            
            let mut request_builder = Request::builder()
                .method(method)
                .uri(uri);
            
            for (name, value) in headers {
                request_builder = request_builder.header(name, value);
            }
            
            let request = if let Some(body_data) = body {
                request_builder.body(Body::from(body_data)).unwrap()
            } else {
                request_builder.body(Body::empty()).unwrap()
            };
            
            app.oneshot(request).await.unwrap()
        }
    }
}
