# AI-Powered File Storage MCP Server

A Model Context Protocol (MCP) server that provides AI integration with the AI-Powered File Storage system. This server enables AI assistants to interact with storage buckets, objects, and files through a standardized protocol interface.

## 🚀 Features

### Core Functionality
- **Bucket Management**: Create, list, and delete storage buckets
- **Object Operations**: List, get metadata, delete objects
- **Search Capabilities**: Pattern-based object search with wildcards
- **Download URLs**: Generate presigned URLs for secure file access
- **Resource Interface**: Expose storage resources as MCP resources

### MCP Protocol Support
- **Resource Listing**: Discover available storage buckets as resources
- **Tool Interface**: 8 specialized tools for storage operations
- **Error Handling**: Comprehensive error reporting and recovery
- **Async Operations**: Full async/await support for concurrent operations

## 📋 Prerequisites

- Python 3.8+
- Storage Control Plane service running
- Valid API credentials for the storage service

## 🛠️ Installation

### Clone and Setup
```bash
cd services/mcp-server
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Environment Configuration
```bash
# Copy environment template
cp ../.env.example .env

# Edit environment variables
nano .env
```

### Required Environment Variables
```bash
export STORAGE_API_URL="http://localhost:3000"
export STORAGE_API_KEY="your-api-key-here"
```

## 🚀 Quick Start

### Running the Server
```bash
# Start the MCP server
python main.py
```

### Using with Claude Desktop
Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "ai-storage": {
      "command": "python",
      "args": ["/path/to/services/mcp-server/main.py"],
      "env": {
        "STORAGE_API_URL": "http://localhost:3000",
        "STORAGE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Available Tools

1. **list_buckets** - List all storage buckets
2. **create_bucket** - Create a new storage bucket
3. **delete_bucket** - Delete a storage bucket
4. **list_objects** - List objects in a bucket
5. **get_object_info** - Get object metadata
6. **delete_object** - Delete an object
7. **get_download_url** - Generate download URL
8. **search_objects** - Search objects by pattern

## 📖 Usage Examples

### Basic Operations

```python
# List all buckets
await server.call_tool("list_buckets", {})

# Create a new bucket
await server.call_tool("create_bucket", {
    "name": "my-data-bucket",
    "region": "us-east-1"
})

# List objects in a bucket
await server.call_tool("list_objects", {
    "bucket": "my-data-bucket",
    "prefix": "documents/"
})

# Search for files
await server.call_tool("search_objects", {
    "bucket": "my-data-bucket",
    "pattern": "*.pdf",
    "limit": 50
})
```

### Resource Interface

```python
# List available resources
resources = await server.list_resources()

# Get bucket details and objects
resource_data = await server.get_resource("storage://bucket/my-data-bucket")
```

## 🧪 Testing

### Run All Tests
```bash
python run_tests.py all
```

### Run with Coverage
```bash
python run_tests.py all --coverage
```

### Run Specific Test Types
```bash
python run_tests.py unit          # Unit tests only
python run_tests.py integration   # Integration tests
python run_tests.py performance   # Performance tests
```

### Test Categories
- **Unit Tests**: Fast, isolated component tests
- **Integration Tests**: End-to-end workflow tests
- **Performance Tests**: Load and stress testing

See [tests/README.md](tests/README.md) for detailed testing documentation.

## 🏗️ Architecture

### Components

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   MCP Server    │────│  StorageClient   │────│ Storage API     │
│                 │    │                  │    │                 │
│ • Resource      │    │ • HTTP Client    │    │ • Buckets       │
│ • Tool Handlers │    │ • Error Handling │    │ • Objects       │
│ • Protocol      │    │ • Async Operations│    │ • Metadata      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Key Classes

- **StorageConfig**: Configuration management
- **StorageClient**: HTTP client for storage operations
- **MCP Server**: Protocol handlers and tool definitions

### Data Flow

1. MCP client sends tool/resource request
2. Server validates and forwards to StorageClient
3. StorageClient makes HTTP call to storage API
4. Response is processed and returned via MCP protocol

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_API_URL` | Yes | `http://localhost:3000` | Storage API base URL |
| `STORAGE_API_KEY` | Yes | - | Authentication API key |
| (Timeout) | No | `30` seconds | Request timeout |

### Client Configuration

```python
from main import StorageConfig

config = StorageConfig(
    api_url="https://your-storage-api.com",
    api_key="your-api-key",
    timeout=60
)
```

## 📊 Performance

### Benchmarks
- **Concurrent Operations**: 40+ ops/second under load
- **Large Dataset Handling**: 1000+ buckets, 10,000+ objects
- **Memory Usage**: Stable under sustained load
- **Error Recovery**: Graceful handling of API failures

### Optimization Features
- Connection pooling via httpx
- Async/await for concurrent operations
- Efficient JSON serialization
- Memory-stable search algorithms

## 🛡️ Security

### Authentication
- Bearer token authentication
- API key validation
- Secure header management

### Data Protection
- No sensitive data logging
- Secure URL generation
- Input validation and sanitization

## 🔍 Monitoring & Debugging

### Logging
```python
import logging
logging.basicConfig(level=logging.INFO)
```

### Error Handling
- Comprehensive exception handling
- Graceful degradation on API failures
- Detailed error messages via MCP protocol

### Debug Mode
```bash
# Enable debug logging
python main.py --log-level DEBUG
```

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t mcp-server .

# Run container
docker run -e STORAGE_API_URL="http://storage-api:3000" \
           -e STORAGE_API_KEY="your-key" \
           mcp-server
```

### Production Considerations
- Use environment variables for configuration
- Implement proper logging and monitoring
- Set appropriate timeout values
- Consider rate limiting for API calls

## 📚 API Reference

### MCP Tools

#### list_buckets
```python
await server.call_tool("list_buckets", {})
```

#### create_bucket
```python
await server.call_tool("create_bucket", {
    "name": "bucket-name",
    "region": "us-east-1"  # optional
})
```

#### list_objects
```python
await server.call_tool("list_objects", {
    "bucket": "bucket-name",
    "prefix": "folder/"  # optional
})
```

#### search_objects
```python
await server.call_tool("search_objects", {
    "bucket": "bucket-name",
    "pattern": "*.txt",
    "limit": 50  # optional, default 50
})
```

### MCP Resources

- URI Pattern: `storage://bucket/{bucket-name}`
- Content Type: `application/json`
- Includes: Bucket metadata and object list

## 🤝 Contributing

### Development Setup
```bash
# Install development dependencies
pip install -r requirements-test.txt

# Run tests
python run_tests.py all

# Run with coverage
python run_tests.py all --coverage
```

### Code Style
- Follow PEP 8 guidelines
- Use type hints where appropriate
- Document all public methods
- Write comprehensive tests

### Adding New Tools
1. Implement tool in StorageClient
2. Add tool definition in `handle_list_tools()`
3. Add handler in `handle_call_tool()`
4. Write comprehensive tests
5. Update documentation

## 📄 License

This project is part of the AI-Powered File Storage system. See the main project license for details.

## 🔗 Related Services

- **Storage Control Plane**: Core storage service
- **Chunk Gateway**: File chunking and processing
- **Storage UI**: Web interface for management
- **Notification Service**: Event notifications

## 📞 Support

For issues and support:

1. Check the [test documentation](tests/README.md)
2. Review the [main project docs](../../README.md)
3. Check environment configuration
4. Review logs for error details

## 🗺️ Roadmap

- [ ] Add file upload capabilities
- [ ] Implement batch operations
- [ ] Add more search filters
- [ ] Support for additional storage providers
- [ ] Enhanced caching mechanisms
- [ ] GraphQL interface support
