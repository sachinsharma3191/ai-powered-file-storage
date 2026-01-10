# AI Powered File Storage - Event-driven Automation & Notifications

A sophisticated Python agent that provides intelligent automation and notification capabilities for the AI Powered File Storage system. The agent connects to both Ruby control plane and Rust data plane, processing events through rules and LLM-powered decision making.

## 🎯 Core Features

### Event-Driven Architecture
- **Queue Support**: Redis Streams, Kafka, RabbitMQ
- **Event Types**: Object operations, security events, performance metrics
- **Scalable Processing**: Concurrent event handling with configurable batch sizes
- **Dead Letter Queue**: Failed event handling and retry mechanisms

### Intelligent Decision Engine
- **Rules-First Processing**: Fast, deterministic rule evaluation
- **LLM Integration**: OpenAI GPT-4 and Anthropic Claude support
- **Hybrid Approach**: Rules for common cases, LLM for complex reasoning
- **Configurable Logic**: Easy rule addition and modification

### Multi-Channel Notifications
- **Email**: SMTP with HTML/text support and templates
- **Slack**: Bot integration with rich message formatting
- **Webhooks**: Custom endpoint delivery with retries
- **SMS**: Twilio integration (placeholder)
- **Templates**: Jinja2-based notification templates

### Action Execution
- **Storage Actions**: Freeze, quarantine, compress, move to cold storage
- **Security Actions**: Block IPs, enable MFA, suspend accounts
- **Performance Actions**: Throttle keys, apply retention, virus scanning
- **RESTful Integration**: Calls back to Ruby and Rust services

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Redis, Kafka, or RabbitMQ
- Access to Ruby and Rust APIs

### Installation

```bash
# Clone repository
git clone https://github.com/sachinsharma3191/s3-ai-mcp.git
cd s3-ai-mcp/services/agent

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp config.json.example config.json
# Edit config.json with your settings

# Run the agent
python main.py --config config.json
```

### Docker Deployment

```bash
# Build image
docker build -t s3-ai-agent .

# Run with Docker Compose
docker-compose -f ../../docker-compose.rust.yml up ai-agent
```

## 📊 Event Types

### Storage Events
- `ObjectCreated` - New object uploaded
- `ObjectDeleted` - Object deleted
- `ObjectModified` - Object metadata changed
- `MultipartCompleted` - Multipart upload finished

### Security Events
- `PublicBucketDetected` - Public access configured
- `AccessDenied` - Authentication/authorization failure
- `VirusScanFailed` - Malware detected (if implemented)

### Performance Events
- `DownloadSpiked` - Unusual download activity
- `ThrottlingActivated` - Rate limiting triggered

### Bucket Events
- `BucketCreated` - New bucket created
- `BucketDeleted` - Bucket removed
- `BucketPolicyChanged` - ACL modifications

## 🤖 Decision Engine

### Rule Types

#### Threshold Rules
```python
Rule(
    id="download_spike",
    name="Download Spike Detection",
    rule_type=RuleType.THRESHOLD,
    event_types=[EventType.DOWNLOAD_SPIKED],
    conditions={"threshold": 1000, "operator": ">"},
    actions=[ActionType.SEND_NOTIFICATION, ActionType.THROTTLE_KEY]
)
```

#### Pattern Rules
```python
Rule(
    id="suspicious_file",
    name="Suspicious File Pattern",
    rule_type=RuleType.PATTERN,
    event_types=[EventType.OBJECT_CREATED],
    conditions={"patterns": {"object_key": {"regex": r"\.exe$"}}},
    actions=[ActionType.SCAN_FOR_VIRUSES]
)
```

#### Frequency Rules
```python
Rule(
    id="frequent_deletes",
    name="Frequent Object Deletion",
    rule_type=RuleType.FREQUENCY,
    event_types=[EventType.OBJECT_DELETED],
    conditions={"max_count": 50, "window_minutes": 60},
    actions=[ActionType.SEND_NOTIFICATION]
)
```

### LLM Integration

The LLM is used for:
- **Risk Assessment**: Analyzing event context and impact
- **Action Recommendations**: Suggesting appropriate responses
- **Notification Generation**: Creating human-readable messages
- **Security Analysis**: Identifying potential threats

## 🔧 Actions

### Storage Actions
- `FREEZE_OBJECT` - Make object immutable
- `QUARANTINE_OBJECT` - Isolate suspicious objects
- `COMPRESS_OBJECT` - Reduce storage costs
- `MOVE_TO_COLD_STORAGE` - Archive to cheaper storage
- `DELETE_OLD_VERSIONS` - Clean up version history

### Security Actions
- `CHANGE_ACL` - Modify access permissions
- `BLOCK_IP` - Block malicious IP addresses
- `ENABLE_MFA` - Enforce multi-factor authentication
- `SUSPEND_ACCOUNT` - Temporarily disable account
- `LOG_SECURITY_EVENT` - Record security incident

### Performance Actions
- `THROTTLE_KEY` - Rate limit API keys
- `APPLY_RETENTION` - Set retention policies
- `SCAN_FOR_VIRUSES` - Initiate malware scanning

## 📈 Monitoring

### Metrics (Prometheus)
- `agent_events_processed_total` - Total events processed
- `agent_events_failed_total` - Failed events
- `agent_actions_executed_total` - Actions taken
- `agent_notifications_sent_total` - Notifications delivered
- `agent_event_processing_seconds` - Processing latency

### Health Checks
- `/metrics` - Prometheus metrics endpoint
- Queue connection status
- API service connectivity
- LLM service availability

## 🔒 Security

### Authentication
- API key authentication for Ruby/Rust services
- JWT token validation for secure communication
- Encrypted credential storage

### Data Protection
- Event data encryption in transit
- Sensitive information redaction
- Audit logging for all actions

## 🚀 Deployment

### Production Considerations
- **High Availability**: Multiple agent instances
- **Queue Scaling**: Partitioned topics/shards
- **Monitoring**: Prometheus + Grafana dashboards
- **Alerting**: PagerDuty/Slack integration
- **Backup**: Event replay and recovery

## 📄 License

MIT License - see LICENSE file for details.
