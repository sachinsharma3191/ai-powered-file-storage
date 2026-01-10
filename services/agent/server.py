import os
import json
import asyncio
from typing import Any
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    CallToolResult,
)
from storage_client import StorageClient

# Initialize MCP server
server = Server("ai-powered-file-storage-agent")

# Storage client (initialized lazily)
_client: StorageClient | None = None


def get_client() -> StorageClient:
    global _client
    if _client is None:
        base_url = os.environ.get("STORAGE_API_URL", "http://localhost:3000")
        api_key = os.environ.get("STORAGE_API_KEY", "")
        if not api_key:
            raise ValueError("STORAGE_API_KEY environment variable is required")
        _client = StorageClient(base_url, api_key)
    return _client


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="list_buckets",
            description="List all storage buckets in the account",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        Tool(
            name="create_bucket",
            description="Create a new storage bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the bucket (must be unique)"
                    },
                    "region": {
                        "type": "string",
                        "description": "Region for the bucket (default: us-west-2)",
                        "default": "us-west-2"
                    }
                },
                "required": ["name"]
            }
        ),
        Tool(
            name="delete_bucket",
            description="Delete a storage bucket (must be empty)",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the bucket to delete"
                    }
                },
                "required": ["name"]
            }
        ),
        Tool(
            name="list_objects",
            description="List all objects in a bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket_name": {
                        "type": "string",
                        "description": "Name of the bucket"
                    }
                },
                "required": ["bucket_name"]
            }
        ),
        Tool(
            name="upload_object",
            description="Upload a text file to a bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket_name": {
                        "type": "string",
                        "description": "Name of the bucket"
                    },
                    "key": {
                        "type": "string",
                        "description": "Object key (file path)"
                    },
                    "content": {
                        "type": "string",
                        "description": "Text content to upload"
                    }
                },
                "required": ["bucket_name", "key", "content"]
            }
        ),
        Tool(
            name="delete_object",
            description="Delete an object from a bucket",
            inputSchema={
                "type": "object",
                "properties": {
                    "bucket_name": {
                        "type": "string",
                        "description": "Name of the bucket"
                    },
                    "key": {
                        "type": "string",
                        "description": "Object key to delete"
                    }
                },
                "required": ["bucket_name", "key"]
            }
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict[str, Any]) -> CallToolResult:
    try:
        client = get_client()
        
        if name == "list_buckets":
            buckets = client.list_buckets()
            result = [{"name": b.name, "region": b.region, "versioning": b.versioning} for b in buckets]
            return CallToolResult(
                content=[TextContent(type="text", text=json.dumps(result, indent=2))]
            )
        
        elif name == "create_bucket":
            bucket = client.create_bucket(
                name=arguments["name"],
                region=arguments.get("region", "us-west-2")
            )
            return CallToolResult(
                content=[TextContent(type="text", text=f"Created bucket '{bucket.name}' in region '{bucket.region}'")]
            )
        
        elif name == "delete_bucket":
            client.delete_bucket(arguments["name"])
            return CallToolResult(
                content=[TextContent(type="text", text=f"Deleted bucket '{arguments['name']}'")]
            )
        
        elif name == "list_objects":
            objects = client.list_objects(arguments["bucket_name"])
            result = [{"key": o.key, "size": o.size, "status": o.status} for o in objects]
            return CallToolResult(
                content=[TextContent(type="text", text=json.dumps(result, indent=2))]
            )
        
        elif name == "upload_object":
            content = arguments["content"].encode("utf-8")
            obj = client.create_object(
                bucket_name=arguments["bucket_name"],
                key=arguments["key"],
                data=content
            )
            return CallToolResult(
                content=[TextContent(type="text", text=f"Uploaded '{obj.key}' ({obj.size} bytes)")]
            )
        
        elif name == "delete_object":
            client.delete_object(arguments["bucket_name"], arguments["key"])
            return CallToolResult(
                content=[TextContent(type="text", text=f"Deleted object '{arguments['key']}' from bucket '{arguments['bucket_name']}'")]
            )
        
        else:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Unknown tool: {name}")],
                isError=True
            )
    
    except Exception as e:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error: {str(e)}")],
            isError=True
        )


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
