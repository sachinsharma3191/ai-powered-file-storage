use axum::http::{HeaderMap, StatusCode};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;
use thiserror::Error;

use crate::errors::ApiError;

#[derive(Debug, Deserialize)]
pub struct Claims {
    pub act: Option<String>,
    pub bucket: Option<String>,
    pub key: Option<String>,
    pub upload_id: Option<String>,
    pub part_number: Option<serde_json::Value>,
    pub region: Option<String>,
    pub version: Option<String>,
}

#[derive(Clone)]
pub struct AuthService {
    decoding_key: DecodingKey,
    validation: Validation,
    region: Option<String>,
}

impl AuthService {
    pub fn new(secret: String, region: Option<String>) -> Self {
        let decoding_key = DecodingKey::from_secret(secret.as_bytes());
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_audience(&["chunk-gateway"]);
        validation.set_issuer(&["storage-control-plane"]);
        validation.validate_exp = true;

        Self {
            decoding_key,
            validation,
            region,
        }
    }

    pub fn authenticate(&self, headers: &HeaderMap) -> Result<Claims, ApiError> {
        let token = self.extract_bearer_token(headers)?;
        let data = decode::<Claims>(&token, &self.decoding_key, &self.validation)
            .map_err(|_| ApiError::InvalidToken)?;
        Ok(data.claims)
    }

    pub fn authorize_put_object(&self, claims: &Claims, bucket: &str, key: &str) -> Result<(), ApiError> {
        self.authorize_region(claims)?;

        if claims.act.as_deref() != Some("put_object") {
            return Err(ApiError::TokenScopeMismatch);
        }

        if claims.bucket.as_deref() != Some(bucket) {
            return Err(ApiError::TokenScopeMismatch);
        }

        if claims.key.as_deref() != Some(key) {
            return Err(ApiError::TokenScopeMismatch);
        }

        Ok(())
    }

    pub fn authorize_get_object(&self, claims: &Claims, bucket: &str, key: &str) -> Result<(), ApiError> {
        self.authorize_region(claims)?;

        if claims.act.as_deref() != Some("get_object") {
            return Err(ApiError::TokenScopeMismatch);
        }

        if claims.bucket.as_deref() != Some(bucket) {
            return Err(ApiError::TokenScopeMismatch);
        }

        if claims.key.as_deref() != Some(key) {
            return Err(ApiError::TokenScopeMismatch);
        }

        Ok(())
    }

    pub fn authorize_put_part(
        &self,
        claims: &Claims,
        bucket: &str,
        upload_id: &str,
        part_number: u32,
    ) -> Result<String, ApiError> {
        self.authorize_region(claims)?;

        if claims.act.as_deref() != Some("put_part") {
            return Err(ApiError::TokenScopeMismatch);
        }

        if claims.bucket.as_deref() != Some(bucket) {
            return Err(ApiError::TokenScopeMismatch);
        }

        if claims.upload_id.as_deref() != Some(upload_id) {
            return Err(ApiError::TokenScopeMismatch);
        }

        let claim_part_number = claims
            .part_number
            .as_ref()
            .and_then(parse_part_number)
            .ok_or(ApiError::TokenScopeMismatch)?;

        if claim_part_number != part_number {
            return Err(ApiError::TokenScopeMismatch);
        }

        let key = claims.key.clone().ok_or(ApiError::TokenScopeMismatch)?;
        Ok(key)
    }

    fn authorize_region(&self, claims: &Claims) -> Result<(), ApiError> {
        let Some(expected) = self.region.as_deref() else {
            return Ok(());
        };

        if claims.region.as_deref() != Some(expected) {
            return Err(ApiError::TokenScopeMismatch);
        }

        Ok(())
    }

    fn extract_bearer_token(&self, headers: &HeaderMap) -> Result<String, ApiError> {
        use axum::http::header;

        let auth = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .trim();

        if auth.is_empty() {
            return Err(ApiError::MissingToken);
        }

        let (scheme, token) = auth.split_once(' ').unwrap_or(("", ""));
        if scheme != "Bearer" || token.trim().is_empty() {
            return Err(ApiError::MissingToken);
        }

        Ok(token.trim().to_string())
    }
}

fn parse_part_number(v: &serde_json::Value) -> Option<u32> {
    match v {
        serde_json::Value::Number(n) => n.as_u64().and_then(|x| u32::try_from(x).ok()),
        serde_json::Value::String(s) => s.parse::<u32>().ok(),
        _ => None,
    }
}
