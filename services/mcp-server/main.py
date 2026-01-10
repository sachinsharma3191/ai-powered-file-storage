#!/usr/bin/env python3
"""
MCP Server for AI-Powered File Storage
Provides Model Context Protocol interface for AI integration
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence
from dataclasses import dataclass

import httpx
from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
from mcp.types import (
    Resource, Tool, TextContent, ImageContent, EmbeddedResource,
    CallToolResult, GetResourceResult, ListResourcesResult,
    ListToolsResult
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class StorageConfig:
    """Storage service configuration"""
    api_url: str
    api_key: str
    timeout: int = 30

class StorageClient:
    """Client for interacting with storage control plane"""
    
    def __init__(self, config: StorageConfig):
        self.config = config
        self.client = httpx.AsyncClient(
            base_url=config.api_url,
            timeout=config.timeout,
            headers={"Authorization": f"Bearer {config.api_key}"}
        )
    
    async def list_buckets(self) -> List[Dict[str, Any]]:
        """List all buckets"""
        try:
            response = await self.client.get("/api/v1/buckets")
            response.raise_for_status()
            return response.json().get("buckets", [])
        except Exception as e:
            logger.error(f"Failed to list buckets: {e}")
            return []
    
    async def list_objects(self, bucket: str, prefix: str = "") -> List[Dict[str, Any]]:
        """List objects in a bucket"""
        try:
            params = {"prefix": prefix} if prefix else {}
            response = await self.client.get(f"/api/v1/buckets/{bucket}/objects", params=params)
            response.raise_for_status()
            return response.json().get("objects", [])
        except Exception as e:
            logger.error(f"Failed to list objects: {e}")
            return []
    
    async def get_object_metadata(self, bucket: str, key: str) -> Optional[Dict[str, Any]]:
        """Get object metadata"""
        try:
            response = await self.client.head(f"/api/v1/buckets/{bucket}/objects/{key}")
            if response.status_code == 200:
                return dict(response.headers)
            return None
        except Exception as e:
            logger.error(f"Failed to get object metadata: {e}")
            return None
    
    async def create_bucket(self, name: str, region: str = "us-east-1") -> Optional[Dict[str, Any]]:
        """Create a new bucket"""
        try:
            response = await self.client.post("/api/v1/buckets", json={"name": name, "region": region})
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to create bucket: {e}")
            return None
    
    async def delete_bucket(self, name: str) -> bool:
        """Delete a bucket"""
        try:
            response = await self.client.delete(f"/api/v1/buckets/{name}")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to delete bucket: {e}")
            return False
    
    async def delete_object(self, bucket: str, key: str) -> bool:
        """Delete an object"""
        try:
            response = await self.client.delete(f"/api/v1/buckets/{bucket}/objects/{key}")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to delete object: {e}")
            return False
    
    async def get_download_url(self, bucket: str, key: str) -> Optional[str]:
        """Get download URL for an object"""
        try:
            response = await self.client.post(f"/api/v1/buckets/{bucket}/objects/{key}/download-url")
            response.raise_for_status()
            return response.json().get("url")
        except Exception as e:
            logger.error(f"Failed to get download URL: {e}")
            return None

# Initialize MCP server
server = Server("ai-storage-mcp")

@server.list_resources()
async def handle_list_resources() -> List[Resource]:
    """List available storage resources"""
    config = get_storage_config()
    client = StorageClient(config)
    
    resources = []
    
    # Add buckets as resources
    buckets = await client.list_buckets()
    for bucket in buckets:
        resources.append(Resource(
            uri=f"storage://bucket/{bucket['name']}",
            name=f"Bucket: {bucket['name']}",
            description=f"Storage bucket in {bucket.get('region', 'unknown')}",
            mimeType="application/json"
        ))
    
    return resources

@server.get_resource()
async def handle_get_resource(uri: str) -> GetResourceResult:
    """Get a specific storage resource"""
    config = get_storage_config()
    client = StorageClient(config)
    
    if uri.startswith("storage://bucket/"):
        bucket_name = uri.split("/")[-1]
        
        # Get bucket details and list objects
        buckets = await client.list_buckets()
        bucket = next((b for b in buckets if b["name"] == bucket_name), None)
        
        if bucket:
            objects = await client.list_objects(bucket_name)
            
            content = {
                "bucket": bucket,
                "objects": objects,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            return GetResourceResult(
                contents=[TextContent(type="text", text=json.dumps(content, indent=2))]
            )
    
    raise ValueError(f"Unknown resource: {uri}")

@server.list_tools()
async def handle_list_tools() -> List[Tool]:
    """List available storage tools"""
    return [
        Tool(
            name="list_buckets",
            description="List all storage buckets",
            inputSchema={
                "type": "object",
                "properties": {},
            }
        ),
        Tool(
            name="create_bucket",
            description="Create a new storage bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Bucket name"},
                    "region": {"type": "string", "description": "AWS region", "default": "us-east-1"}
                },
                "required": ["name"]
            }
        ),
        Tool(
            name="delete_bucket",
            description="Delete a storage bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Bucket name"}
                },
                "required": ["name"]
            }
        ),
        Tool(
            name="list_objects",
            description="List objects in a bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket": {"type": "string", "description": "Bucket name"},
                    "prefix": {"type": "string", "description": "Object prefix filter"}
                },
                "required": ["bucket"]
            }
        ),
        Tool(
            name="get_object_info",
            description="Get object metadata",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket": {"type": "string", "description": "Bucket name"},
                    "key": {"type": "string", "description": "Object key"}
                },
                "required": ["bucket", "key"]
            }
        ),
        Tool(
            name="delete_object",
            description="Delete an object",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket": {"type": "string", "description": "Bucket name"},
                    "key": {"type": "string", "description": "Object key"}
                },
                "required": ["bucket", "key"]
            }
        ),
        Tool(
            name="get_download_url",
            description="Get download URL for an object",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket": {"type": "string", "description": "Bucket name"},
                    "key": {"type": "string", "description": "Object key"}
                },
                "required": ["bucket", "key"]
            }
        ),
        Tool(
            name="search_objects",
            description="Search objects by pattern",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket": {"type": "string", "description": "Bucket name"},
                    "pattern": {"type": "string", "description": "Search pattern (supports wildcards)"},
                    "limit": {"type": "integer", "description": "Maximum results", "default": 50}
                },
                "required": ["bucket", "pattern"]
            }
        )
    ]

@server.call_tool()
async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> CallToolResult:
    """Handle tool calls"""
    config = get_storage_config()
    client = StorageClient(config)
    
    try:
        if name == "list_buckets":
            buckets = await client.list_buckets()
            return CallToolResult(
                content=[TextContent(type="text", text=json.dumps(buckets, indent=2))]
            )
        
        elif name == "create_bucket":
            bucket_name = arguments["name"]
            region = arguments.get("region", "us-east-1")
            
            bucket = await client.create_bucket(bucket_name, region)
            if bucket:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Bucket '{bucket_name}' created successfully")]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Failed to create bucket")],
                    isError=True
                )
        
        elif name == "delete_bucket":
            bucket_name = arguments["name"]
            success = await client.delete_bucket(bucket_name)
            
            if success:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Bucket '{bucket_name}' deleted successfully")]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Failed to delete bucket")],
                    isError=True
                )
        
        elif name == "list_objects":
            bucket = arguments["bucket"]
            prefix = arguments.get("prefix", "")
            
            objects = await client.list_objects(bucket, prefix)
            return CallToolResult(
                content=[TextContent(type="text", text=json.dumps(objects, indent=2))]
            )
        
        elif name == "get_object_info":
            bucket = arguments["bucket"]
            key = arguments["key"]
            
            metadata = await client.get_object_metadata(bucket, key)
            if metadata:
                return CallToolResult(
                    content=[TextContent(type="text", text=json.dumps(metadata, indent=2))]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Object not found")],
                    isError=True
                )
        
        elif name == "delete_object":
            bucket = arguments["bucket"]
            key = arguments["key"]
            
            success = await client.delete_object(bucket, key)
            if success:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Object '{key}' deleted successfully")]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Failed to delete object")],
                    isError=True
                )
        
        elif name == "get_download_url":
            bucket = arguments["bucket"]
            key = arguments["key"]
            
            url = await client.get_download_url(bucket, key)
            if url:
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Download URL: {url}")]
                )
            else:
                return CallToolResult(
                    content=[TextContent(type="text", text="Failed to get download URL")],
                    isError=True
                )
        
        elif name == "search_objects":
            bucket = arguments["bucket"]
            pattern = arguments["pattern"]
            limit = arguments.get("limit", 50)
            
            # Get all objects and filter by pattern
            objects = await client.list_objects(bucket)
            filtered_objects = []
            
            for obj in objects:
                if pattern in obj["key"] or fnmatch.fnmatch(obj["key"], pattern):
                    filtered_objects.append(obj)
                    if len(filtered_objects) >= limit:
                        break
            
            return CallToolResult(
                content=[TextContent(type="text", text=json.dumps(filtered_objects, indent=2))]
            )
        
        else:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Unknown tool: {name}")],
                isError=True
            )
    
    except Exception as e:
        logger.error(f"Tool call failed: {e}")
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error: {str(e)}")],
            isError=True
        )

def get_storage_config() -> StorageConfig:
    """Get storage configuration from environment"""
    api_url = os.getenv("STORAGE_API_URL", "http://localhost:3000")
    api_key = os.getenv("STORAGE_API_KEY", "")
    
    if not api_key:
        logger.error("STORAGE_API_KEY environment variable is required")
        sys.exit(1)
    
    return StorageConfig(api_url=api_url, api_key=api_key)

async def main():
    """Main entry point"""
    # Import fnmatch here to avoid circular import
    import fnmatch
    
    # Run the MCP server
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="ai-storage-mcp",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=None,
                    experimental_capabilities={}
                )
            )
        )

if __name__ == "__main__":
    asyncio.run(main())
