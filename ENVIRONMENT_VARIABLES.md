# Environment Variables Configuration

This document outlines all the environment variables used across the AI Powered File Storage system to eliminate hardcoded URLs and enable flexible deployment.

## 🌐 **Frontend (Angular UI)**

### API Configuration
```bash
# API server URL for the Angular UI
NG_APP_API_URL=http://localhost:3000

# Ollama server URL for AI features
NG_APP_OLLAMA_URL=http://ollama:11434
```

### Usage
```bash
# Development
export NG_APP_API_URL=http://localhost:3000
export NG_APP_OLLAMA_URL=http://localhost:11434

# Production
export NG_APP_API_URL=https://api.yourdomain.com
export NG_APP_OLLAMA_URL=https://ollama.yourdomain.com
```

---

## 🚀 **Backend Services**

### Ruby Control Plane (Rails)

#### Database Configuration
```bash
DATABASE_URL=postgres://postgres:postgres@postgres:5432/ai_powered_file_storage_development
STORAGE_CONTROL_PLANE_DATABASE_USERNAME=postgres
STORAGE_CONTROL_PLANE_DATABASE_PASSWORD=postgres
```

#### Redis Configuration
```bash
REDIS_URL=redis://redis:6379/0
```

#### Security Configuration
```bash
SCOPED_JWT_SECRET=your-secret-key-here
CHUNK_GATEWAY_BASE_URL=http://chunk-gateway:4000
CHUNK_GATEWAY_REGION=us-west-2
```

#### CORS Configuration
```bash
# Comma-separated list of allowed origins
CORS_ORIGINS=http://localhost:4200,http://localhost:3000,https://yourdomain.com
```

#### Mailer Configuration
```bash
MAILER_HOST=localhost
MAILER_PORT=3000
```

#### Environment
```bash
RAILS_ENV=development
```

---

### Rust Data Plane (Chunk Gateway)

#### Server Configuration
```bash
BIND_ADDR=0.0.0.0
PORT=4000
SCOPED_JWT_SECRET=your-secret-key-here
CHUNK_GATEWAY_REGION=us-west-2
```

#### Redis Configuration
```bash
REDIS_URL=redis://redis:6379/1
EVENT_STREAM=storage-events
EVENTS_ENABLED=true
```

#### Metrics Configuration
```bash
DOWNLOAD_THRESHOLD=1000
METRICS_WINDOW_MINUTES=60
```

#### Logging
```bash
RUST_LOG=info
```

---

### Python Agent (Event Processing)

#### Queue Configuration
```bash
QUEUE_TYPE=redis_streams
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
CONSUMER_GROUP=ai-powered-file-storage-agent
QUEUE_TOPICS=storage-events
MAX_RETRIES=3
BATCH_SIZE=10
PROCESSING_TIMEOUT=30
```

#### API Connections
```bash
RUBY_API_URL=http://storage-control-plane:3000
RUST_API_URL=http://chunk-gateway:4000
API_KEY=your-api-key
API_TIMEOUT=30
MAX_CONCURRENT_ACTIONS=10
RETRY_ATTEMPTS=3
RETRY_DELAY=5
```

#### LLM Configuration
```bash
LLM_ENABLED=false
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
OLLAMA_URL=http://ollama:11434
```

#### Notification Configuration
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_ADDRESS=noreply@yourdomain.com
SMTP_USE_TLS=true
SLACK_BOT_TOKEN=your-slack-bot-token
WEBHOOK_TOKEN=your-webhook-token
WEBHOOK_TIMEOUT=30
```

#### Logging & Monitoring
```bash
LOG_LEVEL=INFO
LOG_FORMAT=json
METRICS_PORT=8080
SENTRY_DSN=your-sentry-dsn
ENVIRONMENT=development
```

---

## 🐳 **Docker Compose Environment**

### Service URLs
The following service URLs are used internally in Docker Compose:

```bash
# Internal service communication
RUBY_API_URL=http://storage-control-plane:3000
RUST_API_URL=http://chunk-gateway:4000
OLLAMA_URL=http://ollama:11434

# Database connections
DATABASE_URL=postgres://postgres:postgres@postgres:5432/ai_powered_file_storage_development
REDIS_URL=redis://redis:6379/0

# Notification service
NOTIFICATION_SERVICE_URL=http://notification-service:5000
```

---

## 📋 **Production Environment Setup**

### Step 1: Create Environment File
```bash
# .env.production
NG_APP_API_URL=https://api.yourdomain.com
NG_APP_OLLAMA_URL=https://ollama.yourdomain.com

DATABASE_URL=postgres://user:pass@your-db-host:5432/production_db
REDIS_URL=redis://your-redis-host:6379/0

SCOPED_JWT_SECRET=your-production-secret
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

LLM_ENABLED=true
OPENAI_API_KEY=your-production-openai-key
SMTP_HOST=smtp.yourdomain.com
FROM_ADDRESS=noreply@yourdomain.com
```

### Step 2: Update Docker Compose
```bash
# Use production environment file
docker-compose -f docker-compose.rust.yml --env-file .env.production up -d
```

### Step 3: Configure Frontend Build
```bash
# Build Angular with production environment
cd services/storage-ui
export NG_APP_API_URL=https://api.yourdomain.com
export NG_APP_OLLAMA_URL=https://ollama.yourdomain.com
npm run build
```

---

## 🔧 **Development Environment Setup**

### Quick Start
```bash
# Copy and customize environment variables
cp .env.example .env

# Edit with your local configuration
nano .env

# Start services with environment file
docker-compose -f docker-compose.rust.yml --env-file .env up -d
```

### Example .env file
```bash
# API URLs
NG_APP_API_URL=http://localhost:3000
NG_APP_OLLAMA_URL=http://localhost:11434

# Database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_powered_file_storage_development
REDIS_URL=redis://localhost:6379/0

# Security
SCOPED_JWT_SECRET=dev-secret-key
CORS_ORIGINS=http://localhost:4200,http://localhost:3000

# LLM (optional)
LLM_ENABLED=true
OPENAI_API_KEY=your-dev-openai-key
OLLAMA_URL=http://localhost:11434
```

---

## 🌍 **Multi-Environment Support**

### Development
```bash
RAILS_ENV=development
ENVIRONMENT=development
LOG_LEVEL=DEBUG
```

### Staging
```bash
RAILS_ENV=staging
ENVIRONMENT=staging
LOG_LEVEL=INFO
```

### Production
```bash
RAILS_ENV=production
ENVIRONMENT=production
LOG_LEVEL=WARN
```

---

## 📊 **Environment Variable Reference**

| Service | Variable | Default | Description |
|---------|----------|---------|-------------|
| **Frontend** | `NG_APP_API_URL` | `http://localhost:3000` | API server URL |
| **Frontend** | `NG_APP_OLLAMA_URL` | `http://ollama:11434` | Ollama server URL |
| **Rails** | `DATABASE_URL` | - | PostgreSQL connection string |
| **Rails** | `REDIS_URL` | - | Redis connection string |
| **Rails** | `SCOPED_JWT_SECRET` | - | JWT signing secret |
| **Rails** | `CORS_ORIGINS` | `localhost:4200,3000` | Allowed CORS origins |
| **Rust** | `REDIS_URL` | `redis://localhost:6379` | Redis for events |
| **Agent** | `RUBY_API_URL` | `http://localhost:3000` | Rails API URL |
| **Agent** | `RUST_API_URL` | `http://localhost:4000` | Rust API URL |
| **Agent** | `OLLAMA_URL` | `http://localhost:11434` | Ollama LLM URL |
| **Agent** | `LLM_ENABLED` | `false` | Enable LLM features |
| **Agent** | `OPENAI_API_KEY` | - | OpenAI API key |
| **Agent** | `SMTP_HOST` | `smtp.gmail.com` | SMTP server |

---

## ✅ **Benefits of Environment Variables**

1. **Security**: No hardcoded secrets in code
2. **Flexibility**: Easy deployment across environments
3. **Scalability**: Dynamic configuration without code changes
4. **Maintainability**: Centralized configuration management
5. **Compliance**: Separation of config and code

---

## 🚀 **Next Steps**

1. **Create environment files** for each deployment environment
2. **Update CI/CD** to inject appropriate environment variables
3. **Configure monitoring** to track environment variable usage
4. **Document team processes** for managing secrets and config
5. **Implement validation** to ensure required variables are set

By using environment variables throughout the system, the AI Powered File Storage achieves enterprise-grade configurability and security! 🎉
