import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from core.decision_engine import (
    DecisionEngine, LLMDecisionEngine,
    ThresholdRuleEngine, PatternRuleEngine, FrequencyRuleEngine, SecurityRuleEngine,
    Rule, RuleType, DEFAULT_RULES
)
from models.events import (
    ObjectEvent, BucketEvent, SecurityEvent, MetricEvent,
    EventType, EventSource, EventSeverity
)
from models.decisions import Decision, ActionType, NotificationMessage


@pytest.fixture
def llm_engine():
    """Mock LLM engine"""
    engine = AsyncMock(spec=LLMDecisionEngine)
    engine.analyze_event.return_value = {
        'risk_assessment': 'high',
        'recommended_actions': ['send_notification', 'block_ip'],
        'notification_required': True,
        'notification_message': 'Security event detected',
        'security_implications': 'Potential threat',
        'operational_impact': 'Service degradation'
    }
    return engine


@pytest.fixture
def decision_engine(llm_engine):
    """Create decision engine for testing"""
    return DecisionEngine(
        rules=DEFAULT_RULES,
        llm_engine=llm_engine,
        enable_llm=True
    )


@pytest.fixture
def sample_object_event():
    """Sample object event"""
    return ObjectEvent(
        event_id="obj-123",
        event_type=EventType.OBJECT_CREATED,
        timestamp=datetime.utcnow(),
        source=EventSource.RUBY_CONTROL_PLANE,
        severity=EventSeverity.LOW,
        account_id="acct-123",
        bucket_name="test-bucket",
        object_key="test-file.txt",
        object_size=1024,
        object_etag="etag-123"
    )


@pytest.fixture
def sample_security_event():
    """Sample security event"""
    return SecurityEvent(
        event_id="sec-123",
        event_type=EventType.PUBLIC_BUCKET_DETECTED,
        timestamp=datetime.utcnow(),
        source=EventSource.AGENT,
        severity=EventSeverity.HIGH,
        account_id="acct-123",
        bucket_name="public-bucket",
        user_id="user-123",
        ip_address="192.168.1.1"
    )


@pytest.fixture
def sample_metric_event():
    """Sample metric event"""
    return MetricEvent(
        event_id="metric-123",
        event_type=EventType.DOWNLOAD_SPIKED,
        timestamp=datetime.utcnow(),
        source=EventSource.RUST_DATA_PLANE,
        severity=EventSeverity.MEDIUM,
        account_id="acct-123",
        bucket_name="busy-bucket",
        object_key="popular-file.txt",
        metric_name="download_count",
        metric_value=1500,
        metric_unit="count",
        threshold=1000
    )


class TestThresholdRuleEngine:
    """Test threshold rule engine"""
    
    @pytest.fixture
    def engine(self):
        return ThresholdRuleEngine()
    
    @pytest.fixture
    def threshold_rule(self):
        return Rule(
            id="test-threshold",
            name="Test Threshold",
            rule_type=RuleType.THRESHOLD,
            event_types=[EventType.DOWNLOAD_SPIKED],
            conditions={"threshold": 1000, "operator": ">"},
            actions=[ActionType.SEND_NOTIFICATION]
        )
    
    async def test_threshold_greater_than(self, engine, sample_metric_event, threshold_rule):
        """Test greater than threshold"""
        result = await engine.evaluate(sample_metric_event, threshold_rule)
        assert result is True
    
    async def test_threshold_less_than(self, engine, sample_metric_event):
        """Test less than threshold"""
        rule = Rule(
            id="test-less",
            rule_type=RuleType.THRESHOLD,
            event_types=[EventType.DOWNLOAD_SPIKED],
            conditions={"threshold": 2000, "operator": "<"},
            actions=[]
        )
        
        result = await engine.evaluate(sample_metric_event, rule)
        assert result is True
    
    async def test_threshold_not_met(self, engine, sample_metric_event):
        """Test threshold not met"""
        rule = Rule(
            id="test-not-met",
            rule_type=RuleType.THRESHOLD,
            event_types=[EventType.DOWNLOAD_SPIKED],
            conditions={"threshold": 2000, "operator": ">"},
            actions=[]
        )
        
        result = await engine.evaluate(sample_metric_event, rule)
        assert result is False
    
    async def test_threshold_non_metric_event(self, engine, sample_object_event, threshold_rule):
        """Test threshold rule with non-metric event"""
        result = await engine.evaluate(sample_object_event, threshold_rule)
        assert result is False


class TestPatternRuleEngine:
    """Test pattern rule engine"""
    
    @pytest.fixture
    def engine(self):
        return PatternRuleEngine()
    
    @pytest.fixture
    def pattern_rule(self):
        return Rule(
            id="test-pattern",
            name="Test Pattern",
            rule_type=RuleType.PATTERN,
            event_types=[EventType.OBJECT_CREATED],
            conditions={"patterns": {"object_key": {"regex": r"\.exe$"}}},
            actions=[ActionType.SCAN_FOR_VIRUSES]
        )
    
    async def test_pattern_regex_match(self, engine, pattern_rule):
        """Test regex pattern matching"""
        event = ObjectEvent(
            event_id="obj-456",
            event_type=EventType.OBJECT_CREATED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.LOW,
            account_id="acct-123",
            bucket_name="test-bucket",
            object_key="malware.exe"
        )
        
        result = await engine.evaluate(event, pattern_rule)
        assert result is True
    
    async def test_pattern_string_contains(self, engine):
        """Test string contains pattern"""
        rule = Rule(
            id="test-contains",
            rule_type=RuleType.PATTERN,
            event_types=[EventType.OBJECT_CREATED],
            conditions={"patterns": {"object_key": "sensitive"}},
            actions=[]
        )
        
        event = ObjectEvent(
            event_id="obj-789",
            event_type=EventType.OBJECT_CREATED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.LOW,
            account_id="acct-123",
            bucket_name="test-bucket",
            object_key="sensitive-data.txt"
        )
        
        result = await engine.evaluate(event, rule)
        assert result is True
    
    async def test_pattern_no_match(self, engine, pattern_rule, sample_object_event):
        """Test pattern not matching"""
        result = await engine.evaluate(sample_object_event, pattern_rule)
        assert result is False


class TestFrequencyRuleEngine:
    """Test frequency rule engine"""
    
    @pytest.fixture
    def engine(self):
        return FrequencyRuleEngine()
    
    @pytest.fixture
    def frequency_rule(self):
        return Rule(
            id="test-frequency",
            name="Test Frequency",
            rule_type=RuleType.FREQUENCY,
            event_types=[EventType.OBJECT_DELETED],
            conditions={"max_count": 5, "window_minutes": 60},
            actions=[ActionType.SEND_NOTIFICATION]
        )
    
    async def test_frequency_within_limit(self, engine, frequency_rule, sample_object_event):
        """Test frequency within limit"""
        # Simulate 3 events within the window
        for i in range(3):
            event = ObjectEvent(
                event_id=f"obj-{i}",
                event_type=EventType.OBJECT_DELETED,
                timestamp=datetime.utcnow(),
                source=EventSource.RUBY_CONTROL_PLANE,
                severity=EventSeverity.MEDIUM,
                account_id="acct-123",
                bucket_name="test-bucket",
                object_key=f"file-{i}.txt"
            )
            await engine.evaluate(event, frequency_rule)
        
        # 4th event should still be within limit
        result = await engine.evaluate(sample_object_event, frequency_rule)
        assert result is False
    
    async def test_frequency_exceeded(self, engine, frequency_rule):
        """Test frequency exceeded"""
        # Simulate 6 events within the window (exceeds limit of 5)
        for i in range(6):
            event = ObjectEvent(
                event_id=f"obj-{i}",
                event_type=EventType.OBJECT_DELETED,
                timestamp=datetime.utcnow(),
                source=EventSource.RUBY_CONTROL_PLANE,
                severity=EventSeverity.MEDIUM,
                account_id="acct-123",
                bucket_name="test-bucket",
                object_key=f"file-{i}.txt"
            )
            await engine.evaluate(event, frequency_rule)
        
        # Next event should trigger the rule
        event = ObjectEvent(
            event_id="obj-final",
            event_type=EventType.OBJECT_DELETED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.MEDIUM,
            account_id="acct-123",
            bucket_name="test-bucket",
            object_key="final.txt"
        )
        
        result = await engine.evaluate(event, frequency_rule)
        assert result is True


class TestSecurityRuleEngine:
    """Test security rule engine"""
    
    @pytest.fixture
    def engine(self):
        return SecurityRuleEngine()
    
    @pytest.fixture
    def security_rule(self):
        return Rule(
            id="test-security",
            name="Test Security",
            rule_type=RuleType.SECURITY,
            event_types=[EventType.PUBLIC_BUCKET_DETECTED],
            conditions={"public_access": True},
            actions=[ActionType.SEND_NOTIFICATION, ActionType.LOG_SECURITY_EVENT]
        )
    
    async def test_security_public_access(self, engine, sample_security_event, security_rule):
        """Test public access detection"""
        result = await engine.evaluate(sample_security_event, security_rule)
        assert result is True
    
    async def test_security_access_denied(self, engine):
        """Test access denied detection"""
        rule = Rule(
            id="test-denied",
            rule_type=RuleType.SECURITY,
            event_types=[EventType.ACCESS_DENIED],
            conditions={"failed_auth": True},
            actions=[]
        )
        
        event = SecurityEvent(
            event_id="auth-fail",
            event_type=EventType.ACCESS_DENIED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.MEDIUM,
            account_id="acct-123",
            error_message="Authentication failed"
        )
        
        result = await engine.evaluate(event, rule)
        assert result is True
    
    async def test_security_non_security_event(self, engine, sample_object_event, security_rule):
        """Test security rule with non-security event"""
        result = await engine.evaluate(sample_object_event, security_rule)
        assert result is False


class TestLLMDecisionEngine:
    """Test LLM decision engine"""
    
    @pytest.fixture
    def engine(self):
        return LLMDecisionEngine(
            openai_api_key="test-key",
            anthropic_api_key="test-key"
        )
    
    async def test_analyze_event_openai(self, engine):
        """Test event analysis with OpenAI"""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = '{"risk_assessment": "high"}'
        
        with patch.object(engine.openai_client, 'chat', create=True) as mock_chat:
            mock_chat.completions.create.return_value = mock_response
            
            result = await engine.analyze_event(sample_object_event)
            
            assert 'risk_assessment' in result
            mock_chat.completions.create.assert_called_once()
    
    async def test_analyze_event_anthropic(self, engine):
        """Test event analysis with Anthropic"""
        # Disable OpenAI to force Anthropic
        engine.openai_client = None
        
        mock_response = MagicMock()
        mock_response.content = [MagicMock()]
        mock_response.content[0].text = '{"risk_assessment": "high"}'
        
        with patch.object(engine.anthropic_client, 'messages', create=True) as mock_messages:
            mock_messages.create.return_value = mock_response
            
            result = await engine.analyze_event(sample_object_event)
            
            assert 'risk_assessment' in result
            mock_messages.create.assert_called_once()
    
    async def test_analyze_event_no_llm(self, engine):
        """Test analysis when no LLM is configured"""
        engine.openai_client = None
        engine.anthropic_client = None
        
        result = await engine.analyze_event(sample_object_event)
        
        assert result == {}


class TestDecisionEngine:
    """Test main decision engine"""
    
    async def test_process_event_with_rules(self, decision_engine, sample_security_event):
        """Test event processing with triggered rules"""
        decision = await decision_engine.process_event(sample_security_event)
        
        assert decision.event_id == sample_security_event.event_id
        assert len(decision.triggered_rules) > 0
        assert ActionType.SEND_NOTIFICATION in decision.actions
    
    async def test_process_event_with_llm(self, decision_engine, sample_security_event, llm_engine):
        """Test event processing with LLM analysis"""
        decision = await decision_engine.process_event(sample_security_event)
        
        assert decision.event_id == sample_security_event.event_id
        assert decision.llm_analysis is not None
        assert 'risk_assessment' in decision.llm_analysis
    
    async def test_process_event_no_rules_no_llm(self, sample_object_event):
        """Test event processing with no rules and no LLM"""
        engine = DecisionEngine(rules=[], llm_engine=None, enable_llm=False)
        
        decision = await engine.process_event(sample_object_event)
        
        assert decision.event_id == sample_object_event.event_id
        assert len(decision.actions) == 0
        assert decision.notification is None
    
    async def test_add_remove_rules(self, decision_engine):
        """Test adding and removing rules"""
        new_rule = Rule(
            id="test-rule",
            name="Test Rule",
            rule_type=RuleType.THRESHOLD,
            event_types=[EventType.DOWNLOAD_SPIKED],
            conditions={"threshold": 100},
            actions=[]
        )
        
        # Add rule
        decision_engine.add_rule(new_rule)
        assert new_rule in decision_engine.rules
        
        # Remove rule
        decision_engine.remove_rule("test-rule")
        assert new_rule not in decision_engine.rules
    
    def test_should_use_llm(self, decision_engine):
        """Test LLM usage determination"""
        # High severity event should use LLM
        high_severity_event = SecurityEvent(
            event_id="high-123",
            event_type=EventType.PUBLIC_BUCKET_DETECTED,
            timestamp=datetime.utcnow(),
            source=EventSource.AGENT,
            severity=EventSeverity.HIGH,
            account_id="acct-123"
        )
        
        assert decision_engine._should_use_llm(high_severity_event, []) is True
        
        # Low severity object creation should not use LLM
        low_severity_event = ObjectEvent(
            event_id="low-123",
            event_type=EventType.OBJECT_CREATED,
            timestamp=datetime.utcnow(),
            source=EventSource.RUBY_CONTROL_PLANE,
            severity=EventSeverity.LOW,
            account_id="acct-123",
            bucket_name="test",
            object_key="test.txt"
        )
        
        assert decision_engine._should_use_llm(low_severity_event, []) is False


class TestDefaultRules:
    """Test default rule configurations"""
    
    def test_public_bucket_rule(self):
        """Test public bucket detection rule"""
        rule = next(r for r in DEFAULT_RULES if r.id == "public_bucket_alert")
        
        assert rule.rule_type == RuleType.SECURITY
        assert EventType.PUBLIC_BUCKET_DETECTED in rule.event_types
        assert ActionType.SEND_NOTIFICATION in rule.actions
        assert ActionType.LOG_SECURITY_EVENT in rule.actions
    
    def test_download_spike_rule(self):
        """Test download spike rule"""
        rule = next(r for r in DEFAULT_RULES if r.id == "download_spike_alert")
        
        assert rule.rule_type == RuleType.THRESHOLD
        assert EventType.DOWNLOAD_SPIKED in rule.event_types
        assert rule.conditions["threshold"] == 1000
        assert ActionType.SEND_NOTIFICATION in rule.actions
        assert ActionType.THROTTLE_KEY in rule.actions
    
    def test_large_file_rule(self):
        """Test large file upload rule"""
        rule = next(r for r in DEFAULT_RULES if r.id == "large_file_upload")
        
        assert rule.rule_type == RuleType.THRESHOLD
        assert EventType.OBJECT_CREATED in rule.event_types
        assert rule.conditions["threshold"] == 10737418240  # 10GB
    
    def test_frequent_deletes_rule(self):
        """Test frequent deletion rule"""
        rule = next(r for r in DEFAULT_RULES if r.id == "frequent_deletes")
        
        assert rule.rule_type == RuleType.FREQUENCY
        assert EventType.OBJECT_DELETED in rule.event_types
        assert rule.conditions["max_count"] == 50
        assert rule.conditions["window_minutes"] == 60


if __name__ == '__main__':
    pytest.main([__file__])
