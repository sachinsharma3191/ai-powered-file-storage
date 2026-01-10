# File Storage Agent

An offline-capable agent for interacting with the File Storage platform.
**No external LLM API keys required** - works with local Ollama or pure command parsing.

## Features

- **CLI Tool** (`cli.py`) - Direct command-line interface
- **Interactive Agent** (`agent.py`) - Natural language interface with optional Ollama LLM
- **Storage Client** (`storage_client.py`) - Python library for programmatic access

## Quick Start

```bash
# 1. Get an API key (run this once)
curl -X POST http://localhost:3000/v1/bootstrap \
  -H 'Content-Type: application/json' \
  -H 'X-Bootstrap-Token: dev-bootstrap-token' \
  -d '{"plan":"free","api_key_name":"my-key","scopes":{}}'

# 2. Set the API key
export STORAGE_API_KEY=<your-key-from-step-1>

# 3. Run the agent
python agent.py
```

## Usage Options

### 1. Interactive Agent (with or without LLM)

```bash
# With Ollama (if running locally)
python agent.py --api-key YOUR_KEY

# Without LLM (command parsing only)
python agent.py --api-key YOUR_KEY --no-llm

# Custom Ollama settings
python agent.py --api-key YOUR_KEY --ollama-url http://localhost:11434 --model llama3.2
```

### 2. CLI Tool (no LLM needed)

```bash
# List buckets
python cli.py --api-key YOUR_KEY list-buckets

# Create bucket
python cli.py --api-key YOUR_KEY create-bucket my-bucket --region us-west-2

# List objects
python cli.py --api-key YOUR_KEY list-objects my-bucket

# Upload file
python cli.py --api-key YOUR_KEY upload my-bucket --file myfile.txt

# Upload text
python cli.py --api-key YOUR_KEY upload my-bucket --key hello.txt --data "Hello World"

# Delete object
python cli.py --api-key YOUR_KEY delete-object my-bucket hello.txt

# Delete bucket
python cli.py --api-key YOUR_KEY delete-bucket my-bucket
```

### 3. Python Library

```python
from storage_client import StorageClient

client = StorageClient("http://localhost:3000", "your-api-key")

# List buckets
buckets = client.list_buckets()

# Create bucket
bucket = client.create_bucket("my-bucket", "us-west-2")

# Upload file
obj = client.create_object("my-bucket", "hello.txt", b"Hello World!")

# List objects
objects = client.list_objects("my-bucket")

client.close()
```

## Ollama Setup (Optional - for natural language)

If you want natural language understanding, install Ollama locally:

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama
ollama serve

# Pull a model
ollama pull llama3.2
```

The agent will automatically detect and use Ollama if available.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_API_URL` | `http://localhost:3000` | Storage control plane URL |
| `STORAGE_API_KEY` | (required) | API key from bootstrap |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |

## Docker

```bash
# Build
docker compose build agent

# Run (needs API key)
STORAGE_API_KEY=your-key docker compose --profile extras run agent
```
