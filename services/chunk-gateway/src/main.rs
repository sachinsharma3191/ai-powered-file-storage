use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::Arc,
};

use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, put},
    Json, Router,
};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tokio::sync::RwLock;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
struct AppState {
    decoding_key: DecodingKey,
    validation: Validation,
    region: Option<String>,
    objects: Arc<RwLock<HashMap<String, StoredBytes>>>,
    parts: Arc<RwLock<HashMap<String, StoredBytes>>>,
}

#[derive(Clone)]
struct StoredBytes {
    data: Vec<u8>,
    sha256: String,
    etag: String,
}

#[derive(Debug, Deserialize)]
struct Claims {
    act: Option<String>,
    bucket: Option<String>,
    key: Option<String>,
    upload_id: Option<String>,
    part_number: Option<serde_json::Value>,
    region: Option<String>,
}

#[derive(Debug, Error)]
enum ApiError {
    #[error("missing_token")]
    MissingToken,

    #[error("invalid_token")]
    InvalidToken,

    #[error("token_scope_mismatch")]
    TokenScopeMismatch,

    #[error("not_found")]
    NotFound,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = match self {
            ApiError::MissingToken => (StatusCode::UNAUTHORIZED, "missing_token"),
            ApiError::InvalidToken => (StatusCode::UNAUTHORIZED, "invalid_token"),
            ApiError::TokenScopeMismatch => (StatusCode::FORBIDDEN, "token_scope_mismatch"),
            ApiError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
        };

        (status, Json(serde_json::json!({ "error": code }))).into_response()
    }
}

#[derive(Debug, Serialize)]
struct PutObjectResponse {
    bucket: String,
    key: String,
    size: usize,
    etag: String,
    sha256: String,
}

#[derive(Debug, Serialize)]
struct UploadPartResponse {
    bucket: String,
    key: String,
    upload_id: String,
    part_number: u32,
    size: usize,
    etag: String,
    sha256: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let secret = match env::var("SCOPED_JWT_SECRET") {
        Ok(s) if !s.trim().is_empty() => s,
        _ => {
            eprintln!("SCOPED_JWT_SECRET must be set and must match the Rails control-plane signing secret");
            std::process::exit(1);
        }
    };

    let region = env::var("CHUNK_GATEWAY_REGION").ok().filter(|s| !s.trim().is_empty());

    let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(4000);

    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["chunk-gateway"]);
    validation.set_issuer(&["storage-control-plane"]);
    validation.validate_exp = true;

    let state = AppState {
        decoding_key,
        validation,
        region,
        objects: Arc::new(RwLock::new(HashMap::new())),
        parts: Arc::new(RwLock::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/healthz", get(healthz))
        .route(
            "/v1/buckets/:bucket/objects/*key",
            put(put_object).get(get_object),
        )
        .route(
            "/v1/buckets/:bucket/multipart_uploads/:upload_id/parts/:part_number",
            put(upload_part),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr: SocketAddr = format!("{bind_addr}:{port}").parse().expect("invalid bind addr");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind failed");

    axum::serve(listener, app).await.expect("server failed");
}

async fn healthz() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn put_object(
    State(state): State<AppState>,
    Path((bucket, key)): Path<(String, String)>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, ApiError> {
    let claims = authenticate(&state, &headers)?;
    authorize_put_object(&state, &claims, &bucket, &key)?;

    let stored = hash_bytes(&body);
    let object_key = object_map_key(&bucket, &key);
    state
        .objects
        .write()
        .await
        .insert(object_key, StoredBytes { data: body.to_vec(), ..stored.clone() });

    Ok((
        StatusCode::OK,
        Json(PutObjectResponse {
            bucket,
            key,
            size: stored.data.len(),
            etag: stored.etag,
            sha256: stored.sha256,
        }),
    ))
}

async fn get_object(
    State(state): State<AppState>,
    Path((bucket, key)): Path<(String, String)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let claims = authenticate(&state, &headers)?;
    authorize_get_object(&state, &claims, &bucket, &key)?;

    let object_key = object_map_key(&bucket, &key);
    let stored = {
        let map = state.objects.read().await;
        map.get(&object_key).cloned()
    };

    let stored = stored.ok_or(ApiError::NotFound)?;

    let mut out_headers = HeaderMap::new();
    out_headers.insert(header::CONTENT_TYPE, "application/octet-stream".parse().unwrap());
    out_headers.insert(header::ETAG, stored.etag.parse().unwrap());
    out_headers.insert(
        "x-checksum-sha256",
        stored.sha256.parse().unwrap(),
    );

    Ok((StatusCode::OK, out_headers, Bytes::from(stored.data)).into_response())
}

async fn upload_part(
    State(state): State<AppState>,
    Path((bucket, upload_id, part_number)): Path<(String, String, u32)>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<impl IntoResponse, ApiError> {
    let claims = authenticate(&state, &headers)?;
    let key = authorize_upload_part(&state, &claims, &bucket, &upload_id, part_number)?;

    let stored = hash_bytes(&body);
    let part_key = multipart_part_map_key(&bucket, &key, &upload_id, part_number);
    state
        .parts
        .write()
        .await
        .insert(part_key, StoredBytes { data: body.to_vec(), ..stored.clone() });

    Ok((
        StatusCode::OK,
        Json(UploadPartResponse {
            bucket,
            key,
            upload_id,
            part_number,
            size: stored.data.len(),
            etag: stored.etag,
            sha256: stored.sha256,
        }),
    ))
}

fn object_map_key(bucket: &str, key: &str) -> String {
    format!("{bucket}\0{key}")
}

fn multipart_part_map_key(bucket: &str, key: &str, upload_id: &str, part_number: u32) -> String {
    format!("{bucket}\0{key}\0{upload_id}\0{part_number}")
}

fn hash_bytes(bytes: &Bytes) -> StoredBytes {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let sha256 = hex::encode(digest);

    StoredBytes {
        data: bytes.to_vec(),
        sha256: sha256.clone(),
        etag: format!("\"{sha256}\""),
    }
}

fn bearer_token(headers: &HeaderMap) -> Result<String, ApiError> {
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

fn authenticate(state: &AppState, headers: &HeaderMap) -> Result<Claims, ApiError> {
    let token = bearer_token(headers)?;

    let data = decode::<Claims>(&token, &state.decoding_key, &state.validation)
        .map_err(|_| ApiError::InvalidToken)?;

    Ok(data.claims)
}

fn authorize_put_object(state: &AppState, claims: &Claims, bucket: &str, key: &str) -> Result<(), ApiError> {
    authorize_region(state, claims)?;

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

fn authorize_get_object(state: &AppState, claims: &Claims, bucket: &str, key: &str) -> Result<(), ApiError> {
    authorize_region(state, claims)?;

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

fn authorize_upload_part(
    state: &AppState,
    claims: &Claims,
    bucket: &str,
    upload_id: &str,
    part_number: u32,
) -> Result<String, ApiError> {
    authorize_region(state, claims)?;

    if claims.act.as_deref() != Some("upload_part") {
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

fn authorize_region(state: &AppState, claims: &Claims) -> Result<(), ApiError> {
    let Some(expected) = state.region.as_deref() else {
        return Ok(());
    };

    if claims.region.as_deref() != Some(expected) {
        return Err(ApiError::TokenScopeMismatch);
    }

    Ok(())
}

fn parse_part_number(v: &serde_json::Value) -> Option<u32> {
    match v {
        serde_json::Value::Number(n) => n.as_u64().and_then(|x| u32::try_from(x).ok()),
        serde_json::Value::String(s) => s.parse::<u32>().ok(),
        _ => None,
    }
}
