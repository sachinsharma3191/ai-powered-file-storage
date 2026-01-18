use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::collections::HashMap;
use std::sync::Arc;

use crate::auth::Claims;
use crate::errors::{ApiError, Result};
use crate::models::{AppState, UploadPartResponse, ChunkManifestFragment};
use crate::storage::StorageService;
use crate::utils::{extract_content_checksum, parse_range_header, format_http_date, validate_content_length};

pub async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

pub async fn upload_part(
    State(state): State<AppState>,
    Path((upload_id, part_number)): Path<(String, u32)>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse> {
    // Authenticate and authorize
    let claims = state.auth_service.authenticate(&headers)?;
    let _key = state.auth_service.authorize_put_part(&claims, "", &upload_id, part_number)?;

    // Validate content length
    let max_part_size = 5 * 1024 * 1024 * 1024; // 5GB max part size
    validate_content_length(&headers, Some(max_part_size))
        .map_err(|e| ApiError::ChunkError(e))?;

    // Verify checksum if provided
    if let Some((algorithm, expected_checksum)) = extract_content_checksum(&headers) {
        if algorithm != "sha256" {
            return Err(ApiError::InvalidChecksum);
        }

        if !state.storage_service.verify_checksum(&body, &expected_checksum) {
            return Err(ApiError::InvalidChecksum);
        }
    }

    // Store the part with chunking
    let stored_part = state
        .storage_service
        .store_part(&upload_id, part_number, body.to_vec())
        .await
        .map_err(|e| ApiError::StorageError(Box::new(e)))?;

    let chunk_manifest = stored_part.data.chunk_manifest.ok_or_else(|| {
        ApiError::ChunkError("No chunk manifest generated".to_string())
    })?;

    Ok((
        StatusCode::OK,
        Json(UploadPartResponse {
            part_etag: stored_part.data.etag,
            part_size: stored_part.data.data.len(),
            chunk_manifest_fragment: chunk_manifest,
        }),
    ))
}

pub async fn get_object(
    State(state): State<AppState>,
    Path(object_version_id): Path<String>,
    headers: HeaderMap,
) -> Result<Response> {
    // Authenticate and authorize
    let claims = state.auth_service.authenticate(&headers)?;
    
    // Extract bucket and key from claims or object_version_id
    let (bucket, key) = parse_object_id(&object_version_id)?;
    state.auth_service.authorize_get_object(&claims, &bucket, &key)?;

    // Get the object
    let stored_data = state
        .storage_service
        .get_object(&object_version_id)
        .await
        .map_err(|e| ApiError::StorageError(Box::new(e)))?;

    // Handle range requests
    let data = if let Some(range_header) = headers.get(header::RANGE) {
        let range_str = range_header.to_str().map_err(|_| ApiError::InvalidRange)?;
        let (start, end) = parse_range_header(range_str, stored_data.data.len() as u64)
            .map_err(|e| ApiError::ChunkError(e))?;

        state
            .storage_service
            .get_object_range(&object_version_id, start, Some(end))
            .await
            .map_err(|e| ApiError::StorageError(Box::new(e)))?
    } else {
        stored_data.data.clone()
    };

    // Track download metrics and emit event
    let download_size = data.len() as u64;
    let _ = state.metrics_service.record_download(
        &claims.sub,
        &bucket,
        &key,
        download_size,
    ).await;

    // Check for download anomalies and emit event if needed
    if let Some(anomaly) = state.metrics_service.check_download_anomaly(&claims.sub, &bucket, &key).await {
        let _ = state.event_service.emit_download_event(
            &claims.sub,
            &bucket,
            &key,
            download_size,
            anomaly.download_count,
            anomaly.threshold,
        ).await;
    }

    // Build response headers
    let mut response_headers = HeaderMap::new();
    response_headers.insert(header::CONTENT_TYPE, "application/octet-stream".parse().unwrap());
    response_headers.insert(header::ETAG, stored_data.etag.parse().unwrap());
    response_headers.insert(header::CONTENT_LENGTH, data.len().to_string().parse().unwrap());
    response_headers.insert("x-checksum-sha256", stored_data.sha256.parse().unwrap());
    response_headers.insert(
        header::LAST_MODIFIED,
        format_http_date(&stored_data.created_at).parse().unwrap(),
    );
    response_headers.insert(header::ACCEPT_RANGES, "bytes".parse().unwrap());

    // Add chunk manifest info if available
    if let Some(ref manifest) = stored_data.chunk_manifest {
        response_headers.insert("x-chunk-algorithm", manifest.algorithm.parse().unwrap());
        response_headers.insert("x-chunk-count", manifest.chunks.len().to_string().parse().unwrap());
    }

    Ok((StatusCode::OK, response_headers, Bytes::from(data)).into_response())
}

pub async fn head_object(
    State(state): State<AppState>,
    Path(object_version_id): Path<String>,
    headers: HeaderMap,
) -> Result<impl IntoResponse> {
    // Authenticate and authorize
    let claims = state.auth_service.authenticate(&headers)?;
    
    let (bucket, key) = parse_object_id(&object_version_id)?;
    state.auth_service.authorize_get_object(&claims, &bucket, &key)?;

    // Get the object metadata
    let stored_data = state
        .storage_service
        .get_object(&object_version_id)
        .await
        .map_err(|e| ApiError::StorageError(Box::new(e)))?;

    // Build response headers
    let mut response_headers = HeaderMap::new();
    response_headers.insert(header::CONTENT_TYPE, "application/octet-stream".parse().unwrap());
    response_headers.insert(header::ETAG, stored_data.etag.parse().unwrap());
    response_headers.insert(header::CONTENT_LENGTH, stored_data.data.len().to_string().parse().unwrap());
    response_headers.insert("x-checksum-sha256", stored_data.sha256.parse().unwrap());
    response_headers.insert(
        header::LAST_MODIFIED,
        format_http_date(&stored_data.created_at).parse().unwrap(),
    );
    response_headers.insert(header::ACCEPT_RANGES, "bytes".parse().unwrap());

    // Add chunk manifest info if available
    if let Some(ref manifest) = stored_data.chunk_manifest {
        response_headers.insert("x-chunk-algorithm", manifest.algorithm.parse().unwrap());
        response_headers.insert("x-chunk-count", manifest.chunks.len().to_string().parse().unwrap());
    }

    Ok((StatusCode::OK, response_headers))
}

fn parse_object_id(object_id: &str) -> Result<(String, String)> {
    // For now, assume object_id is in format "bucket:key"
    // In a real implementation, this might fetch metadata from Rails
    let parts: Vec<&str> = object_id.splitn(2, ':').collect();
    if parts.len() != 2 {
        return Err(ApiError::ChunkError("Invalid object ID format".to_string()));
    }

    Ok((parts[0].to_string(), parts[1].to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_object_id() {
        let (bucket, key) = parse_object_id("test-bucket:test-key").unwrap();
        assert_eq!(bucket, "test-bucket");
        assert_eq!(key, "test-key");
    }

    #[test]
    fn test_parse_object_id_invalid() {
        assert!(parse_object_id("invalid").is_err());
    }
}
