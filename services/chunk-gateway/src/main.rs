mod auth;
mod chunker;
mod errors;
mod handlers;
mod models;
mod storage;
mod utils;

use std::env;
use std::net::SocketAddr;

use axum::routing::{get, put};
use axum::Router;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use auth::AuthService;
use storage::StorageService;

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

    let auth_service = AuthService::new(secret, region);
    let storage_service = StorageService::new();

    let app_state = models::AppState::new(auth_service, storage_service);

    let app = Router::new()
        .route("/healthz", get(handlers::health))
        .route(
            "/dp/v1/uploads/:upload_id/parts/:part_number",
            put(handlers::upload_part),
        )
        .route(
            "/dp/v1/objects/:object_version_id",
            get(handlers::get_object).head(handlers::head_object),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    let addr: SocketAddr = format!("{bind_addr}:{port}").parse().expect("invalid bind addr");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind failed");

    tracing::info!("Chunk Gateway starting on {}", addr);
    axum::serve(listener, app).await.expect("server failed");
}
