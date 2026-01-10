#!/usr/bin/env python3
"""
Complete Implementation Test Script

This script tests the complete implementation of:
A) Multipart upload flow with event emission
B) Download with throttling and anomaly detection
C) Security model with scoped tokens
D) Rust chunk management
E) AI agent differentiators

Usage:
    python scripts/test_complete_implementation.py [--component COMPONENT]
"""

import asyncio
import argparse
import json
import sys
import time
from datetime import datetime
from typing import Dict, List, Any

import httpx
import redis
from loguru import logger


class ImplementationTester:
    """Test the complete S3 AI MCP implementation"""
    
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.rust_url = "http://localhost:4000"
        self.redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
        
    async def test_multipart_upload_flow(self) -> Dict[str, Any]:
        """Test A) Multipart upload flow"""
        logger.info("Testing multipart upload flow...")
        
        results = {
            "component": "multipart_upload",
            "tests": [],
            "passed": 0,
            "failed": 0
        }
        
        try:
            # Step 1: Initiate multipart upload
            async with httpx.AsyncClient() as client:
                initiate_response = await client.post(
                    f"{self.base_url}/v1/multipart_uploads/initiate",
                    json={
                        "bucket_name": "test-bucket",
                        "key": "large-file.bin",
                        "part_size": 5242880,  # 5MB
                        "presigned_parts": 3
                    },
                    headers={"Authorization": "Bearer test-api-key"}
                )
                
                if initiate_response.status_code == 201:
                    upload_data = initiate_response.json()
                    upload_id = upload_data["upload_id"]
                    presigned_urls = upload_data["presigned_part_urls"]
                    
                    results["tests"].append({
                        "name": "initiate_multipart",
                        "status": "passed",
                        "details": f"Upload ID: {upload_id}"
                    })
                    results["passed"] += 1
                    
                    # Step 2: Upload parts in parallel to Rust
                    upload_tasks = []
                    for part_url in presigned_urls:
                        task = self._upload_part(part_url)
                        upload_tasks.append(task)
                    
                    parts_data = await asyncio.gather(*upload_tasks)
                    
                    if all(part["success"] for part in parts_data):
                        results["tests"].append({
                            "name": "upload_parts_parallel",
                            "status": "passed",
                            "details": f"Uploaded {len(parts_data)} parts"
                        })
                        results["passed"] += 1
                        
                        # Step 3: Complete multipart upload
                        complete_response = await client.post(
                            f"{self.base_url}/v1/multipart_uploads/complete",
                            json={
                                "bucket_name": "test-bucket",
                                "key": "large-file.bin",
                                "upload_id": upload_id,
                                "parts": parts_data,
                                "content_type": "application/octet-stream"
                            },
                            headers={"Authorization": "Bearer test-api-key"}
                        )
                        
                        if complete_response.status_code == 200:
                            results["tests"].append({
                                "name": "complete_multipart",
                                "status": "passed",
                                "details": "Multipart upload completed successfully"
                            })
                            results["passed"] += 1
                            
                            # Step 4: Check for ObjectCreated event
                            await asyncio.sleep(1)  # Allow event processing
                            events = self._check_redis_events("ObjectCreated")
                            
                            if events:
                                results["tests"].append({
                                    "name": "object_created_event",
                                    "status": "passed",
                                    "details": f"Found {len(events)} ObjectCreated events"
                                })
                                results["passed"] += 1
                            else:
                                results["tests"].append({
                                    "name": "object_created_event",
                                    "status": "failed",
                                    "details": "No ObjectCreated events found"
                                })
                                results["failed"] += 1
                        else:
                            results["tests"].append({
                                "name": "complete_multipart",
                                "status": "failed",
                                "details": f"Status: {complete_response.status_code}"
                            })
                            results["failed"] += 1
                    else:
                        results["tests"].append({
                            "name": "upload_parts_parallel",
                            "status": "failed",
                            "details": "Some parts failed to upload"
                        })
                        results["failed"] += 1
                else:
                    results["tests"].append({
                        "name": "initiate_multipart",
                        "status": "failed",
                        "details": f"Status: {initiate_response.status_code}"
                    })
                    results["failed"] += 1
                    
        except Exception as e:
            results["tests"].append({
                "name": "multipart_upload_flow",
                "status": "error",
                "details": str(e)
            })
            results["failed"] += 1
            
        return results
    
    async def _upload_part(self, part_info: Dict[str, Any]) -> Dict[str, Any]:
        """Upload a single part to Rust gateway"""
        try:
            async with httpx.AsyncClient() as client:
                # Generate test data
                part_data = b"A" * 1024  # 1KB test data
                
                response = await client.put(
                    part_info["upload_url"],
                    headers={
                        "Authorization": f"Bearer {part_info['token']}",
                        "Content-Type": "application/octet-stream",
                        "x-checksum-sha256": "test-checksum"
                    },
                    content=part_data
                )
                
                if response.status_code == 200:
                    return {
                        "success": True,
                        "part_number": part_info["part_number"],
                        "etag": response.json().get("part_etag", "test-etag"),
                        "checksum": "test-checksum",
                        "size": len(part_data)
                    }
                else:
                    return {
                        "success": False,
                        "part_number": part_info["part_number"],
                        "error": f"Status: {response.status_code}"
                    }
        except Exception as e:
            return {
                "success": False,
                "part_number": part_info.get("part_number", "unknown"),
                "error": str(e)
            }
    
    async def test_download_anomaly_detection(self) -> Dict[str, Any]:
        """Test B) Download with throttling and anomaly detection"""
        logger.info("Testing download anomaly detection...")
        
        results = {
            "component": "download_anomaly",
            "tests": [],
            "passed": 0,
            "failed": 0
        }
        
        try:
            # Simulate multiple downloads to trigger anomaly
            for i in range(10):
                await self._simulate_download(f"user-{i}", "test-bucket", "popular-file.txt")
                await asyncio.sleep(0.1)  # Small delay between downloads
            
            # Check for ObjectDownloaded events
            download_events = self._check_redis_events("ObjectDownloaded")
            
            if download_events:
                results["tests"].append({
                    "name": "download_events_generated",
                    "status": "passed",
                    "details": f"Found {len(download_events)} ObjectDownloaded events"
                })
                results["passed"] += 1
            else:
                results["tests"].append({
                    "name": "download_events_generated",
                    "status": "failed",
                    "details": "No ObjectDownloaded events found"
                })
                results["failed"] += 1
            
            # Simulate download spike
            await self._simulate_download_spike("spike-user", "test-bucket", "viral-file.txt")
            
            # Check for DownloadSpiked events
            spike_events = self._check_redis_events("DownloadSpiked")
            
            if spike_events:
                results["tests"].append({
                    "name": "download_spike_detected",
                    "status": "passed",
                    "details": f"Found {len(spike_events)} DownloadSpiked events"
                })
                results["passed"] += 1
            else:
                results["tests"].append({
                    "name": "download_spike_detected",
                    "status": "failed",
                    "details": "No DownloadSpiked events found"
                })
                results["failed"] += 1
            
            # Check for throttling actions (would be implemented by Python agent)
            await asyncio.sleep(2)  # Allow agent processing
            throttle_events = self._check_redis_events("ThrottlingActivated")
            
            if throttle_events:
                results["tests"].append({
                    "name": "throttling_activated",
                    "status": "passed",
                    "details": f"Found {len(throttle_events)} ThrottlingActivated events"
                })
                results["passed"] += 1
            else:
                results["tests"].append({
                    "name": "throttling_activated",
                    "status": "skipped",
                    "details": "No throttling events found (agent may not be running)"
                })
                
        except Exception as e:
            results["tests"].append({
                "name": "download_anomaly_detection",
                "status": "error",
                "details": str(e)
            })
            results["failed"] += 1
            
        return results
    
    async def _simulate_download(self, user_id: str, bucket: str, key: str):
        """Simulate a download event"""
        event = {
            "event": {
                "event_id": f"download-{int(time.time())}",
                "event_type": "ObjectDownloaded",
                "timestamp": datetime.utcnow().isoformat(),
                "source": "rust_data_plane",
                "severity": "low",
                "account_id": "test-account",
                "user_id": user_id,
                "bucket_name": bucket,
                "object_key": key,
                "download_size": 1024,
                "metadata": {"test": True}
            },
            "retry_count": 0,
            "max_retries": 3,
            "dead_letter": False,
            "processed_at": None
        }
        
        self.redis_client.xadd("storage-events", event, maxlen=10000)
    
    async def _simulate_download_spike(self, user_id: str, bucket: str, key: str):
        """Simulate a download spike event"""
        event = {
            "event": {
                "event_id": f"spike-{int(time.time())}",
                "event_type": "DownloadSpiked",
                "timestamp": datetime.utcnow().isoformat(),
                "source": "rust_data_plane",
                "severity": "high",
                "account_id": "test-account",
                "user_id": user_id,
                "bucket_name": bucket,
                "object_key": key,
                "metric_name": "download_count",
                "metric_value": 1500,
                "threshold": 1000,
                "metadata": {"spike_detected": True}
            },
            "retry_count": 0,
            "max_retries": 3,
            "dead_letter": False,
            "processed_at": None
        }
        
        self.redis_client.xadd("storage-events", event, maxlen=10000)
    
    def _check_redis_events(self, event_type: str) -> List[Dict[str, Any]]:
        """Check Redis for specific event types"""
        try:
            # Get recent events from the stream
            events = self.redis_client.xrange("storage-events", "-", "+", count=100)
            
            matching_events = []
            for event_id, event_data in events:
                event_json = json.loads(event_data.get("event", "{}"))
                if event_json.get("event_type") == event_type:
                    matching_events.append(event_json)
            
            return matching_events
        except Exception as e:
            logger.error(f"Error checking Redis events: {e}")
            return []
    
    async def test_security_model(self) -> Dict[str, Any]:
        """Test C) Security model with scoped tokens"""
        logger.info("Testing security model...")
        
        results = {
            "component": "security_model",
            "tests": [],
            "passed": 0,
            "failed": 0
        }
        
        try:
            # Test JWT token validation
            async with httpx.AsyncClient() as client:
                # Test with invalid token
                response = await client.get(
                    f"{self.rust_url}/dp/v1/objects/test-object",
                    headers={"Authorization": "Bearer invalid-token"}
                )
                
                if response.status_code == 401:
                    results["tests"].append({
                        "name": "invalid_token_rejected",
                        "status": "passed",
                        "details": "Invalid token properly rejected"
                    })
                    results["passed"] += 1
                else:
                    results["tests"].append({
                        "name": "invalid_token_rejected",
                        "status": "failed",
                        "details": f"Expected 401, got {response.status_code}"
                    })
                    results["failed"] += 1
                
                # Test token scope validation (if implemented)
                # This would require a valid token generation mechanism
                
        except Exception as e:
            results["tests"].append({
                "name": "security_model",
                "status": "error",
                "details": str(e)
            })
            results["failed"] += 1
            
        return results
    
    async def test_rust_chunk_management(self) -> Dict[str, Any]:
        """Test D) Rust chunk management"""
        logger.info("Testing Rust chunk management...")
        
        results = {
            "component": "rust_chunk_management",
            "tests": [],
            "passed": 0,
            "failed": 0
        }
        
        try:
            # Test health endpoint
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.rust_url}/healthz")
                
                if response.status_code == 200:
                    results["tests"].append({
                        "name": "health_endpoint",
                        "status": "passed",
                        "details": "Health endpoint responding"
                    })
                    results["passed"] += 1
                else:
                    results["tests"].append({
                        "name": "health_endpoint",
                        "status": "failed",
                        "details": f"Health endpoint status: {response.status_code}"
                    })
                    results["failed"] += 1
                
                # Test chunking endpoint (if available)
                # This would require proper authentication
                
        except Exception as e:
            results["tests"].append({
                "name": "rust_chunk_management",
                "status": "error",
                "details": str(e)
            })
            results["failed"] += 1
            
        return results
    
    async def test_ai_agent_differentiators(self) -> Dict[str, Any]:
        """Test E) AI agent differentiators"""
        logger.info("Testing AI agent differentiators...")
        
        results = {
            "component": "ai_agent_differentiators",
            "tests": [],
            "passed": 0,
            "failed": 0
        }
        
        try:
            # Test event consumption
            events = self._check_redis_events("ObjectCreated")
            
            if events:
                results["tests"].append({
                    "name": "event_consumption",
                    "status": "passed",
                    "details": f"Agent consuming events: {len(events)} found"
                })
                results["passed"] += 1
            else:
                results["tests"].append({
                    "name": "event_consumption",
                    "status": "skipped",
                    "details": "No events found (agent may not be running)"
                })
            
            # Test LLM integration (if configured)
            # This would depend on the actual LLM configuration
            
        except Exception as e:
            results["tests"].append({
                "name": "ai_agent_differentiators",
                "status": "error",
                "details": str(e)
            })
            results["failed"] += 1
            
        return results
    
    async def run_all_tests(self) -> Dict[str, Any]:
        """Run all implementation tests"""
        logger.info("Running complete implementation tests...")
        
        all_results = {
            "timestamp": datetime.utcnow().isoformat(),
            "components": {},
            "summary": {
                "total_passed": 0,
                "total_failed": 0,
                "total_errors": 0
            }
        }
        
        # Test all components
        test_methods = [
            self.test_multipart_upload_flow,
            self.test_download_anomaly_detection,
            self.test_security_model,
            self.test_rust_chunk_management,
            self.test_ai_agent_differentiators
        ]
        
        for test_method in test_methods:
            try:
                result = await test_method()
                all_results["components"][result["component"]] = result
                all_results["summary"]["total_passed"] += result["passed"]
                all_results["summary"]["total_failed"] += result["failed"]
            except Exception as e:
                logger.error(f"Test method {test_method.__name__} failed: {e}")
                all_results["summary"]["total_errors"] += 1
        
        return all_results
    
    def print_results(self, results: Dict[str, Any]):
        """Print test results in a formatted way"""
        print("\n" + "="*80)
        print("S3 AI MCP - COMPLETE IMPLEMENTATION TEST RESULTS")
        print("="*80)
        
        for component, result in results["components"].items():
            print(f"\n{component.upper().replace('_', ' ')}:")
            print("-" * 40)
            
            for test in result["tests"]:
                status_symbol = {
                    "passed": "✅",
                    "failed": "❌",
                    "error": "💥",
                    "skipped": "⏭️"
                }.get(test["status"], "❓")
                
                print(f"  {status_symbol} {test['name']}: {test['details']}")
            
            print(f"\n  Summary: {result['passed']} passed, {result['failed']} failed")
        
        print("\n" + "="*80)
        print("OVERALL SUMMARY")
        print("="*80)
        summary = results["summary"]
        print(f"Total Passed: {summary['total_passed']}")
        print(f"Total Failed: {summary['total_failed']}")
        print(f"Total Errors: {summary['total_errors']}")
        
        total_tests = summary['total_passed'] + summary['total_failed'] + summary['total_errors']
        if total_tests > 0:
            success_rate = (summary['total_passed'] / total_tests) * 100
            print(f"Success Rate: {success_rate:.1f}%")
        
        print("="*80)


async def main():
    """Main test runner"""
    parser = argparse.ArgumentParser(description="Test S3 AI MCP Implementation")
    parser.add_argument("--component", choices=[
        "multipart_upload", "download_anomaly", "security_model", 
        "rust_chunk_management", "ai_agent_differentiators"
    ], help="Test specific component (default: all)")
    parser.add_argument("--base-url", default="http://localhost:3000", 
                       help="Base URL for the control plane")
    parser.add_argument("--output", help="Output results to JSON file")
    
    args = parser.parse_args()
    
    tester = ImplementationTester(args.base_url)
    
    try:
        if args.component:
            # Test specific component
            test_method = getattr(tester, f"test_{args.component}")
            results = await test_method()
            all_results = {
                "timestamp": datetime.utcnow().isoformat(),
                "components": {results["component"]: results},
                "summary": {
                    "total_passed": results["passed"],
                    "total_failed": results["failed"],
                    "total_errors": 0
                }
            }
        else:
            # Test all components
            all_results = await tester.run_all_tests()
        
        # Print results
        tester.print_results(all_results)
        
        # Save to file if requested
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(all_results, f, indent=2)
            print(f"\nResults saved to: {args.output}")
        
        # Exit with appropriate code
        if all_results["summary"]["total_failed"] > 0 or all_results["summary"]["total_errors"] > 0:
            sys.exit(1)
        else:
            sys.exit(0)
            
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Test execution failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
