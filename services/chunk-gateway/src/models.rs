use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::auth::{AuthService, Claims};
use crate::events::EventService;
use crate::metrics::MetricsService;
use crate::storage::StorageService;

#[derive(Clone)]
pub struct AppState {
    pub auth_service: AuthService,
    pub storage_service: StorageService,
    pub metrics_service: MetricsService,
    pub event_service: EventService,
}

impl AppState {
    pub fn new(
        auth_service: AuthService, 
        storage_service: StorageService,
        metrics_service: MetricsService,
        event_service: EventService
    ) -> Self {
        Self {
            auth_service,
            storage_service,
            metrics_service,
            event_service,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct UploadPartRequest {
    pub upload_id: String,
    pub part_number: u32,
}

#[derive(Debug, Serialize)]
pub struct UploadPartResponse {
    pub part_etag: String,
    pub part_size: usize,
    pub chunk_manifest_fragment: ChunkManifestFragment,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChunkManifestFragment {
    pub chunks: Vec<ChunkInfo>,
    pub checksum: String,
    pub algorithm: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChunkInfo {
    pub offset: u64,
    pub size: usize,
    pub checksum: String,
    pub chunk_id: String,
}

#[derive(Debug, Serialize)]
pub struct ObjectMetadata {
    pub etag: String,
    pub size: u64,
    pub last_modified: String,
    pub content_type: String,
    pub accept_ranges: String,
}
