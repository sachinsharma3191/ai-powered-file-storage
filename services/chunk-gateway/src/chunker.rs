use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::models::{ChunkInfo, ChunkManifestFragment};

#[derive(Debug, Error)]
pub enum ChunkError {
    #[error("invalid_chunk_size")]
    InvalidChunkSize,
    #[error("chunking_failed")]
    ChunkingFailed,
}

#[derive(Clone)]
pub struct Chunker {
    chunk_size: usize,
    use_content_defined: bool,
}

impl Chunker {
    pub fn new(chunk_size: usize, use_content_defined: bool) -> Result<Self, ChunkError> {
        if chunk_size < 1024 || chunk_size > 64 * 1024 * 1024 {
            return Err(ChunkError::InvalidChunkSize);
        }

        Ok(Self {
            chunk_size,
            use_content_defined,
        })
    }

    pub fn default() -> Self {
        Self::new(8 * 1024 * 1024, false).unwrap()
    }

    pub fn chunk_bytes(&self, data: &[u8]) -> Result<Vec<ChunkInfo>, ChunkError> {
        if self.use_content_defined {
            self.content_defined_chunking(data)
        } else {
            self.fixed_size_chunking(data)
        }
    }

    fn fixed_size_chunking(&self, data: &[u8]) -> Result<Vec<ChunkInfo>, ChunkError> {
        let mut chunks = Vec::new();
        let mut offset = 0;

        while offset < data.len() {
            let end = std::cmp::min(offset + self.chunk_size, data.len());
            let chunk_data = &data[offset..end];
            
            let checksum = self.compute_checksum(chunk_data);
            let chunk_id = format!("chunk-{}-{}", offset, checksum);

            chunks.push(ChunkInfo {
                offset: offset as u64,
                size: chunk_data.len(),
                checksum,
                chunk_id,
            });

            offset = end;
        }

        Ok(chunks)
    }

    fn content_defined_chunking(&self, data: &[u8]) -> Result<Vec<ChunkInfo>, ChunkError> {
        let mut chunks = Vec::new();
        let mut offset = 0;
        let window_size = 8; // Small enough to prevent overflow (8 * 8 = 64 bits)
        let target_pattern = 0x1FFFFFFFFFFFFFFF; // 61 bits of 1s

        while offset < data.len() {
            let chunk_start = offset;
            let mut chunk_end = offset;
            let mut rolling_hash = 0u64;
            let mask = if window_size < 8 {
            (1u64 << (window_size * 8)).saturating_sub(1)
        } else {
            u64::MAX // Use all bits for larger windows
        };

            while chunk_end < data.len() && (chunk_end - chunk_start) < self.chunk_size * 2 {
                rolling_hash = ((rolling_hash << 8) | data[chunk_end] as u64) & mask;
                
                if (chunk_end - chunk_start) >= self.chunk_size && (rolling_hash & target_pattern) == target_pattern {
                    chunk_end += 1;
                    break;
                }
                
                chunk_end += 1;
            }

            // Ensure minimum chunk size
            if (chunk_end - chunk_start) < 1024 && chunk_end < data.len() {
                chunk_end = std::cmp::min(chunk_start + self.chunk_size, data.len());
            }

            let chunk_data = &data[chunk_start..chunk_end];
            let checksum = self.compute_checksum(chunk_data);
            let chunk_id = format!("chunk-{}-{}", chunk_start, checksum);

            chunks.push(ChunkInfo {
                offset: chunk_start as u64,
                size: chunk_data.len(),
                checksum,
                chunk_id,
            });

            offset = chunk_end;
        }

        Ok(chunks)
    }

    pub fn create_manifest(&self, chunks: &[ChunkInfo]) -> ChunkManifestFragment {
        let chunk_checksums: Vec<String> = chunks.iter().map(|c| c.checksum.clone()).collect();
        let manifest_checksum = self.compute_checksum(chunk_checksums.join("").as_bytes());

        ChunkManifestFragment {
            chunks: chunks.to_vec(),
            checksum: manifest_checksum,
            algorithm: if self.use_content_defined {
                "content-defined-sha256".to_string()
            } else {
                "fixed-size-sha256".to_string()
            },
        }
    }

    fn compute_checksum(&self, data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        let digest = hasher.finalize();
        hex::encode(digest)
    }

    pub fn verify_chunk(&self, data: &[u8], expected_checksum: &str) -> bool {
        let actual_checksum = self.compute_checksum(data);
        actual_checksum == expected_checksum
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixed_size_chunking() {
        let chunker = Chunker::new(1024, false).unwrap();
        let data = vec![0u8; 3000];
        let chunks = chunker.chunk_bytes(&data).unwrap();
        
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].size, 1024);
        assert_eq!(chunks[1].size, 1024);
        assert_eq!(chunks[2].size, 952);
    }

    #[test]
    fn test_chunker_validation() {
        assert!(Chunker::new(512, false).is_err()); // Too small
        assert!(Chunker::new(100 * 1024 * 1024, false).is_err()); // Too large
        assert!(Chunker::new(8 * 1024 * 1024, false).is_ok()); // Valid
    }
}
