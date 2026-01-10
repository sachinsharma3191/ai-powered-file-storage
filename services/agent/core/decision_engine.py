import asyncio
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum

import openai
import anthropic
from jinja2 import Template

from models.events import (
    BaseEvent, ObjectEvent, BucketEvent, MultipartEvent, 
    SecurityEvent, MetricEvent, EventType, EventSeverity
)
from models.decisions import Decision, NotificationMessage, ActionType


class RuleType(str, Enum):
    """Rule types"""
    THRESHOLD = "threshold"
    PATTERN = "pattern"
    FREQUENCY = "frequency"
    SECURITY = "security"
    COMPLIANCE = "compliance"


@dataclass
class Rule:
    """Decision rule definition"""
    id: str
    name: str
    rule_type: RuleType
    event_types: List[EventType]
    conditions: Dict[str, Any]
    actions: List[ActionType]
    notification_template: Optional[str] = None
    enabled: bool = True
    priority: int = 100  # Lower number = higher priority


class BaseRuleEngine(ABC):
    """Abstract base class for rule engines"""
    
    @abstractmethod
    async def evaluate(self, event: BaseEvent, rule: Rule) -> bool:
        """Evaluate if rule matches event"""
        pass


class ThresholdRuleEngine(BaseRuleEngine):
    """Threshold-based rule engine"""
    
    async def evaluate(self, event: BaseEvent, rule: Rule) -> bool:
        """Evaluate threshold rules"""
        if not isinstance(event, MetricEvent):
            return False
        
        threshold = rule.conditions.get('threshold')
        operator = rule.conditions.get('operator', '>')
        
        if operator == '>':
            return event.metric_value > threshold
        elif operator == '<':
            return event.metric_value < threshold
        elif operator == '>=':
            return event.metric_value >= threshold
        elif operator == '<=':
            return event.metric_value <= threshold
        elif operator == '==':
            return event.metric_value == threshold
        else:
            return False


class PatternRuleEngine(BaseRuleEngine):
    """Pattern-based rule engine"""
    
    async def evaluate(self, event: BaseEvent, rule: Rule) -> bool:
        """Evaluate pattern rules"""
        patterns = rule.conditions.get('patterns', {})
        
        for field, pattern in patterns.items():
            event_value = getattr(event, field, None)
            if event_value is None:
                return False
            
            if isinstance(pattern, str):
                if pattern not in str(event_value):
                    return False
            elif isinstance(pattern, dict):
                if 'regex' in pattern:
                    import re
                    if not re.match(pattern['regex'], str(event_value)):
                        return False
                if 'equals' in pattern:
                    if event_value != pattern['equals']:
                        return False
        
        return True


class FrequencyRuleEngine(BaseRuleEngine):
    """Frequency-based rule engine"""
    
    def __init__(self):
        self.event_counts: Dict[str, List[datetime]] = {}
    
    async def evaluate(self, event: BaseEvent, rule: Rule) -> bool:
        """Evaluate frequency rules"""
        key = f"{event.account_id}:{event.event_type}"
        now = datetime.utcnow()
        
        # Clean old events
        if key in self.event_counts:
            self.event_counts[key] = [
                ts for ts in self.event_counts[key] 
                if now - ts < timedelta(minutes=rule.conditions.get('window_minutes', 60))
            ]
        else:
            self.event_counts[key] = []
        
        # Add current event
        self.event_counts[key].append(now)
        
        # Check frequency
        max_count = rule.conditions.get('max_count', 10)
        return len(self.event_counts[key]) > max_count


class SecurityRuleEngine(BaseRuleEngine):
    """Security-based rule engine"""
    
    async def evaluate(self, event: BaseEvent, rule: Rule) -> bool:
        """Evaluate security rules"""
        if not isinstance(event, SecurityEvent):
            return False
        
        # Check for suspicious patterns
        if rule.conditions.get('public_access'):
            return event.event_type == EventType.PUBLIC_BUCKET_DETECTED
        
        if rule.conditions.get('access_denied'):
            return event.event_type == EventType.ACCESS_DENIED
        
        if rule.conditions.get('failed_auth'):
            return 'authentication' in (event.error_message or '').lower()
        
        return False


class LLMDecisionEngine:
    """LLM-based decision engine for complex reasoning"""
    
    def __init__(self, openai_api_key: str = None, anthropic_api_key: str = None):
        self.openai_client = openai.OpenAI(api_key=openai_api_key) if openai_api_key else None
        self.anthropic_client = anthropic.Anthropic(api_key=anthropic_api_key) if anthropic_api_key else None
        self.logger = logging.getLogger(__name__)
    
    async def analyze_event(self, event: BaseEvent, context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Analyze event using LLM for complex reasoning"""
        if not self.openai_client and not self.anthropic_client:
            return {}
        
        # Prepare prompt
        prompt = self._build_analysis_prompt(event, context)
        
        try:
            if self.openai_client:
                return await self._analyze_with_openai(prompt)
            elif self.anthropic_client:
                return await self._analyze_with_anthropic(prompt)
        except Exception as e:
            self.logger.error(f"LLM analysis failed: {e}")
            return {}
    
    def _build_analysis_prompt(self, event: BaseEvent, context: Dict[str, Any] = None) -> str:
        """Build analysis prompt for LLM"""
        template = Template("""
You are an AI assistant analyzing storage events for security and operational insights.

Event Details:
- Type: {{ event.event_type }}
- Severity: {{ event.severity }}
- Account: {{ event.account_id }}
- Bucket: {{ event.bucket_name }}
- Timestamp: {{ event.timestamp }}
- Source: {{ event.source }}
- Metadata: {{ event.metadata }}

{% if event.object_key %}
Object Information:
- Key: {{ event.object_key }}
- Size: {{ event.object_size }}
- Content Type: {{ event.content_type }}
{% endif %}

{% if context %}
Additional Context:
{{ context }}
{% endif %}

Please analyze this event and provide:
1. Risk assessment (low/medium/high/critical)
2. Recommended actions (if any)
3. Notification requirements
4. Security implications
5. Operational impact

Respond in JSON format:
{
    "risk_assessment": "low|medium|high|critical",
    "recommended_actions": ["action1", "action2"],
    "notification_required": true|false,
    "notification_message": "Brief message if needed",
    "security_implications": "Description",
    "operational_impact": "Description"
}
""")
        
        return template.render(event=event, context=context or {})
    
    async def _analyze_with_openai(self, prompt: str) -> Dict[str, Any]:
        """Analyze using OpenAI"""
        response = self.openai_client.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a storage security and operations expert."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        
        import json
        return json.loads(response.choices[0].message.content)
    
    async def _analyze_with_anthropic(self, prompt: str) -> Dict[str, Any]:
        """Analyze using Anthropic Claude"""
        response = self.anthropic_client.messages.create(
            model="claude-3-sonnet-20240229",
            max_tokens=1000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )
        
        import json
        return json.loads(response.content[0].text)


class DecisionEngine:
    """Main decision engine combining rules and LLM"""
    
    def __init__(
        self,
        rules: List[Rule] = None,
        llm_engine: LLMDecisionEngine = None,
        enable_llm: bool = True
    ):
        self.rules = rules or []
        self.llm_engine = llm_engine
        self.enable_llm = enable_llm
        self.logger = logging.getLogger(__name__)
        
        # Initialize rule engines
        self.rule_engines = {
            RuleType.THRESHOLD: ThresholdRuleEngine(),
            RuleType.PATTERN: PatternRuleEngine(),
            RuleType.FREQUENCY: FrequencyRuleEngine(),
            RuleType.SECURITY: SecurityRuleEngine(),
        }
    
    def add_rule(self, rule: Rule):
        """Add a decision rule"""
        self.rules.append(rule)
        self.rules.sort(key=lambda r: r.priority)
    
    def remove_rule(self, rule_id: str):
        """Remove a decision rule"""
        self.rules = [r for r in self.rules if r.id != rule_id]
    
    async def process_event(self, event: BaseEvent) -> Decision:
        """Process event through decision engine"""
        self.logger.info(f"Processing event {event.event_id} with {len(self.rules)} rules")
        
        # Step 1: Apply deterministic rules
        triggered_rules = await self._apply_rules(event)
        
        # Step 2: Use LLM for complex analysis if needed
        llm_analysis = None
        if self.enable_llm and self.llm_engine and self._should_use_llm(event, triggered_rules):
            llm_analysis = await self.llm_engine.analyze_event(event, {
                'triggered_rules': [r.name for r in triggered_rules],
                'rule_count': len(triggered_rules)
            })
        
        # Step 3: Combine results
        return self._create_decision(event, triggered_rules, llm_analysis)
    
    async def _apply_rules(self, event: BaseEvent) -> List[Rule]:
        """Apply all rules to event"""
        triggered_rules = []
        
        for rule in self.rules:
            if not rule.enabled:
                continue
            
            if event.event_type not in rule.event_types:
                continue
            
            rule_engine = self.rule_engines.get(rule.rule_type)
            if not rule_engine:
                self.logger.warning(f"No engine for rule type {rule.rule_type}")
                continue
            
            try:
                if await rule_engine.evaluate(event, rule):
                    triggered_rules.append(rule)
                    self.logger.info(f"Rule triggered: {rule.name}")
            except Exception as e:
                self.logger.error(f"Rule evaluation failed {rule.name}: {e}")
        
        return triggered_rules
    
    def _should_use_llm(self, event: BaseEvent, triggered_rules: List[Rule]) -> bool:
        """Determine if LLM analysis is needed"""
        # Use LLM for high-severity events
        if event.severity in [EventSeverity.HIGH, EventSeverity.CRITICAL]:
            return True
        
        # Use LLM for security events
        if isinstance(event, SecurityEvent):
            return True
        
        # Use LLM if no rules matched but event is unusual
        if not triggered_rules and event.event_type not in [
            EventType.OBJECT_CREATED, EventType.OBJECT_DELETED
        ]:
            return True
        
        # Use LLM if multiple rules triggered
        if len(triggered_rules) >= 3:
            return True
        
        return False
    
    def _create_decision(
        self, 
        event: BaseEvent, 
        triggered_rules: List[Rule], 
        llm_analysis: Dict[str, Any] = None
    ) -> Decision:
        """Create final decision from rules and LLM analysis"""
        actions = []
        notification = None
        
        # Collect actions from triggered rules
        for rule in triggered_rules:
            actions.extend(rule.actions)
        
        # Enhance with LLM recommendations
        if llm_analysis:
            llm_actions = llm_analysis.get('recommended_actions', [])
            for action_str in llm_actions:
                try:
                    action = ActionType(action_str)
                    if action not in actions:
                        actions.append(action)
                except ValueError:
                    self.logger.warning(f"Unknown action from LLM: {action_str}")
            
            # Create notification if LLM recommends it
            if llm_analysis.get('notification_required', False):
                notification = NotificationMessage(
                    channel="email",
                    recipient="admin@example.com",  # Would be determined by event/account
                    subject=f"Storage Alert: {event.event_type}",
                    body=llm_analysis.get('notification_message', 'Event requires attention'),
                    severity=event.severity.value,
                    metadata={
                        'event_id': event.event_id,
                        'risk_assessment': llm_analysis.get('risk_assessment', 'unknown'),
                        'security_implications': llm_analysis.get('security_implications', ''),
                        'operational_impact': llm_analysis.get('operational_impact', '')
                    }
                )
        
        return Decision(
            event_id=event.event_id,
            actions=list(set(actions)),  # Remove duplicates
            notification=notification,
            triggered_rules=[r.id for r in triggered_rules],
            llm_analysis=llm_analysis,
            processed_at=datetime.utcnow()
        )


# Default rules for common scenarios
DEFAULT_RULES = [
    Rule(
        id="public_bucket_alert",
        name="Public Bucket Detection",
        rule_type=RuleType.SECURITY,
        event_types=[EventType.PUBLIC_BUCKET_DETECTED],
        conditions={"public_access": True},
        actions=[ActionType.SEND_NOTIFICATION, ActionType.LOG_SECURITY_EVENT],
        notification_template="public_bucket_detected",
        priority=10
    ),
    
    Rule(
        id="object_downloaded_tracking",
        name="Object Download Tracking", 
        rule_type=RuleType.FREQUENCY,
        event_types=[EventType.OBJECT_DOWNLOADED],
        conditions={"time_window": 3600, "max_count": 100},  # Track up to 100 downloads per hour
        actions=[ActionType.LOG_METRIC],
        priority=10
    ),
    
    Rule(
        id="download_spike_alert",
        name="Download Spike Detection", 
        rule_type=RuleType.THRESHOLD,
        event_types=[EventType.DOWNLOAD_SPIKED],
        conditions={"threshold": 1000, "operator": ">"},
        actions=[ActionType.SEND_NOTIFICATION, ActionType.THROTTLE_KEY],
        priority=20
    ),
    
    Rule(
        id="large_file_upload",
        name="Large File Upload Alert",
        rule_type=RuleType.THRESHOLD,
        event_types=[EventType.OBJECT_CREATED],
        conditions={"threshold": 10737418240, "operator": ">"},  # 10GB
        actions=[ActionType.SEND_NOTIFICATION],
        priority=30
    ),
    
    Rule(
        id="frequent_deletes",
        name="Frequent Object Deletion",
        rule_type=RuleType.FREQUENCY,
        event_types=[EventType.OBJECT_DELETED],
        conditions={"max_count": 50, "window_minutes": 60},
        actions=[ActionType.SEND_NOTIFICATION, ActionType.LOG_SECURITY_EVENT],
        priority=15
    ),
    
    Rule(
        id="security_failure",
        name="Security Event Alert",
        rule_type=RuleType.SECURITY,
        event_types=[EventType.ACCESS_DENIED, EventType.VIRUS_SCAN_FAILED],
        conditions={"failed_auth": True},
        actions=[ActionType.SEND_NOTIFICATION, ActionType.LOG_SECURITY_EVENT, ActionType.BLOCK_IP],
        priority=5
    )
]
