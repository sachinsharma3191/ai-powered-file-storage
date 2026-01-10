#!/usr/bin/env python3
"""
Interactive AI agent for File Storage - works with Ollama (offline) or without LLM.
No external API keys required.
"""
import os
import sys
import json
import re
from typing import Optional

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


def fetch_ollama_config(storage_api_url: str, api_key: str) -> dict:
    """Fetch Ollama configuration from admin settings API."""
    if not HAS_HTTPX or not api_key:
        return {"url": "http://localhost:11434", "model": "llama3.2", "api_key": ""}
    
    try:
        response = httpx.get(
            f"{storage_api_url}/v1/settings/ollama/config",
            headers={"X-Api-Key": api_key},
            timeout=5.0
        )
        if response.status_code == 200:
            data = response.json()
            return {
                "url": data.get("url", "http://localhost:11434"),
                "model": data.get("model", "llama3.2"),
                "api_key": data.get("api_key", "")
            }
    except Exception:
        pass
    
    return {"url": "http://localhost:11434", "model": "llama3.2", "api_key": ""}


class OllamaClient:
    """Client for local Ollama LLM."""
    
    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.2", api_key: str = ""):
        self.base_url = base_url
        self.model = model
        self.api_key = api_key
        self.available = self._check_available()
    
    def _check_available(self) -> bool:
        if not HAS_HTTPX:
            return False
        try:
            response = httpx.get(f"{self.base_url}/api/tags", timeout=2.0)
            return response.status_code == 200
        except:
            return False
    
    def chat(self, messages: list[dict], system: str = "") -> str:
        if not self.available:
            return ""
        
        try:
            response = httpx.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "system": system,
                    "stream": False
                },
                timeout=60.0
            )
            if response.status_code == 200:
                return response.json().get("message", {}).get("content", "")
        except:
            pass
        return ""


class StorageAgent:
    """Interactive agent for File Storage operations."""
    
    SYSTEM_PROMPT = """You are an AI assistant that helps manage File Storage.
You can perform these actions:
- list_buckets: List all storage buckets
- create_bucket <name> [region]: Create a bucket (default region: us-west-2)
- delete_bucket <name>: Delete an empty bucket
- list_objects <bucket>: List objects in a bucket
- upload <bucket> <key> <content>: Upload text content
- delete_object <bucket> <key>: Delete an object

When the user asks something, respond with the action to take.
Format: ACTION: <action> [args]

Examples:
User: "Show me all buckets"
ACTION: list_buckets

User: "Create a bucket called my-data"
ACTION: create_bucket my-data

User: "What files are in test-bucket?"
ACTION: list_objects test-bucket
"""

    def __init__(self, storage_client: StorageClient, use_llm: bool = True):
        self.storage = storage_client
        self.ollama = OllamaClient() if use_llm else None
        self.use_llm = use_llm and self.ollama and self.ollama.available
        self.history: list[dict] = []
    
    def parse_command(self, text: str) -> tuple[str, list[str]]:
        """Parse natural language or direct commands."""
        text = text.strip().lower()
        
        # Direct command patterns
        patterns = [
            (r"^list[- ]?buckets?$", "list_buckets", []),
            (r"^(show|get|list)\s+(all\s+)?buckets?$", "list_buckets", []),
            (r"^create[- ]?bucket\s+(\S+)(?:\s+(\S+))?$", "create_bucket", None),
            (r"^(make|new)\s+bucket\s+(\S+)(?:\s+(\S+))?$", "create_bucket", None),
            (r"^delete[- ]?bucket\s+(\S+)$", "delete_bucket", None),
            (r"^(remove|rm)\s+bucket\s+(\S+)$", "delete_bucket", None),
            (r"^list[- ]?objects?\s+(\S+)$", "list_objects", None),
            (r"^(show|get|list|ls)\s+(files?|objects?)\s+(in\s+)?(\S+)$", "list_objects", None),
            (r"^upload\s+(\S+)\s+(\S+)\s+(.+)$", "upload", None),
            (r"^delete[- ]?object\s+(\S+)\s+(\S+)$", "delete_object", None),
            (r"^(remove|rm)\s+(\S+)\s+from\s+(\S+)$", "delete_object_reverse", None),
        ]
        
        for pattern, action, fixed_args in patterns:
            match = re.match(pattern, text)
            if match:
                if fixed_args is not None:
                    return action, fixed_args
                groups = [g for g in match.groups() if g]
                if action == "create_bucket":
                    # Handle optional region
                    name = groups[-2] if len(groups) >= 2 else groups[-1]
                    region = groups[-1] if len(groups) >= 2 and groups[-1] != name else "us-west-2"
                    return action, [name, region]
                elif action == "list_objects":
                    return action, [groups[-1]]
                elif action == "delete_bucket":
                    return action, [groups[-1]]
                elif action == "delete_object_reverse":
                    return "delete_object", [groups[-1], groups[-2]]  # bucket, key
                return action, list(groups)
        
        return "", []
    
    def execute(self, action: str, args: list[str]) -> str:
        """Execute a storage action."""
        try:
            if action == "list_buckets":
                buckets = self.storage.list_buckets()
                if not buckets:
                    return "No buckets found."
                lines = ["Buckets:"]
                for b in buckets:
                    lines.append(f"  - {b.name} (region: {b.region}, versioning: {b.versioning})")
                return "\n".join(lines)
            
            elif action == "create_bucket":
                name = args[0]
                region = args[1] if len(args) > 1 else "us-west-2"
                bucket = self.storage.create_bucket(name, region)
                return f"Created bucket '{bucket.name}' in region '{bucket.region}'"
            
            elif action == "delete_bucket":
                self.storage.delete_bucket(args[0])
                return f"Deleted bucket '{args[0]}'"
            
            elif action == "list_objects":
                objects = self.storage.list_objects(args[0])
                if not objects:
                    return f"No objects in bucket '{args[0]}'"
                lines = [f"Objects in '{args[0]}':"]
                for obj in objects:
                    size = f"{obj.size} bytes" if obj.size else "unknown size"
                    lines.append(f"  - {obj.key} ({size})")
                return "\n".join(lines)
            
            elif action == "upload":
                bucket, key, content = args[0], args[1], " ".join(args[2:])
                obj = self.storage.create_object(bucket, key, content.encode())
                return f"Uploaded '{obj.key}' ({obj.size} bytes)"
            
            elif action == "delete_object":
                self.storage.delete_object(args[0], args[1])
                return f"Deleted '{args[1]}' from bucket '{args[0]}'"
            
            else:
                return f"Unknown action: {action}"
        
        except Exception as e:
            return f"Error: {str(e)}"
    
    def process_with_llm(self, user_input: str) -> str:
        """Use Ollama to interpret the user's request."""
        if not self.ollama or not self.ollama.available:
            return ""
        
        self.history.append({"role": "user", "content": user_input})
        response = self.ollama.chat(self.history, self.SYSTEM_PROMPT)
        
        if response:
            self.history.append({"role": "assistant", "content": response})
            # Extract action from response
            match = re.search(r"ACTION:\s*(\w+)(?:\s+(.*))?", response, re.IGNORECASE)
            if match:
                action = match.group(1).lower()
                args = match.group(2).split() if match.group(2) else []
                return self.execute(action, args)
            return response
        return ""
    
    def process(self, user_input: str) -> str:
        """Process user input and return response."""
        # First try direct command parsing
        action, args = self.parse_command(user_input)
        if action:
            return self.execute(action, args)
        
        # Try LLM if available
        if self.use_llm:
            result = self.process_with_llm(user_input)
            if result:
                return result
        
        # Fallback help
        return """I didn't understand that. Try:
  - list buckets
  - create bucket <name>
  - delete bucket <name>
  - list objects <bucket>
  - upload <bucket> <key> <content>
  - delete object <bucket> <key>
  
Or type 'help' for more info."""
    
    def run_interactive(self):
        """Run interactive REPL."""
        print("=" * 50)
        print("File Storage Agent")
        print("=" * 50)
        if self.use_llm:
            print(f"LLM: Ollama ({self.ollama.model})")
        else:
            print("LLM: Disabled (using command parsing only)")
        print("Type 'help' for commands, 'quit' to exit")
        print("=" * 50)
        
        while True:
            try:
                user_input = input("\n> ").strip()
                if not user_input:
                    continue
                if user_input.lower() in ("quit", "exit", "q"):
                    print("Goodbye!")
                    break
                if user_input.lower() == "help":
                    print("""
Commands:
  list buckets          - Show all buckets
  create bucket <name>  - Create a new bucket
  delete bucket <name>  - Delete a bucket
  list objects <bucket> - List objects in bucket
  upload <bucket> <key> <content> - Upload text
  delete object <bucket> <key>    - Delete object
  quit                  - Exit
""")
                    continue
                
                result = self.process(user_input)
                print(result)
            
            except KeyboardInterrupt:
                print("\nGoodbye!")
                break
            except EOFError:
                break


def main():
    import argparse
    from storage_client import StorageClient
    
    parser = argparse.ArgumentParser(description="File Storage Agent")
    parser.add_argument("--url", default=os.environ.get("STORAGE_API_URL", "http://localhost:3000"))
    parser.add_argument("--api-key", default=os.environ.get("STORAGE_API_KEY", ""))
    parser.add_argument("--no-llm", action="store_true", help="Disable LLM (command parsing only)")
    parser.add_argument("--ollama-url", help="Ollama URL (overrides admin settings)")
    parser.add_argument("--model", help="Ollama model name (overrides admin settings)")
    args = parser.parse_args()
    
    if not args.api_key:
        print("Error: API key required. Use --api-key or set STORAGE_API_KEY")
        print("\nTo get an API key, run:")
        print("  curl -X POST http://localhost:3000/v1/bootstrap \\")
        print("    -H 'Content-Type: application/json' \\")
        print("    -H 'X-Bootstrap-Token: dev-bootstrap-token' \\")
        print("    -d '{\"plan\":\"free\",\"api_key_name\":\"my-key\",\"scopes\":{}}'")
        sys.exit(1)
    
    # Fetch Ollama config from admin settings
    print("Fetching Ollama configuration from admin settings...")
    ollama_config = fetch_ollama_config(args.url, args.api_key)
    
    # Command line args override admin settings
    ollama_url = args.ollama_url or ollama_config["url"]
    ollama_model = args.model or ollama_config["model"]
    
    print(f"Ollama URL: {ollama_url}")
    print(f"Ollama Model: {ollama_model}")
    
    storage = StorageClient(args.url, args.api_key)
    
    # Create agent with Ollama config from admin settings
    if not args.no_llm:
        ollama = OllamaClient(ollama_url, ollama_model, ollama_config.get("api_key", ""))
        agent = StorageAgent(storage, use_llm=ollama.available)
        if ollama.available:
            agent.ollama = ollama
            agent.use_llm = True
    else:
        agent = StorageAgent(storage, use_llm=False)
    
    try:
        agent.run_interactive()
    finally:
        storage.close()


if __name__ == "__main__":
    main()
