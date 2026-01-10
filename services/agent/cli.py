#!/usr/bin/env python3
"""
CLI tool for interacting with File Storage - no LLM required.
"""
import os
import sys
import argparse
from storage_client import StorageClient


def get_client(args) -> StorageClient:
    base_url = args.url or os.environ.get("STORAGE_API_URL", "http://localhost:3000")
    api_key = args.api_key or os.environ.get("STORAGE_API_KEY", "")
    if not api_key:
        print("Error: API key required. Use --api-key or set STORAGE_API_KEY env var")
        sys.exit(1)
    return StorageClient(base_url, api_key)


def cmd_list_buckets(args):
    client = get_client(args)
    buckets = client.list_buckets()
    if not buckets:
        print("No buckets found.")
        return
    print(f"{'NAME':<30} {'REGION':<15} {'VERSIONING':<12}")
    print("-" * 60)
    for b in buckets:
        print(f"{b.name:<30} {b.region:<15} {b.versioning:<12}")
    client.close()


def cmd_create_bucket(args):
    client = get_client(args)
    bucket = client.create_bucket(args.name, args.region)
    print(f"Created bucket '{bucket.name}' in region '{bucket.region}'")
    client.close()


def cmd_delete_bucket(args):
    client = get_client(args)
    client.delete_bucket(args.name)
    print(f"Deleted bucket '{args.name}'")
    client.close()


def cmd_list_objects(args):
    client = get_client(args)
    objects = client.list_objects(args.bucket)
    if not objects:
        print(f"No objects in bucket '{args.bucket}'")
        return
    print(f"{'KEY':<40} {'SIZE':<12} {'STATUS':<12}")
    print("-" * 65)
    for obj in objects:
        size = f"{obj.size} B" if obj.size else "-"
        status = obj.status or "-"
        print(f"{obj.key:<40} {size:<12} {status:<12}")
    client.close()


def cmd_upload(args):
    client = get_client(args)
    
    if args.file:
        with open(args.file, "rb") as f:
            data = f.read()
        key = args.key or os.path.basename(args.file)
    elif args.data:
        data = args.data.encode("utf-8")
        key = args.key
    else:
        print("Error: provide --file or --data")
        sys.exit(1)
    
    if not key:
        print("Error: --key required when using --data")
        sys.exit(1)
    
    obj = client.create_object(args.bucket, key, data)
    print(f"Uploaded '{obj.key}' ({obj.size} bytes)")
    client.close()


def cmd_delete_object(args):
    client = get_client(args)
    client.delete_object(args.bucket, args.key)
    print(f"Deleted '{args.key}' from bucket '{args.bucket}'")
    client.close()


def main():
    parser = argparse.ArgumentParser(description="File Storage CLI")
    parser.add_argument("--url", help="Storage API URL")
    parser.add_argument("--api-key", help="API key")
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # list-buckets
    subparsers.add_parser("list-buckets", help="List all buckets")
    
    # create-bucket
    p = subparsers.add_parser("create-bucket", help="Create a bucket")
    p.add_argument("name", help="Bucket name")
    p.add_argument("--region", default="us-west-2", help="Region")
    
    # delete-bucket
    p = subparsers.add_parser("delete-bucket", help="Delete a bucket")
    p.add_argument("name", help="Bucket name")
    
    # list-objects
    p = subparsers.add_parser("list-objects", help="List objects in bucket")
    p.add_argument("bucket", help="Bucket name")
    
    # upload
    p = subparsers.add_parser("upload", help="Upload object")
    p.add_argument("bucket", help="Bucket name")
    p.add_argument("--key", help="Object key")
    p.add_argument("--file", help="File to upload")
    p.add_argument("--data", help="Text data to upload")
    
    # delete-object
    p = subparsers.add_parser("delete-object", help="Delete object")
    p.add_argument("bucket", help="Bucket name")
    p.add_argument("key", help="Object key")
    
    args = parser.parse_args()
    
    commands = {
        "list-buckets": cmd_list_buckets,
        "create-bucket": cmd_create_bucket,
        "delete-bucket": cmd_delete_bucket,
        "list-objects": cmd_list_objects,
        "upload": cmd_upload,
        "delete-object": cmd_delete_object,
    }
    
    commands[args.command](args)


if __name__ == "__main__":
    main()
