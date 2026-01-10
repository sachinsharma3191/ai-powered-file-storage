use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("missing_token")]
    MissingToken,

    #[error("invalid_token")]
    InvalidToken,

    #[error("token_scope_mismatch")]
    TokenScopeMismatch,

    #[error("not_found")]
    NotFound,

    #[error("invalid_checksum")]
    InvalidChecksum,

    #[error("storage_error")]
    StorageError(#[from] Box<dyn std::error::Error + Send + Sync>),

    #[error("invalid_range")]
    InvalidRange,

    #[error("chunk_error")]
    ChunkError(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error_code) = match self {
            ApiError::MissingToken => (StatusCode::UNAUTHORIZED, "missing_token"),
            ApiError::InvalidToken => (StatusCode::UNAUTHORIZED, "invalid_token"),
            ApiError::TokenScopeMismatch => (StatusCode::FORBIDDEN, "token_scope_mismatch"),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            ApiError::InvalidChecksum => (StatusCode::BAD_REQUEST, "invalid_checksum"),
            ApiError::StorageError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "storage_error"),
            ApiError::InvalidRange => (StatusCode::BAD_REQUEST, "invalid_range"),
            ApiError::ChunkError(_) => (StatusCode::INTERNAL_SERVER_ERROR, "chunk_error"),
        };

        let body = Json(json!({ "error": error_code }));
        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, ApiError>;
