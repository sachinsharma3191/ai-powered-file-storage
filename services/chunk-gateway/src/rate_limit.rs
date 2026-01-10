use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub requests_per_minute: u32,
    pub requests_per_hour: u32,
    pub burst_size: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_minute: 1000,
            requests_per_hour: 10000,
            burst_size: 100,
        }
    }
}

#[derive(Debug, Clone)]
struct TokenBucket {
    tokens: u32,
    max_tokens: u32,
    refill_rate: u32, // tokens per second
    last_refill: Instant,
}

impl TokenBucket {
    fn new(max_tokens: u32, refill_rate: u32) -> Self {
        Self {
            tokens: max_tokens,
            max_tokens,
            refill_rate,
            last_refill: Instant::now(),
        }
    }

    fn try_consume(&mut self, tokens: u32) -> bool {
        self.refill();
        if self.tokens >= tokens {
            self.tokens -= tokens;
            true
        } else {
            false
        }
    }

    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill);
        let tokens_to_add = (elapsed.as_secs() as u32 * self.refill_rate) / 60;
        
        if tokens_to_add > 0 {
            self.tokens = (self.tokens + tokens_to_add).min(self.max_tokens);
            self.last_refill = now;
        }
    }
}

#[derive(Debug, Clone)]
struct ClientLimits {
    minute_bucket: TokenBucket,
    hour_bucket: TokenBucket,
}

#[derive(Debug, Clone)]
pub struct RateLimiter {
    clients: Arc<RwLock<HashMap<String, ClientLimits>>>,
    config: RateLimitConfig,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            config,
        }
    }

    pub async fn check_rate_limit(&self, client_id: &str) -> Result<(), RateLimitError> {
        let mut clients = self.clients.write().await;
        
        let limits = clients.entry(client_id.to_string()).or_insert_with(|| ClientLimits {
            minute_bucket: TokenBucket::new(self.config.requests_per_minute, self.config.requests_per_minute),
            hour_bucket: TokenBucket::new(self.config.requests_per_hour, self.config.requests_per_hour / 60),
        });

        // Check both minute and hour limits
        if !limits.minute_bucket.try_consume(1) {
            return Err(RateLimitError::TooManyRequests("Rate limit exceeded: too many requests per minute".to_string()));
        }

        if !limits.hour_bucket.try_consume(1) {
            return Err(RateLimitError::TooManyRequests("Rate limit exceeded: too many requests per hour".to_string()));
        }

        Ok(())
    }

    // Cleanup old clients to prevent memory leaks
    pub async fn cleanup(&self) {
        let mut clients = self.clients.write().await;
        clients.retain(|_, limits| {
            // Keep clients that have been used recently
            limits.minute_bucket.last_refill.elapsed() < Duration::from_hours(2)
        });
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RateLimitError {
    #[error("Rate limit exceeded: {0}")]
    TooManyRequests(String),
}

pub async fn rate_limit_middleware(
    State(limiter): State<Arc<RateLimiter>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract client ID from JWT claims or API key
    let client_id = extract_client_id(&request).unwrap_or_else(|| "anonymous".to_string());
    
    match limiter.check_rate_limit(&client_id).await {
        Ok(()) => {
            let mut response = next.run(request).await;
            // Add rate limit headers
            response.headers_mut().insert("X-RateLimit-Limit", "1000".parse().unwrap());
            response.headers_mut().insert("X-RateLimit-Remaining", "999".parse().unwrap());
            response.headers_mut().insert("X-RateLimit-Reset", "60".parse().unwrap());
            Ok(response)
        }
        Err(_) => Err(StatusCode::TOO_MANY_REQUESTS),
    }
}

fn extract_client_id(request: &Request) -> Option<String> {
    // Try to extract from Authorization header (JWT)
    if let Some(auth_header) = request.headers().get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.starts_with("Bearer ") {
                // In a real implementation, you'd decode the JWT and extract the subject
                // For now, use a hash of the token as client ID
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut hasher = DefaultHasher::new();
                auth_str.hash(&mut hasher);
                return Some(format!("jwt_{}", hasher.finish()));
            }
        }
    }
    
    // Try to extract from API key header
    if let Some(api_key) = request.headers().get("x-api-key") {
        if let Ok(key_str) = api_key.to_str() {
            return Some(format!("api_key_{}", &key_str[..8.min(key_str.len())]));
        }
    }
    
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::{sleep, Duration as TokioDuration};

    #[tokio::test]
    async fn test_rate_limiting() {
        let config = RateLimitConfig {
            requests_per_minute: 5,
            requests_per_hour: 100,
            burst_size: 5,
        };
        
        let limiter = RateLimiter::new(config);
        
        // Should allow first 5 requests
        for _ in 0..5 {
            assert!(limiter.check_rate_limit("test_client").await.is_ok());
        }
        
        // 6th request should fail
        assert!(limiter.check_rate_limit("test_client").await.is_err());
    }

    #[tokio::test]
    async fn test_refill_after_time() {
        let config = RateLimitConfig {
            requests_per_minute: 2,
            requests_per_hour: 100,
            burst_size: 2,
        };
        
        let limiter = RateLimiter::new(config);
        
        // Use up the tokens
        assert!(limiter.check_rate_limit("test_client").await.is_ok());
        assert!(limiter.check_rate_limit("test_client").await.is_ok());
        assert!(limiter.check_rate_limit("test_client").await.is_err());
        
        // Wait for refill (in real test, you'd mock time)
        sleep(TokioDuration::from_secs(61)).await;
        
        // Should work again after refill
        assert!(limiter.check_rate_limit("test_client").await.is_ok());
    }
}
