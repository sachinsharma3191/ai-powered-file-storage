use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::chunker::{Chunker, ChunkError};
use crate::models::{ChunkManifestFragment, ChunkInfo};

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("not_found")]
    NotFound,
    #[error("chunk_error")]
    ChunkError(#[from] ChunkError),
    #[error("io_error")]
    IoError(#[from] std::io::Error),
    #[error("serialization_error")]
    SerializationError(#[from] serde_json::Error),
}

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredData {
    pub data: Vec<u8>,
    pub sha256: String,
    pub etag: String,
    pub chunk_manifest: Option<ChunkManifestFragment>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredPart {
    pub upload_id: String,
    pub part_number: u32,
    pub data: StoredData,
}

#[derive(Clone)]
pub struct StorageService {
    objects: Arc<RwLock<HashMap<String, StoredData>>>,
    parts: Arc<RwLock<HashMap<String, StoredPart>>>,
    chunker: Chunker,
}

impl StorageService {
    pub fn new() -> Self {
        Self {
            objects: Arc::new(RwLock::new(HashMap::new())),
            parts: Arc::new(RwLock::new(HashMap::new())),
            chunker: Chunker::default(),
        }
    }

    pub async fn store_object(&self, key: &str, data: Vec<u8>) -> Result<StoredData, StorageError> {
        let chunks = self.chunker.chunk_bytes(&data)?;
        let manifest = self.chunker.create_manifest(&chunks);
        
        let stored_data = StoredData {
            sha256: self.compute_checksum(&data),
            etag: format!("\"{}\"", self.compute_checksum(&data)),
            data,
            chunk_manifest: Some(manifest),
            created_at: chrono::Utc::now(),
        };

        self.objects.write().await.insert(key.to_string(), stored_data.clone());
        Ok(stored_data)
    }

    pub async fn get_object(&self, key: &str) -> Result<StoredData, StorageError> {
        let objects = self.objects.read().await;
        objects
            .get(key)
            .cloned()
            .ok_or(StorageError::NotFound)
    }

    pub async fn store_part(
        &self,
        upload_id: &str,
        part_number: u32,
        data: Vec<u8>,
    ) -> Result<StoredPart, StorageError> {
        let chunks = self.chunker.chunk_bytes(&data)?;
        let manifest = self.chunker.create_manifest(&chunks);
        
        let stored_data = StoredData {
            sha256: self.compute_checksum(&data),
            etag: format!("\"{}\"", self.compute_checksum(&data)),
            data,
            chunk_manifest: Some(manifest),
            created_at: chrono::Utc::now(),
        };

        let part = StoredPart {
            upload_id: upload_id.to_string(),
            part_number,
            data: stored_data.clone(),
        };

        let key = self.part_key(upload_id, part_number);
        self.parts.write().await.insert(key, part.clone());
        Ok(part)
    }

    pub async fn get_part(&self, upload_id: &str, part_number: u32) -> Result<StoredPart, StorageError> {
        let parts = self.parts.read().await;
        let key = self.part_key(upload_id, part_number);
        parts
            .get(&key)
            .cloned()
            .ok_or(StorageError::NotFound)
    }

    pub async fn get_object_range(&self, key: &str, start: u64, end: Option<u64>) -> Result<Vec<u8>, StorageError> {
        let stored_data = self.get_object(key).await?;
        let data_len = stored_data.data.len() as u64;

        if start >= data_len {
            return Ok(Vec::new());
        }

        let end = end.unwrap_or(data_len).min(data_len);
        if end <= start {
            return Ok(Vec::new());
        }

        Ok(stored_data.data[start as usize..end as usize].to_vec())
    }

    pub async fn delete_object(&self, key: &str) -> Result<(), StorageError> {
        self.objects.write().await.remove(key).ok_or(StorageError::NotFound)?;
        Ok(())
    }

    pub async fn delete_part(&self, upload_id: &str, part_number: u32) -> Result<(), StorageError> {
        let key = self.part_key(upload_id, part_number);
        self.parts.write().await.remove(&key).ok_or(StorageError::NotFound)?;
        Ok(())
    }

    pub async fn list_parts(&self, upload_id: &str) -> Result<Vec<StoredPart>, StorageError> {
        let parts = self.parts.read().await;
        let mut result = Vec::new();

        for (_, part) in parts.iter() {
            if part.upload_id == upload_id {
                result.push(part.clone());
            }
        }

        result.sort_by_key(|p| p.part_number);
        Ok(result)
    }

    pub fn verify_checksum(&self, data: &[u8], expected: &str) -> bool {
        let actual = self.compute_checksum(data);
        actual == expected
    }

    fn compute_checksum(&self, data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        let digest = hasher.finalize();
        hex::encode(digest)
    }

    fn part_key(&self, upload_id: &str, part_number: u32) -> String {
        format!("{}:{}", upload_id, part_number)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_store_and_get_object() {
        let storage = StorageService::new();
        let key = "test-object";
        let data = b"Hello, World!".to_vec();

        let stored = storage.store_object(key, data.clone()).await.unwrap();
        assert_eq!(stored.data, data);

        let retrieved = storage.get_object(key).await.unwrap();
        assert_eq!(retrieved.data, data);
        assert_eq!(retrieved.sha256, stored.sha256);
    }

    #[tokio::test]
    async fn test_store_and_get_part() {
        let storage = StorageService::new();
        let upload_id = "test-upload";
        let part_number = 1;
        let data = b"Part data".to_vec();

        let stored = storage.store_part(upload_id, part_number, data.clone()).await.unwrap();
        assert_eq!(stored.data.data, data);

        let retrieved = storage.get_part(upload_id, part_number).await.unwrap();
        assert_eq!(retrieved.data.data, data);
    }

    #[tokio::test]
    async fn test_object_range() {
        let storage = StorageService::new();
        let key = "test-object";
        let data = b"0123456789".to_vec();

        storage.store_object(key, data.clone()).await.unwrap();
        
        let range = storage.get_object_range(key, 2, Some(5)).await.unwrap();
        assert_eq!(range, b"234");
        
        let range = storage.get_object_range(key, 7, None).await.unwrap();
        assert_eq!(range, b"789");
    }
}
