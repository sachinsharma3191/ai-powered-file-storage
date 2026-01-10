import asyncio
import logging
import json
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from models.events import BaseEvent, ObjectEvent, BucketEvent, SecurityEvent
from models.decisions import ActionType, Action, ActionExecution, ActionStatus


@dataclass
class ActionConfig:
    """Action executor configuration"""
    ruby_api_url: str = "http://localhost:3000"
    rust_api_url: str = "http://localhost:4000"
    api_timeout: int = 30
    api_key: str = None
    max_concurrent_actions: int = 10
    retry_attempts: int = 3
    retry_delay: int = 5


class BaseActionExecutor(ABC):
    """Abstract base class for action executors"""
    
    def __init__(self, config: ActionConfig):
        self.config = config
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    @abstractmethod
    async def execute(self, action: Action, event: BaseEvent) -> ActionExecution:
        """Execute action"""
        pass
    
    @abstractmethod
    def get_supported_actions(self) -> List[ActionType]:
        """Get list of supported action types"""
        pass


class StorageActionExecutor(BaseActionExecutor):
    """Executor for storage-related actions"""
    
    def __init__(self, config: ActionConfig):
        super().__init__(config)
        self.ruby_client = httpx.AsyncClient(
            base_url=config.ruby_api_url,
            timeout=config.api_timeout
        )
        self.rust_client = httpx.AsyncClient(
            base_url=config.rust_api_url,
            timeout=config.api_timeout
        )
        
        if config.api_key:
            headers = {"Authorization": f"Bearer {config.api_key}"}
            self.ruby_client.headers.update(headers)
    
    def get_supported_actions(self) -> List[ActionType]:
        """Get supported storage actions"""
        return [
            ActionType.FREEZE_OBJECT,
            ActionType.QUARANTINE_OBJECT,
            ActionType.COMPRESS_OBJECT,
            ActionType.MOVE_TO_COLD_STORAGE,
            ActionType.DELETE_OLD_VERSIONS,
            ActionType.CREATE_BACKUP
        ]
    
    async def execute(self, action: Action, event: BaseEvent) -> ActionExecution:
        """Execute storage action"""
        execution_id = f"storage_{action.action_type}_{datetime.utcnow().timestamp()}"
        execution = ActionExecution(
            action_id=execution_id,
            event_id=event.event_id,
            action_type=action.action_type,
            status=ActionStatus.PENDING,
            started_at=datetime.utcnow()
        )
        
        try:
            if not isinstance(event, (ObjectEvent, BucketEvent)):
                raise ValueError("Storage actions require ObjectEvent or BucketEvent")
            
            if action.action_type == ActionType.FREEZE_OBJECT:
                result = await self._freeze_object(event, action)
            elif action.action_type == ActionType.QUARANTINE_OBJECT:
                result = await self._quarantine_object(event, action)
            elif action.action_type == ActionType.COMPRESS_OBJECT:
                result = await self._compress_object(event, action)
            elif action.action_type == ActionType.MOVE_TO_COLD_STORAGE:
                result = await self._move_to_cold_storage(event, action)
            elif action.action_type == ActionType.DELETE_OLD_VERSIONS:
                result = await self._delete_old_versions(event, action)
            elif action.action_type == ActionType.CREATE_BACKUP:
                result = await self._create_backup(event, action)
            else:
                raise ValueError(f"Unsupported action: {action.action_type}")
            
            execution.status = ActionStatus.COMPLETED
            execution.result_data = result
            self.logger.info(f"Storage action {action.action_type} completed")
            
        except Exception as e:
            execution.status = ActionStatus.FAILED
            execution.error_message = str(e)
            self.logger.error(f"Storage action {action.action_type} failed: {e}")
        
        finally:
            execution.completed_at = datetime.utcnow()
            if execution.started_at:
                execution.execution_time_ms = int(
                    (execution.completed_at - execution.started_at).total_seconds() * 1000
                )
        
        return execution
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _freeze_object(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Freeze object (make immutable)"""
        response = await self.ruby_client.post(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}:freeze",
            json={"reason": action.parameters.get("reason", "Security freeze")}
        )
        response.raise_for_status()
        return response.json()
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _quarantine_object(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Quarantine object"""
        response = await self.ruby_client.post(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}:quarantine",
            json={"reason": action.parameters.get("reason", "Security quarantine")}
        )
        response.raise_for_status()
        return response.json()
    
    async def _compress_object(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Compress object"""
        # This would trigger background compression job
        response = await self.ruby_client.post(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}:compress",
            json={"algorithm": action.parameters.get("algorithm", "gzip")}
        )
        response.raise_for_status()
        return response.json()
    
    async def _move_to_cold_storage(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Move object to cold storage"""
        response = await self.ruby_client.post(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}:move_cold",
            json={"storage_class": action.parameters.get("storage_class", "GLACIER")}
        )
        response.raise_for_status()
        return response.json()
    
    async def _delete_old_versions(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Delete old object versions"""
        days_to_keep = action.parameters.get("days_to_keep", 30)
        response = await self.ruby_client.delete(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}/versions",
            params={"older_than_days": days_to_keep}
        )
        response.raise_for_status()
        return response.json()
    
    async def _create_backup(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Create object backup"""
        response = await self.ruby_client.post(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}:backup",
            json={"destination": action.parameters.get("destination", "backup-bucket")}
        )
        response.raise_for_status()
        return response.json()


class SecurityActionExecutor(BaseActionExecutor):
    """Executor for security-related actions"""
    
    def __init__(self, config: ActionConfig):
        super().__init__(config)
        self.ruby_client = httpx.AsyncClient(
            base_url=config.ruby_api_url,
            timeout=config.api_timeout
        )
        
        if config.api_key:
            headers = {"Authorization": f"Bearer {config.api_key}"}
            self.ruby_client.headers.update(headers)
    
    def get_supported_actions(self) -> List[ActionType]:
        """Get supported security actions"""
        return [
            ActionType.CHANGE_ACL,
            ActionType.BLOCK_IP,
            ActionType.ENABLE_MFA,
            ActionType.SUSPEND_ACCOUNT,
            ActionType.LOG_SECURITY_EVENT
        ]
    
    async def execute(self, action: Action, event: BaseEvent) -> ActionExecution:
        """Execute security action"""
        execution_id = f"security_{action.action_type}_{datetime.utcnow().timestamp()}"
        execution = ActionExecution(
            action_id=execution_id,
            event_id=event.event_id,
            action_type=action.action_type,
            status=ActionStatus.PENDING,
            started_at=datetime.utcnow()
        )
        
        try:
            if action.action_type == ActionType.CHANGE_ACL:
                result = await self._change_acl(event, action)
            elif action.action_type == ActionType.BLOCK_IP:
                result = await self._block_ip(event, action)
            elif action.action_type == ActionType.ENABLE_MFA:
                result = await self._enable_mfa(event, action)
            elif action.action_type == ActionType.SUSPEND_ACCOUNT:
                result = await self._suspend_account(event, action)
            elif action.action_type == ActionType.LOG_SECURITY_EVENT:
                result = await self._log_security_event(event, action)
            else:
                raise ValueError(f"Unsupported action: {action.action_type}")
            
            execution.status = ActionStatus.COMPLETED
            execution.result_data = result
            self.logger.info(f"Security action {action.action_type} completed")
            
        except Exception as e:
            execution.status = ActionStatus.FAILED
            execution.error_message = str(e)
            self.logger.error(f"Security action {action.action_type} failed: {e}")
        
        finally:
            execution.completed_at = datetime.utcnow()
            if execution.started_at:
                execution.execution_time_ms = int(
                    (execution.completed_at - execution.started_at).total_seconds() * 1000
                )
        
        return execution
    
    async def _change_acl(self, event: BucketEvent, action: Action) -> Dict[str, Any]:
        """Change bucket ACL"""
        new_acl = action.parameters.get("acl", {})
        response = await self.ruby_client.put(
            f"/api/v1/buckets/{event.bucket_name}/acl",
            json=new_acl
        )
        response.raise_for_status()
        return response.json()
    
    async def _block_ip(self, event: SecurityEvent, action: Action) -> Dict[str, Any]:
        """Block IP address"""
        if not event.ip_address:
            raise ValueError("IP address required for block action")
        
        response = await self.ruby_client.post(
            "/api/v1/security/block_ip",
            json={
                "ip_address": event.ip_address,
                "reason": action.parameters.get("reason", "Security violation"),
                "duration_hours": action.parameters.get("duration_hours", 24)
            }
        )
        response.raise_for_status()
        return response.json()
    
    async def _enable_mfa(self, event: SecurityEvent, action: Action) -> Dict[str, Any]:
        """Enable MFA for user"""
        if not event.user_id:
            raise ValueError("User ID required for MFA action")
        
        response = await self.ruby_client.post(
            f"/api/v1/users/{event.user_id}/enable_mfa",
            json={"force": action.parameters.get("force", False)}
        )
        response.raise_for_status()
        return response.json()
    
    async def _suspend_account(self, event: SecurityEvent, action: Action) -> Dict[str, Any]:
        """Suspend account"""
        response = await self.ruby_client.post(
            f"/api/v1/accounts/{event.account_id}/suspend",
            json={
                "reason": action.parameters.get("reason", "Security violation"),
                "duration_hours": action.parameters.get("duration_hours", 24)
            }
        )
        response.raise_for_status()
        return response.json()
    
    async def _log_security_event(self, event: SecurityEvent, action: Action) -> Dict[str, Any]:
        """Log security event"""
        # This would send to security monitoring system
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event.event_type,
            "account_id": event.account_id,
            "user_id": event.user_id,
            "ip_address": event.ip_address,
            "details": action.parameters.get("details", {})
        }
        
        # Send to logging system (placeholder)
        self.logger.warning(f"Security event logged: {json.dumps(log_entry)}")
        
        return {"logged": True, "event_id": event.event_id}


class PerformanceActionExecutor(BaseActionExecutor):
    """Executor for performance-related actions"""
    
    def __init__(self, config: ActionConfig):
        super().__init__(config)
        self.ruby_client = httpx.AsyncClient(
            base_url=config.ruby_api_url,
            timeout=config.api_timeout
        )
        
        if config.api_key:
            headers = {"Authorization": f"Bearer {config.api_key}"}
            self.ruby_client.headers.update(headers)
    
    def get_supported_actions(self) -> List[ActionType]:
        """Get supported performance actions"""
        return [
            ActionType.THROTTLE_KEY,
            ActionType.APPLY_RETENTION,
            ActionType.SCAN_FOR_VIRUSES
        ]
    
    async def execute(self, action: Action, event: BaseEvent) -> ActionExecution:
        """Execute performance action"""
        execution_id = f"performance_{action.action_type}_{datetime.utcnow().timestamp()}"
        execution = ActionExecution(
            action_id=execution_id,
            event_id=event.event_id,
            action_type=action.action_type,
            status=ActionStatus.PENDING,
            started_at=datetime.utcnow()
        )
        
        try:
            if action.action_type == ActionType.THROTTLE_KEY:
                result = await self._throttle_key(event, action)
            elif action.action_type == ActionType.APPLY_RETENTION:
                result = await self._apply_retention(event, action)
            elif action.action_type == ActionType.SCAN_FOR_VIRUSES:
                result = await self._scan_for_viruses(event, action)
            else:
                raise ValueError(f"Unsupported action: {action.action_type}")
            
            execution.status = ActionStatus.COMPLETED
            execution.result_data = result
            self.logger.info(f"Performance action {action.action_type} completed")
            
        except Exception as e:
            execution.status = ActionStatus.FAILED
            execution.error_message = str(e)
            self.logger.error(f"Performance action {action.action_type} failed: {e}")
        
        finally:
            execution.completed_at = datetime.utcnow()
            if execution.started_at:
                execution.execution_time_ms = int(
                    (execution.completed_at - execution.started_at).total_seconds() * 1000
                )
        
        return execution
    
    async def _throttle_key(self, event: BaseEvent, action: Action) -> Dict[str, Any]:
        """Throttle API key"""
        response = await self.ruby_client.post(
            "/api/v1/security/throttle_key",
            json={
                "account_id": event.account_id,
                "requests_per_minute": action.parameters.get("requests_per_minute", 10),
                "duration_minutes": action.parameters.get("duration_minutes", 60)
            }
        )
        response.raise_for_status()
        return response.json()
    
    async def _apply_retention(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Apply retention policy"""
        response = await self.ruby_client.put(
            f"/api/v1/buckets/{event.bucket_name}/retention",
            json={
                "object_key": event.object_key,
                "retention_days": action.parameters.get("retention_days", 2555),  # 7 years default
                "mode": action.parameters.get("mode", "compliance")
            }
        )
        response.raise_for_status()
        return response.json()
    
    async def _scan_for_viruses(self, event: ObjectEvent, action: Action) -> Dict[str, Any]:
        """Initiate virus scan"""
        response = await self.ruby_client.post(
            f"/api/v1/buckets/{event.bucket_name}/objects/{event.object_key}:scan",
            json={
                "scan_type": action.parameters.get("scan_type", "full"),
                "priority": action.parameters.get("priority", "normal")
            }
        )
        response.raise_for_status()
        return response.json()


class ActionExecutor:
    """Main action executor that delegates to specialized executors"""
    
    def __init__(self, config: ActionConfig):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.semaphore = asyncio.Semaphore(config.max_concurrent_actions)
        
        # Initialize specialized executors
        self.executors = {
            'storage': StorageActionExecutor(config),
            'security': SecurityActionExecutor(config),
            'performance': PerformanceActionExecutor(config)
        }
    
    async def execute(self, action: Action, event: BaseEvent) -> ActionExecution:
        """Execute action using appropriate executor"""
        async with self.semaphore:
            # Find appropriate executor
            executor = None
            for exc in self.executors.values():
                if action.action_type in exc.get_supported_actions():
                    executor = exc
                    break
            
            if not executor:
                raise ValueError(f"No executor found for action {action.action_type}")
            
            # Execute action
            return await executor.execute(action, event)
    
    async def execute_bulk(self, actions: List[Action], events: List[BaseEvent]) -> List[ActionExecution]:
        """Execute multiple actions concurrently"""
        tasks = []
        
        for i, action in enumerate(actions):
            event = events[i] if events and i < len(events) else None
            if event:
                task = self.execute(action, event)
                tasks.append(task)
        
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    def get_supported_actions(self) -> List[ActionType]:
        """Get all supported actions"""
        actions = []
        for executor in self.executors.values():
            actions.extend(executor.get_supported_actions())
        return list(set(actions))
    
    async def cleanup(self):
        """Cleanup resources"""
        for executor in self.executors.values():
            if hasattr(executor, 'ruby_client'):
                await executor.ruby_client.aclose()
            if hasattr(executor, 'rust_client'):
                await executor.rust_client.aclose()
