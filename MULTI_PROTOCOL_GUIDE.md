# 🌐 Multi-Protocol Support Guide

## 📋 **Overview**

The AI-Powered File Storage system now supports multiple protocols for maximum compatibility and integration flexibility:

- ✅ **S3 API** - Full AWS S3 compatibility
- ✅ **REST API** - Modern JSON API
- ✅ **MCP Protocol** - Model Context Protocol for AI integration
- ✅ **WebSocket** - Real-time notifications

---

## 🚀 **S3 API Compatibility**

### **Full AWS S3 Compatibility**
The system provides a complete S3-compatible API that works with existing AWS SDKs and tools.

#### **Endpoints**
```
# Base URL: http://localhost:3000/s3

# Bucket Operations
GET    /s3/                           # List buckets
POST   /s3/{bucket}                   # Create bucket
DELETE /s3/{bucket}                   # Delete bucket

# Object Operations
GET    /s3/{bucket}                   # List objects
HEAD   /s3/{bucket}/{key}             # Get object metadata
GET    /s3/{bucket}/{key}             # Get object
PUT    /s3/{bucket}/{key}             # Put object
DELETE /s3/{bucket}/{key}             # Delete object

# Multipart Uploads
POST   /s3/{bucket}/{key}?uploads     # Initiate multipart
PUT    /s3/{bucket}/{key}?partNumber={n}&uploadId={id}  # Upload part
POST   /s3/{bucket}/{key}?uploadId={id}  # Complete multipart
DELETE /s3/{bucket}/{key}?uploadId={id} # Abort multipart
```

#### **Authentication**
Uses AWS Signature Version 4 authentication. Compatible with:
- AWS SDKs (Python, JavaScript, Java, Go, etc.)
- S3cmd, rclone, and other S3 tools
- Existing S3 integrations

#### **Usage Examples**

**Python (boto3):**
```python
import boto3

# Configure client
s3 = boto3.client(
    's3',
    endpoint_url='http://localhost:3000/s3',
    aws_access_key_id='your-access-key',
    aws_secret_access_key='your-secret-key',
    region_name='us-east-1'
)

# List buckets
buckets = s3.list_buckets()
print(buckets['Buckets'])

# Upload file
s3.upload_file('local-file.txt', 'my-bucket', 'remote-file.txt')

# Download file
s3.download_file('my-bucket', 'remote-file.txt', 'local-file.txt')
```

**JavaScript (AWS SDK):**
```javascript
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  endpoint: "http://localhost:3000/s3",
  region: "us-east-1",
  credentials: {
    accessKeyId: "your-access-key",
    secretAccessKey: "your-secret-key"
  }
});

const command = new ListBucketsCommand({});
const response = await client.send(command);
console.log(response.Buckets);
```

---

## 🤖 **MCP Protocol (Model Context Protocol)**

### **AI Integration Protocol**
The MCP server provides a standardized interface for AI models to interact with storage operations.

#### **Features**
- **Resource Management**: List and access storage resources
- **Tool Integration**: AI-callable storage operations
- **Real-time Events**: Storage event notifications
- **Security**: Scoped access control

#### **Available Tools**
```json
{
  "list_buckets": "List all storage buckets",
  "create_bucket": "Create a new storage bucket",
  "delete_bucket": "Delete a storage bucket",
  "list_objects": "List objects in a bucket",
  "get_object_info": "Get object metadata",
  "delete_object": "Delete an object",
  "get_download_url": "Get download URL for an object",
  "search_objects": "Search objects by pattern"
}
```

#### **Usage Examples**

**Direct MCP Connection:**
```python
import asyncio
from mcp import Client

async def main():
    client = Client()
    await client.connect_to_stdio()
    
    # List buckets
    result = await client.call_tool("list_buckets", {})
    print(result.content[0].text)
    
    # Create bucket
    result = await client.call_tool("create_bucket", {
        "name": "ai-generated-bucket",
        "region": "us-east-1"
    })
    print(result.content[0].text)

asyncio.run(main())
```

**AI Model Integration:**
```json
{
  "tools": [
    {
      "name": "list_buckets",
      "description": "List all storage buckets",
      "parameters": {}
    },
    {
      "name": "create_bucket", 
      "description": "Create a new storage bucket",
      "parameters": {
        "name": "string",
        "region": "string (optional)"
      }
    }
  ]
}
```

---

## 🔌 **WebSocket Real-time Events**

### **Real-time Storage Notifications**
Get instant notifications about storage operations via WebSocket connections.

#### **Event Types**
- `object_created` - New object uploaded
- `object_updated` - Object modified
- `object_deleted` - Object removed
- `bucket_created` - New bucket created
- `bucket_deleted` - Bucket removed
- `multipart_upload_started` - Large upload started
- `multipart_upload_completed` - Large upload finished
- `upload_progress` - Upload progress updates

#### **Connection**
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000/cable?token=your-auth-token');

// Subscribe to events
ws.send(JSON.stringify({
  command: 'subscribe',
  identifier: JSON.stringify({
    channel: 'StorageEventsChannel',
    bucket_id: 'optional-bucket-id'
  })
}));

// Receive events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.message) {
    console.log('Storage event:', data.message);
  }
};
```

#### **Event Format**
```json
{
  "type": "object_created",
  "account_id": 123,
  "bucket_id": 456,
  "object_key": "user-uploads/file.pdf",
  "payload": {
    "object": {
      "key": "user-uploads/file.pdf",
      "size": 1024000,
      "content_type": "application/pdf",
      "etag": "abc123def456",
      "created_at": "2024-01-01T12:00:00Z"
    }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

---

## 🌍 **REST API**

### **Modern JSON API**
The original REST API continues to provide modern JSON-based storage operations.

#### **Endpoints**
```
# Base URL: http://localhost:3000/api/v1

GET    /buckets                      # List buckets
POST   /buckets                      # Create bucket
DELETE /buckets/{name}               # Delete bucket

GET    /buckets/{name}/objects       # List objects
POST   /buckets/{name}/objects       # Create object
DELETE /buckets/{name}/objects/{key} # Delete object

# Advanced features
GET    /buckets/{name}/lifecycle     # Lifecycle policies
PUT    /buckets/{name}/lifecycle     # Set lifecycle policies
POST   /buckets/{name}/lifecycle/apply # Apply policies
```

#### **Authentication**
Bearer token authentication:
```javascript
headers: {
  'Authorization': 'Bearer your-jwt-token'
}
```

---

## 🔄 **Protocol Comparison**

| Feature | S3 API | REST API | MCP Protocol | WebSocket |
|---------|--------|----------|--------------|-----------|
| **Compatibility** | AWS SDKs | Modern Apps | AI Models | Real-time |
| **Authentication** | AWS SigV4 | JWT Bearer | JWT Bearer | JWT Bearer |
| **Use Case** | Migration | Web Apps | AI Integration | Notifications |
| **Multipart** | ✅ | ✅ | ❌ | ❌ |
| **Metadata** | ✅ | ✅ | ✅ | ✅ |
| **Events** | ❌ | ❌ | ✅ | ✅ |
| **AI Ready** | ❌ | ❌ | ✅ | ❌ |

---

## 🛠️ **Deployment**

### **Docker Compose**
```bash
# Start all services with multi-protocol support
docker-compose -f docker-compose.multi-protocol.yml up -d

# Access services:
# S3 API:     http://localhost:3000/s3
# REST API:   http://localhost:3000/api/v1
# MCP Server: http://localhost:8080
# WebSocket:  ws://localhost:3000/cable
# UI:         http://localhost:4200
```

### **Environment Configuration**
```bash
# S3 API Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1

# MCP Server Configuration
STORAGE_API_URL=http://localhost:3000
STORAGE_API_KEY=your-api-key

# WebSocket Configuration
WS_URL=ws://localhost:3000/cable
```

---

## 🎯 **Use Case Examples**

### **1. AWS SDK Migration**
```python
import boto3

# Point existing AWS SDK to local storage
s3 = boto3.client('s3', endpoint_url='http://localhost:3000/s3')
# All existing code works without changes!
```

### **2. AI Model Integration**
```python
# AI model can now manage storage directly
await client.call_tool("create_bucket", {"name": "ai-data"})
await client.call_tool("list_objects", {"bucket": "ai-data"})
```

### **3. Real-time Monitoring**
```javascript
// Get instant notifications for storage events
ws.onmessage = (event) => {
  const event = JSON.parse(event.data);
  if (event.type === 'object_created') {
    updateUI(event.payload.object);
  }
};
```

### **4. Multi-Protocol Client**
```javascript
// Choose protocol based on use case
const s3Client = new S3Client({ endpoint: 'http://localhost:3000/s3' });  // Migration
const restClient = axios.create({ baseURL: 'http://localhost:3000/api/v1' }); // Web app
const mcpClient = new MCPClient();  // AI integration
const wsClient = new WebSocket('ws://localhost:3000/cable');  // Real-time
```

---

## 🏆 **Benefits**

### **Maximum Compatibility**
- **Existing Tools**: Works with AWS SDKs, S3cmd, rclone
- **AI Integration**: Native support for AI models via MCP
- **Modern Apps**: RESTful API for web/mobile applications
- **Real-time**: WebSocket for live updates

### **Flexible Deployment**
- **Protocol Choice**: Use the right protocol for each use case
- **Gradual Migration**: Start with REST, migrate to S3 API
- **AI Enhancement**: Add AI capabilities with MCP
- **Real-time Features**: WebSocket for live applications

### **Enterprise Ready**
- **Security**: Proper authentication for all protocols
- **Scalability**: High-performance Rust and Ruby services
- **Monitoring**: Comprehensive logging and metrics
- **Reliability**: Battle-tested storage infrastructure

The multi-protocol support makes this the most flexible and compatible storage solution available! 🚀
