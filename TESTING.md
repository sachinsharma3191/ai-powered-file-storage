# Testing Guide for S3 AI MCP System

This comprehensive testing guide covers both the Python agent and Rust chunk gateway components.

## 📋 Table of Contents

- [Overview](#overview)
- [Python Agent Testing](#python-agent-testing)
- [Rust Chunk Gateway Testing](#rust-chunk-gateway-testing)
- [Integration Testing](#integration-testing)
- [Performance Testing](#performance-testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Test Data Management](#test-data-management)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The S3 AI MCP system includes comprehensive test suites for:

### Python Agent Tests
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Performance Tests**: Benchmarking and load testing
- **Security Tests**: Authentication and authorization validation

### Rust Chunk Gateway Tests
- **Unit Tests**: Core functionality testing
- **Integration Tests**: API endpoint testing
- **Benchmark Tests**: Performance measurement
- **Property Tests**: Fuzzing and edge case testing

## 🐍 Python Agent Testing

### Test Structure

```
services/agent/tests/
├── __init__.py
├── conftest.py              # Test configuration and fixtures
├── test_event_consumer.py   # Event consumption tests
├── test_decision_engine.py  # Decision making tests
├── test_notification_dispatcher.py  # Notification tests
├── test_action_executor.py  # Action execution tests
└── integration/
    ├── test_ruby_integration.py
    └── test_rust_integration.py
```

### Running Tests

#### Quick Start
```bash
cd services/agent

# Install test dependencies
pip install -r requirements-test.txt

# Run all tests
python run_tests.py all

# Run with coverage
python run_tests.py all --coverage

# Run only unit tests
python run_tests.py unit

# Run integration tests
python run_tests.py integration
```

#### Advanced Options
```bash
# Run with verbose output
python run_tests.py all --verbose

# Run specific test file
pytest tests/test_event_consumer.py -v

# Run with specific markers
pytest -m "unit" -v
pytest -m "integration" -v
pytest -m "slow" -v

# Run with coverage report
pytest --cov=core --cov=models --cov-report=html

# Run performance benchmarks
pytest --benchmark-only
```

### Test Categories

#### Unit Tests (`@pytest.mark.unit`)
- Test individual components in isolation
- Use mocks for external dependencies
- Fast execution, no external services required

#### Integration Tests (`@pytest.mark.integration`)
- Test component interactions
- Require external services (Redis, Kafka, RabbitMQ)
- Slower execution, more comprehensive coverage

#### Performance Tests (`@pytest.mark.slow`)
- Benchmark critical paths
- Load testing scenarios
- Memory usage profiling

### Test Fixtures

Key fixtures in `conftest.py`:

```python
@pytest.fixture
def mock_redis():
    """Mock Redis client for testing"""
    
@pytest.fixture  
def decision_engine():
    """Decision engine with mock LLM"""
    
@pytest.fixture
def sample_events():
    """Sample events for testing"""
```

### Mock Services

#### Redis Mock
```python
@pytest.fixture
def mock_redis():
    redis_client = AsyncMock()
    redis_client.ping.return_value = True
    redis_client.xreadgroup.return_value = []
    return redis_client
```

#### LLM Mock
```python
@pytest.fixture
def mock_llm_engine():
    engine = AsyncMock(spec=LLMDecisionEngine)
    engine.analyze_event.return_value = {
        'risk_assessment': 'medium',
        'recommended_actions': ['send_notification']
    }
    return engine
```

### Test Examples

#### Event Consumer Test
```python
async def test_process_event_success(consumer, sample_event_wrapper):
    """Test successful event processing"""
    result = await consumer.process_event(sample_event_wrapper)
    assert result is True
```

#### Decision Engine Test
```python
async def test_threshold_rule(engine, sample_metric_event):
    """Test threshold rule evaluation"""
    rule = Rule(
        id="test-threshold",
        rule_type=RuleType.THRESHOLD,
        conditions={"threshold": 1000, "operator": ">"}
    )
    result = await engine.evaluate(sample_metric_event, rule)
    assert result is True
```

## 🦀 Rust Chunk Gateway Testing

### Test Structure

```
services/chunk-gateway/tests/
├── integration_tests.rs     # Integration tests
├── handler_tests.rs         # Handler unit tests
├── test_config.rs          # Test configuration
└── benchmarks/
    └── chunking.rs         # Performance benchmarks
```

### Running Tests

#### Quick Start
```bash
cd services/chunk-gateway

# Run all tests
cargo test

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_health_endpoint

# Run integration tests
cargo test --test integration_tests

# Run benchmarks
cargo bench
```

#### Advanced Options
```bash
# Run with coverage
cargo tarpaulin --out html

# Run specific module
cargo test chunking::

# Run ignored tests
cargo test -- --ignored

# Run with specific features
cargo test --features "test-integration"

# Run performance tests
cargo bench -- --measurement-time 30
```

### Test Categories

#### Unit Tests
- Individual function testing
- In-memory mock services
- Fast execution

#### Integration Tests
- Full HTTP request/response testing
- Database integration
- External service mocking

#### Benchmark Tests
- Performance measurement
- Memory usage analysis
- Concurrent operation testing

### Test Configuration

#### Test Config (`test_config.rs`)
```rust
pub struct TestConfig {
    pub redis_url: String,
    pub jwt_secret: String,
    pub chunk_size: usize,
    pub max_upload_size: usize,
}
```

#### Mock Services
```rust
pub struct MockStorageService {
    objects: HashMap<String, Vec<u8>>,
    parts: HashMap<String, HashMap<u32, Vec<u8>>>,
}
```

### Test Examples

#### HTTP Handler Test
```rust
#[tokio::test]
async fn test_health_endpoint() {
    let app = create_app().await;
    
    let request = Request::builder()
        .uri("/healthz")
        .body(Body::empty())
        .unwrap();
    
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
```

#### Chunking Benchmark
```rust
fn bench_chunker_fixed_size(c: &mut Criterion) {
    let chunker = Chunker::new_fixed(8192);
    let data = vec![0u8; 100 * 1024 * 1024]; // 100MB
    
    group.bench_function("fixed_size_chunking", |b| {
        b.iter(|| {
            chunker.chunk_data(&data).unwrap()
        });
    });
}
```

## 🔗 Integration Testing

### End-to-End Workflows

#### Complete Event Flow
```python
async def test_complete_event_flow():
    """Test event from Ruby to Python to Rust and back"""
    # 1. Ruby emits event to Redis
    # 2. Python agent processes event
    # 3. Python calls Rust API for action
    # 4. Rust responds with result
    # 5. Python sends notification
```

#### Multi-Service Integration
```bash
# Start all services
docker-compose -f docker-compose.rust.yml up -d

# Run integration tests
cd services/agent
python run_tests.py integration

cd ../chunk-gateway  
cargo test --test integration_tests
```

### Test Data Management

#### Fixtures and Factories
```python
# Python
@pytest.fixture
def sample_bucket():
    return {
        "name": "test-bucket",
        "region": "us-west-2",
        "account_id": "123456789"
    }

# Rust
pub fn create_test_object() -> ObjectEvent {
    ObjectEvent {
        event_id: "test-123".to_string(),
        bucket_name: "test-bucket".to_string(),
        // ...
    }
}
```

#### Test Data Cleanup
```python
@pytest.fixture(autouse=True)
async def cleanup_test_data():
    yield
    # Cleanup after each test
    await cleanup_redis()
    await cleanup_temp_files()
```

## ⚡ Performance Testing

### Python Agent Benchmarks

#### Event Processing
```python
def test_event_processing_throughput():
    """Test 10,000 events per second"""
    start_time = time.time()
    
    for event in generate_events(10000):
        await process_event(event)
    
    duration = time.time() - start_time
    assert duration < 1.0  # Should process in < 1 second
```

#### Memory Usage
```python
def test_memory_usage():
    """Monitor memory during processing"""
    import psutil
    process = psutil.Process()
    
    initial_memory = process.memory_info().rss
    
    # Process large batch
    await process_large_batch(events)
    
    final_memory = process.memory_info().rss
    memory_increase = final_memory - initial_memory
    
    assert memory_increase < 100 * 1024 * 1024  # < 100MB increase
```

### Rust Gateway Benchmarks

#### Chunking Performance
```rust
fn bench_chunking_throughput(c: &mut Criterion) {
    let chunker = Chunker::new_fixed(8192);
    let data = vec![0u8; 1024 * 1024 * 1024]; // 1GB
    
    group.throughput(Throughput::Bytes(data.len() as u64));
    group.bench_function("chunk_1gb", |b| {
        b.iter(|| chunker.chunk_data(&data).unwrap())
    });
}
```

#### Concurrent Requests
```rust
#[tokio::test]
async fn test_concurrent_uploads() {
    let app = create_app().await;
    let handles: Vec<_> = (0..100).map(|i| {
        let app = app.clone();
        tokio::spawn(async move {
            make_upload_request(&app, i).await
        })
    }).collect();
    
    let results = futures::future::join_all(handles).await;
    assert!(results.iter().all(|r| r.is_ok()));
}
```

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
name: Tests
on: [push, pull_request]

jobs:
  python-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd services/agent
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      
      - name: Run tests
        run: |
          cd services/agent
          python run_tests.py all --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  rust-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      
      - name: Run tests
        run: |
          cd services/chunk-gateway
          cargo test --all-features
      
      - name: Run benchmarks
        run: |
          cd services/chunk-gateway
          cargo bench

  integration-tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports: [6379:6379]
    
    steps:
      - uses: actions/checkout@v3
      - name: Run integration tests
        run: |
          docker-compose -f docker-compose.rust.yml up -d
          sleep 30
          cd services/agent && python run_tests.py integration
          cd ../chunk-gateway && cargo test --test integration_tests
```

### Local Development

#### Pre-commit Hooks
```bash
# Install pre-commit
pip install pre-commit

# Setup hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

#### Docker Testing
```bash
# Build test image
docker build -f Dockerfile.test -t s3-ai-agent-test .

# Run tests in container
docker run --rm -v $(pwd):/app s3-ai-agent-test

# Integration testing with docker-compose
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

## 📊 Test Data Management

### Test Data Generation

#### Python
```python
def generate_test_events(count: int) -> List[BaseEvent]:
    """Generate realistic test events"""
    events = []
    for i in range(count):
        event = ObjectEvent(
            event_id=f"test-event-{i}",
            bucket_name=f"test-bucket-{i % 10}",
            object_key=f"test-file-{i}.txt",
            object_size=random.randint(1024, 1024*1024),
            # ...
        )
        events.append(event)
    return events
```

#### Rust
```rust
pub fn generate_test_objects(count: usize) -> Vec<ObjectEvent> {
    (0..count).map(|i| ObjectEvent {
        event_id: format!("test-event-{}", i),
        bucket_name: format!("test-bucket-{}", i % 10),
        object_key: format!("test-file-{}.txt", i),
        object_size: thread_rng().gen_range(1024..1024*1024),
        // ...
    }).collect()
}
```

### Test Cleanup

#### Automated Cleanup
```python
@pytest.fixture(scope="session", autouse=True)
async def global_cleanup():
    yield
    # Cleanup after all tests
    await cleanup_test_databases()
    await cleanup_temp_directories()
    await cleanup_docker_containers()
```

## 🔧 Troubleshooting

### Common Issues

#### Redis Connection Failed
```bash
# Start Redis for testing
docker run -d -p 6379:6379 redis:7

# Or use testcontainers
pip install testcontainers
```

#### Kafka Not Available
```bash
# Start Kafka for testing
docker-compose -f docker-compose.kafka.yml up -d

# Skip Kafka tests
pytest -m "not kafka"
```

#### LLM API Errors
```bash
# Mock LLM for testing
export LLM_ENABLED=false
pytest -m "not llm"
```

#### Rust Compilation Errors
```bash
# Update dependencies
cargo update

# Clean build
cargo clean && cargo build

# Check for missing features
cargo check --all-features
```

### Debug Mode

#### Python
```bash
# Enable debug logging
LOG_LEVEL=DEBUG python -m pytest tests/ -v -s

# Use debugger
python -m pytest --pdb tests/

# Profile tests
python -m pytest --profile tests/
```

#### Rust
```bash
# Enable debug output
RUST_LOG=debug cargo test -- --nocapture

# Use debugger
cargo test --no-default-features --features "debug"

# Profile tests
cargo test --features "profiling"
```

### Performance Issues

#### Memory Leaks
```python
# Track memory usage
pip install memory-profiler
python -m memory_profiler tests/test_memory.py

# Or use pytest-memory-profiler
pytest --memory-profiler
```

#### Slow Tests
```bash
# Find slow tests
pytest --durations=10

# Run in parallel
pytest -n auto

# Use fixtures to reduce setup time
```

## 📈 Test Coverage

### Python Coverage Goals
- **Overall Coverage**: > 90%
- **Core Logic**: > 95%
- **Error Handling**: > 85%

### Rust Coverage Goals
- **Overall Coverage**: > 85%
- **Critical Paths**: > 95%
- **Error Cases**: > 80%

### Coverage Reports
```bash
# Python
pytest --cov=core --cov=models --cov-report=html

# Rust
cargo tarpaulin --out Html --output-dir coverage/
```

## 🎯 Best Practices

### Test Organization
- Use descriptive test names
- Group related tests in classes/modules
- Use fixtures for common setup
- Keep tests independent and isolated

### Mock Usage
- Mock external dependencies
- Use realistic mock data
- Verify important interactions
- Avoid over-mocking

### Assertion Strategy
- Use specific assertions
- Include helpful error messages
- Test both success and failure cases
- Validate invariants and edge cases

### Performance Testing
- Test with realistic data sizes
- Measure actual bottlenecks
- Compare against baselines
- Monitor resource usage

This comprehensive testing guide ensures the S3 AI MCP system maintains high quality and reliability across all components.
