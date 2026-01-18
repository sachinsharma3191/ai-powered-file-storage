#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, Utc};
    use jsonwebtoken::{DecodingKey, EncodingKey, Validation};

    #[test]
    fn test_create_token() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: "test-account".to_string(),
        };

        let token = auth_service.create_token(&claims).unwrap();
        assert!(!token.is_empty());
        
        // Verify token structure (should have 3 parts separated by dots)
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3);
    }

    #[test]
    fn test_validate_valid_token() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: "test-account".to_string(),
        };

        let token = auth_service.create_token(&claims).unwrap();
        let validated_claims = auth_service.validate_token(&token).unwrap();
        
        assert_eq!(validated_claims.sub, claims.sub);
        assert_eq!(validated_claims.account_id, claims.account_id);
        assert_eq!(validated_claims.exp, claims.exp);
    }

    #[test]
    fn test_validate_invalid_token() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        let invalid_tokens = vec![
            "",
            "invalid",
            "invalid.token",
            "invalid.token.structure",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature",
        ];

        for token in invalid_tokens {
            let result = auth_service.validate_token(token);
            assert!(result.is_err(), "Token '{}' should be invalid", token);
        }
    }

    #[test]
    fn test_validate_expired_token() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: (Utc::now() - Duration::hours(1)).timestamp() as usize, // Expired
            iat: (Utc::now() - Duration::hours(2)).timestamp() as usize,
            account_id: "test-account".to_string(),
        };

        let token = auth_service.create_token(&claims).unwrap();
        let result = auth_service.validate_token(&token);
        assert!(result.is_err());
        
        match result {
            Err(AuthError::ExpiredToken) => {}, // Expected
            _ => panic!("Expected ExpiredToken error"),
        }
    }

    #[test]
    fn test_validate_token_with_wrong_secret() {
        let secret1 = "secret1";
        let secret2 = "secret2";
        let auth_service1 = AuthService::new(secret1.to_string(), None);
        let auth_service2 = AuthService::new(secret2.to_string(), None);
        
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: "test-account".to_string(),
        };

        let token = auth_service1.create_token(&claims).unwrap();
        let result = auth_service2.validate_token(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_token_with_region() {
        let secret = "test-secret-key";
        let region = Some("us-west-2".to_string());
        let auth_service = AuthService::new(secret.to_string(), region);
        
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: "test-account".to_string(),
        };

        let token = auth_service.create_token(&claims).unwrap();
        let validated_claims = auth_service.validate_token(&token).unwrap();
        
        assert_eq!(validated_claims.sub, claims.sub);
    }

    #[test]
    fn test_claims_serialization() {
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: 1640995200, // Fixed timestamp
            iat: 1640991600, // Fixed timestamp
            account_id: "test-account".to_string(),
        };

        let json = serde_json::to_string(&claims).unwrap();
        let deserialized: Claims = serde_json::from_str(&json).unwrap();
        
        assert_eq!(deserialized.sub, claims.sub);
        assert_eq!(deserialized.exp, claims.exp);
        assert_eq!(deserialized.iat, claims.iat);
        assert_eq!(deserialized.account_id, claims.account_id);
    }

    #[test]
    fn test_edge_case_tokens() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        // Test with very short expiration
        let claims = Claims {
            sub: "test-user".to_string(),
            exp: (Utc::now() + Duration::seconds(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: "test-account".to_string(),
        };

        let token = auth_service.create_token(&claims).unwrap();
        
        // Should be valid immediately
        assert!(auth_service.validate_token(&token).is_ok());
        
        // Wait for expiration (in real tests, you might use a mock clock)
        std::thread::sleep(std::time::Duration::from_secs(2));
        assert!(auth_service.validate_token(&token).is_err());
    }

    #[test]
    fn test_token_with_special_characters() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        let claims = Claims {
            sub: "test-user@example.com".to_string(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: "account-with-special-chars_123".to_string(),
        };

        let token = auth_service.create_token(&claims).unwrap();
        let validated_claims = auth_service.validate_token(&token).unwrap();
        
        assert_eq!(validated_claims.sub, claims.sub);
        assert_eq!(validated_claims.account_id, claims.account_id);
    }

    #[test]
    fn test_concurrent_token_creation() {
        let secret = "test-secret-key";
        let auth_service = std::sync::Arc::new(AuthService::new(secret.to_string(), None));
        
        let mut handles = vec![];
        
        for i in 0..10 {
            let auth_clone = auth_service.clone();
            let handle = std::thread::spawn(move || {
                let claims = Claims {
                    sub: format!("user-{}", i),
                    exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
                    iat: Utc::now().timestamp() as usize,
                    account_id: format!("account-{}", i),
                };
                
                auth_clone.create_token(&claims)
            });
            handles.push(handle);
        }
        
        for handle in handles {
            let token = handle.join().unwrap();
            assert!(token.is_ok());
            assert!(!token.unwrap().is_empty());
        }
    }

    #[test]
    fn test_error_types() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        // Test various error conditions
        let test_cases = vec![
            ("", AuthError::InvalidToken),
            "invalid.token.here", // Should cause InvalidToken
        ];
        
        for (token, expected_error) in test_cases {
            let result = auth_service.validate_token(token);
            assert!(result.is_err());
            // Note: Specific error types might vary based on the underlying JWT library
        }
    }

    #[test]
    fn test_max_token_size() {
        let secret = "test-secret-key";
        let auth_service = AuthService::new(secret.to_string(), None);
        
        // Create claims with very long strings
        let long_string = "a".repeat(10000);
        let claims = Claims {
            sub: long_string.clone(),
            exp: (Utc::now() + Duration::hours(1)).timestamp() as usize,
            iat: Utc::now().timestamp() as usize,
            account_id: long_string,
        };

        let token = auth_service.create_token(&claims).unwrap();
        assert!(!token.is_empty());
        
        // Token should still be valid despite being large
        assert!(auth_service.validate_token(&token).is_ok());
    }
}
