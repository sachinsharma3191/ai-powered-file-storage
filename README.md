# AI Powered File Storage

A comprehensive, self-hosted file storage platform with AI-powered capabilities. Features S3-compatible API, web UI, and intelligent event-driven automation.

## 🚀 Features

- **S3-Compatible Storage API** - Drop-in replacement for S3 with full compatibility
- **AI-Powered Agent** - Interactive storage management with natural language commands
- **Modern Web UI** - Angular-based storage management interface
- **High-Performance Chunk Gateway** - Rust-based service for efficient file operations
- **Multi-Language Support** - Services in Ruby, Python, Rust, and TypeScript
- **Docker Compose Ready** - Complete containerized deployment
- **Offline Capable** - Works with local Ollama LLM or pure command parsing

## 📁 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Storage UI    │    │   CLI Tools     │    │   Monitoring    │
│   (Angular)     │    │   (Python)      │    │   (Prometheus)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
┌─────────────────────────────────┼─────────────────────────────────┐
│                    Storage Control Plane                          │
│                      (Ruby on Rails)                             │
│  • Authentication & Authorization                                 │
│  • Bucket & Object Management                                     │
│  • API Key Management                                             │
│  • Event Emission (Redis Streams)                                 │
└───────────────────────────────────────────────────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │                           │
        ┌─────────────────┐           ┌─────────────────┐
        │  AI Agent       │           │  Chunk Gateway  │
        │  (Python)       │           │  (Rust)         │
        │ • Event Consumer│           │ • Data Serving  │
        │ • Decision Engine│          │ • Chunking      │
        │ • Notifications │           │ • Metrics       │
        │ • Actions       │           │ • Anomaly Det.  │
        └─────────────────┘           └─────────────────┘
                    │                           │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────────┐
                    │   Redis Streams │
                    │   Events &      │
                    │   Metrics       │
                    └─────────────────┘
```

## 🛠 Services

### Core Services

| Service | Language | Port | Description |
|---------|----------|-------|-------------|
| **Storage Control Plane** | Ruby on Rails | 3000 | Main API server, authentication, bucket/object management |
| **Chunk Gateway** | Rust | 4000 | High-performance file operations and streaming |
| **Storage UI** | Angular/TypeScript | 4200 | Web-based management interface |
| **AI Agent** | Python | - | Event-driven automation and intelligence |

### Data & Infrastructure

| Component | Purpose |
|-----------|---------|
| **PostgreSQL** | Metadata storage (buckets, objects, policies) |
| **Redis** | Event streaming and caching |
| **File Storage** | Actual data files (can be S3, local, or other) |
| **Notification Service** | Event notifications and webhooks |
| **Outbox Worker** | Background job processing |

### Infrastructure

| Component | Version | Purpose |
|-----------|---------|---------|
| **PostgreSQL** | 17 | Metadata storage, accounts, buckets, objects |
| **Redis** | 7 | Queue system, caching, session storage |
| **Docker Compose** | - | Container orchestration |

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Git

### 1. Clone and Start Services

```bash
git clone https://github.com/sachinsharma3191/s3-ai-mcp.git
cd s3-ai-mcp
docker compose up -d
```

### 2. Bootstrap Your Account

```bash
# Create an API key for your account
curl -X POST http://localhost:3000/v1/bootstrap \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: dev-bootstrap-token' \
  -d '{"plan":"free","api_key_name":"my-key","scopes":{}}'
```

### 3. Access the Platform

- **Web UI**: http://localhost:4200
- **API Documentation**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health

## 🤖 AI Agent Usage

### Interactive Agent (with LLM)

```bash
cd services/agent
export STORAGE_API_KEY=<your-key>
python agent.py

# Try commands like:
# "Show me all buckets"
# "Create a bucket called my-data"
# "Upload a file to my-data"
```

### CLI Tool (no LLM required)

```bash
cd services/agent
export STORAGE_API_KEY=<your-key>

# List buckets
python cli.py --api-key $STORAGE_API_KEY list-buckets

# Create bucket
python cli.py --api-key $STORAGE_API_KEY create-bucket my-bucket

# Upload file
python cli.py --api-key $STORAGE_API_KEY upload my-bucket --file myfile.txt
```

### MCP Server Integration

```bash
cd services/agent
export STORAGE_API_KEY=<your-key>
python server.py

# Use with Claude Desktop or other MCP clients
```

## 📚 API Usage

### S3-Compatible API

```bash
# List buckets (S3-compatible)
aws --endpoint-url http://localhost:3000 \
  s3 ls

# Upload file
aws --endpoint-url http://localhost:3000 \
  s3 cp myfile.txt s3://my-bucket/

# Download file
aws --endpoint-url http://localhost:3000 \
  s3 cp s3://my-bucket/myfile.txt .
```

### REST API

```bash
# Get API key
export STORAGE_API_KEY=<your-key>

# List buckets
curl -H "X-Api-Key: $STORAGE_API_KEY" \
  http://localhost:3000/v1/buckets

# Create bucket
curl -X POST -H "X-Api-Key: $STORAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-bucket","region":"us-west-2"}' \
  http://localhost:3000/v1/buckets
```

## 🔧 Development

### Local Development Setup

```bash
# Start infrastructure
docker compose up -d postgres redis storage_files

# Setup each service
cd services/storage-control-plane
bundle install
bin/rails db:setup
bin/rails server

cd ../chunk-gateway
cargo run

cd ../storage-ui
npm install
npm start

cd ../agent
pip install -r requirements.txt
python agent.py
```

### Running Tests

```bash
# Ruby on Rails tests
cd services/storage-control-plane
bin/run_tests.rb

# Rust tests
cd services/chunk-gateway
cargo test

# Python tests
cd services/agent
python -m pytest

# Angular tests
cd services/storage-ui
npm test
```

## 🐳 Docker Commands

```bash
# Build all services
docker compose build

# Start specific services
docker compose up -d postgres redis
docker compose up storage-control-plane

# View logs
docker compose logs -f storage-control-plane

# Stop all services
docker compose down

# Clean up volumes
docker compose down -v
```

## 📊 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_API_URL` | `http://localhost:3000` | Storage control plane URL |
| `STORAGE_API_KEY` | (required) | Your API key |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama LLM server |
| `JWT_SECRET` | `dev-secret` | JWT signing secret |

### Storage Configuration

```yaml
# config/storage.yml
test:
  service: Disk
  root: <%= Rails.root.join("tmp/storage") %>

local:
  service: Disk
  root: <%= Rails.root.join("storage") %>
```

## 🔒 Security Features

- **API Key Authentication** - Secure access control
- **JWT Token Support** - Scoped access tokens
- **CORS Configuration** - Cross-origin request handling
- **Input Validation** - Comprehensive parameter validation
- **Rate Limiting** - Request throttling protection

## 🌐 Features

### Multi-Protocol Support

- **S3 API** - Full S3 compatibility
- **REST API** - Modern JSON API
- **MCP Protocol** - Model Context Protocol for AI integration
- **WebSocket** - Real-time notifications

### Storage Features

- **Multipart Uploads** - Large file support
- **Versioning** - Object version tracking
- **Metadata** - Custom object metadata
- **Access Policies** - Fine-grained permissions
- **Event Streaming** - Real-time storage events

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check individual service README files
- **Issues**: [GitHub Issues](https://github.com/sachinsharma3191/s3-ai-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sachinsharma3191/s3-ai-mcp/discussions)

## 🗺 Roadmap

- [ ] **Object Locking** - WORM storage compliance
- [ ] **Cross-Region Replication** - Multi-region support
- [ ] **Advanced Analytics** - Storage usage insights
- [ ] **External Storage Backends** - Azure, GCP integration
- [ ] **Advanced Security** - MFA, SSO integration
- [ ] **Performance Monitoring** - Metrics and dashboards

---

**Built with ❤️ by the community**
