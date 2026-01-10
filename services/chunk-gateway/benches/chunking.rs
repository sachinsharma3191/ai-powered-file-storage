use criterion::{black_box, criterion_group, criterion_main, Criterion};
use chunk_gateway::chunking::{Chunker, ChunkInfo};
use chunk_gateway::models::ChunkManifestFragment;
use std::time::Duration;

fn bench_chunker_fixed_size(c: &mut Criterion) {
    let mut group = c.benchmark_group("chunker_fixed_size");
    
    // Different chunk sizes
    for chunk_size in [1024, 8192, 65536, 1048576, 8388608].iter() {
        let chunker = Chunker::new_fixed(*chunk_size);
        let data = vec![0u8; 100 * 1024 * 1024]; // 100MB of test data
        
        group.bench_with_input(
            format!("fixed_size_{}bytes", chunk_size),
            chunk_size,
            |b, _| {
                b.iter(|| {
                    black_box(chunker.chunk_data(black_box(&data)).unwrap())
                });
            },
        );
    }
    
    group.finish();
}

fn bench_chunker_content_defined(c: &mut Criterion) {
    let mut group = c.benchmark_group("chunker_content_defined");
    
    // Different chunk sizes for content-defined chunking
    for chunk_size in [8192, 65536, 1048576, 4194304].iter() {
        let chunker = Chunker::new_content_defined(*chunk_size, *chunk_size * 4);
        let data = vec![0u8; 100 * 1024 * 1024]; // 100MB of test data
        
        group.bench_with_input(
            format!("content_defined_{}bytes", chunk_size),
            chunk_size,
            |b, _| {
                b.iter(|| {
                    black_box(chunker.chunk_data(black_box(&data)).unwrap())
                });
            },
        );
    }
    
    group.finish();
}

fn bench_checksum_calculation(c: &mut Criterion) {
    let mut group = c.benchmark_group("checksum_calculation");
    
    // Different data sizes
    for size in [1024, 1048576, 10485760, 104857600].iter() {
        let data = vec![0u8; *size];
        
        group.bench_with_input(
            format!("checksum_{}bytes", size),
            size,
            |b, _| {
                b.iter(|| {
                    use sha2::{Sha256, Digest};
                    let mut hasher = Sha256::new();
                    hasher.update(black_box(&data));
                    black_box(hasher.finalize())
                });
            },
        );
    }
    
    group.finish();
}

fn bench_chunk_serialization(c: &mut Criterion) {
    let mut group = c.benchmark_group("chunk_serialization");
    
    // Create test chunks
    let chunks: Vec<ChunkInfo> = (0..1000)
        .map(|i| ChunkInfo {
            offset: i * 8192,
            size: 8192,
            checksum: format!("checksum-{:016x}", i),
            chunk_id: format!("chunk-{:04x}", i),
        })
        .collect();
    
    group.bench_function("serialize_chunks", |b| {
        b.iter(|| {
            black_box(serde_json::to_string(black_box(&chunks)).unwrap())
        });
    });
    
    group.bench_function("deserialize_chunks", |b| {
        let serialized = serde_json::to_string(&chunks).unwrap();
        b.iter(|| {
            black_box(serde_json::from_str::<Vec<ChunkInfo>>(black_box(&serialized)).unwrap())
        });
    });
    
    group.finish();
}

fn bench_manifest_generation(c: &mut Criterion) {
    let mut group = c.benchmark_group("manifest_generation");
    
    // Different numbers of chunks
    for chunk_count in [100, 500, 1000, 5000].iter() {
        let chunks: Vec<ChunkInfo> = (0..*chunk_count)
            .map(|i| ChunkInfo {
                offset: i * 8192,
                size: 8192,
                checksum: format!("checksum-{:016x}", i),
                chunk_id: format!("chunk-{:04x}", i),
            })
            .collect();
        
        group.bench_with_input(
            format!("manifest_{}chunks", chunk_count),
            chunk_count,
            |b, _| {
                b.iter(|| {
                    let manifest = ChunkManifestFragment {
                        chunk_count: chunks.len(),
                        total_size: chunks.iter().map(|c| c.size).sum(),
                        chunk_checksums: chunks.iter().map(|c| c.checksum.clone()).collect(),
                        chunk_ids: chunks.iter().map(|c| c.chunk_id.clone()).collect(),
                    };
                    black_box(serde_json::to_string(&manifest).unwrap())
                });
            },
        );
    }
    
    group.finish();
}

fn bench_concurrent_chunking(c: &mut Criterion) {
    let mut group = c.benchmark_group("concurrent_chunking");
    
    let chunker = Chunker::new_fixed(8192);
    let data = vec![0u8; 100 * 1024 * 1024]; // 100MB
    
    group.bench_function("sequential_chunking", |b| {
        b.iter(|| {
            black_box(chunker.chunk_data(black_box(&data)).unwrap())
        });
    });
    
    // Simulate concurrent chunking (though actual implementation is sequential)
    group.bench_function("concurrent_simulation", |b| {
        use std::sync::Arc;
        use tokio::runtime::Runtime;
        
        let rt = Runtime::new().unwrap();
        let chunker = Arc::new(chunker);
        let data = Arc::new(data);
        
        b.iter(|| {
            rt.block_on(async {
                let chunker = chunker.clone();
                let data = data.clone();
                black_box(tokio::task::spawn_blocking(move || {
                    chunker.chunk_data(&data).unwrap()
                }).await.unwrap())
            });
        });
    });
    
    group.finish();
}

fn bench_memory_usage(c: &mut Criterion) {
    let mut group = c.benchmark_group("memory_usage");
    
    // Test memory usage with different data sizes
    for size in [1048576, 10485760, 104857600, 1073741824].iter() {
        let chunker = Chunker::new_fixed(8192);
        let data = vec![0u8; *size];
        
        group.bench_with_input(
            format!("memory_{}bytes", size),
            size,
            |b, _| {
                b.iter(|| {
                    let chunks = chunker.chunk_data(black_box(&data)).unwrap();
                    // Force memory usage by calculating total size
                    black_box(chunks.iter().map(|c| c.size).sum::<usize>())
                });
            },
        );
    }
    
    group.finish();
}

fn bench_realistic_data(c: &mut Criterion) {
    let mut group = c.benchmark_group("realistic_data");
    
    // Generate realistic test data with patterns
    let realistic_data = generate_realistic_data(100 * 1024 * 1024); // 100MB
    let chunker = Chunker::new_content_defined(65536, 262144);
    
    group.bench_function("realistic_content_defined", |b| {
        b.iter(|| {
            black_box(chunker.chunk_data(black_box(&realistic_data)).unwrap())
        });
    });
    
    // Test with repetitive data (like logs)
    let repetitive_data = generate_repetitive_data(100 * 1024 * 1024);
    
    group.bench_function("repetitive_content_defined", |b| {
        b.iter(|| {
            black_box(chunker.chunk_data(black_box(&repetitive_data)).unwrap())
        });
    });
    
    group.finish();
}

fn generate_realistic_data(size: usize) -> Vec<u8> {
    use rand::{thread_rng, Rng};
    
    let mut rng = thread_rng();
    let mut data = Vec::with_capacity(size);
    
    // Generate data with realistic patterns
    while data.len() < size {
        // Add some text patterns
        let text = b"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
        let remaining = size - data.len();
        let to_add = text.len().min(remaining);
        data.extend_from_slice(&text[..to_add]);
        
        // Add some binary data
        let binary_size = (1024..8192).gen::<usize>().min(size - data.len());
        for _ in 0..binary_size {
            data.push(rng.gen());
        }
    }
    
    data
}

fn generate_repetitive_data(size: usize) -> Vec<u8> {
    let pattern = b"[2024-01-10 12:00:00] INFO: Processing request #12345\n";
    let mut data = Vec::with_capacity(size);
    
    while data.len() < size {
        let remaining = size - data.len();
        let to_add = pattern.len().min(remaining);
        data.extend_from_slice(&pattern[..to_add]);
    }
    
    data
}

criterion_group!(
    benches,
    bench_chunker_fixed_size,
    bench_chunker_content_defined,
    bench_checksum_calculation,
    bench_chunk_serialization,
    bench_manifest_generation,
    bench_concurrent_chunking,
    bench_memory_usage,
    bench_realistic_data
);

criterion_main!(benches);
