import httpx
from typing import Optional
from dataclasses import dataclass


@dataclass
class Bucket:
    id: int
    name: str
    region: str
    versioning: str
    created_at: str


@dataclass
class StorageObject:
    id: int
    key: str
    size: Optional[int] = None
    etag: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[str] = None


class StorageClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={
                "X-Api-Key": api_key,
                "Content-Type": "application/json"
            },
            timeout=30.0
        )

    def list_buckets(self) -> list[Bucket]:
        response = self.client.get("/v1/buckets")
        response.raise_for_status()
        return [Bucket(**b) for b in response.json()]

    def create_bucket(self, name: str, region: str = "us-west-2") -> Bucket:
        response = self.client.post("/v1/buckets", json={"name": name, "region": region})
        response.raise_for_status()
        return Bucket(**response.json())

    def delete_bucket(self, name: str) -> bool:
        response = self.client.delete(f"/v1/buckets/{name}")
        response.raise_for_status()
        return True

    def get_bucket(self, name: str) -> Bucket:
        response = self.client.get(f"/v1/buckets/{name}")
        response.raise_for_status()
        return Bucket(**response.json())

    def list_objects(self, bucket_name: str) -> list[StorageObject]:
        response = self.client.get(f"/v1/buckets/{bucket_name}/objects")
        response.raise_for_status()
        objects = []
        for obj in response.json():
            version = obj.get("current_version", {})
            objects.append(StorageObject(
                id=obj["id"],
                key=obj["key"],
                size=version.get("size"),
                etag=version.get("etag"),
                status=version.get("status"),
                created_at=obj.get("created_at")
            ))
        return objects

    def create_object(self, bucket_name: str, key: str, data: bytes) -> StorageObject:
        # Step 1: Create object metadata and get upload token
        response = self.client.post(
            f"/v1/buckets/{bucket_name}/objects",
            json={"key": key}
        )
        response.raise_for_status()
        create_response = response.json()
        
        token = create_response["token"]
        gateway_url = create_response["chunk_gateway_base_url"]
        version_id = create_response["version"]["version_id"]
        
        # Step 2: Upload data to chunk gateway
        upload_url = f"{gateway_url}/objects/{bucket_name}/{key}"
        upload_response = httpx.put(
            upload_url,
            content=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream"
            },
            timeout=60.0
        )
        upload_response.raise_for_status()
        etag = upload_response.json().get("etag", "")
        
        # Step 3: Complete the upload
        complete_response = self.client.post(
            f"/v1/buckets/{bucket_name}/objects/{key}/complete",
            json={
                "version_id": version_id,
                "etag": etag,
                "size": len(data)
            }
        )
        complete_response.raise_for_status()
        
        return StorageObject(
            id=create_response["object"]["id"],
            key=key,
            size=len(data),
            etag=etag,
            status="available"
        )

    def delete_object(self, bucket_name: str, key: str) -> bool:
        response = self.client.delete(f"/v1/buckets/{bucket_name}/objects/{key}")
        response.raise_for_status()
        return True

    def close(self):
        self.client.close()
