# Ruby Testing Guide - Pre-Docker Build Validation

This guide helps you catch Rails errors before building Docker images.

## 🚀 Quick Start

### Docker Build with Test Validation (Recommended)
```bash
# Build Docker image - FAILS if tests fail or coverage < 100%
make docker-build

# Or using Docker directly
docker build -f Dockerfile.test -t storage-control-plane:test .
```

### Run All Tests with 100% Coverage
```bash
# From the storage-control-plane directory
rake docker_build_validate

# Or just coverage
make coverage
```

### Run Quick Tests Only
```bash
rake test:quick
# or
make test
```

### Run Specific Test Categories
```bash
# Test API key functionality
rake test:api_keys

# Test plan limits
rake test:plan_limits

# Test all controllers
rake test:controllers

# Test all models
rake test:models
```

## 📁 Test Structure

```
test/
├── controllers/v1/
│   ├── account_controller_test.rb    # Account & API key management
│   ├── buckets_controller_test.rb    # Bucket CRUD operations
│   └── objects_controller_test.rb    # Object storage operations
├── models/
│   ├── account_test.rb               # Account plan limits
│   └── api_key_test.rb               # API key generation & auth
└── test_helper.rb                    # Common test utilities
```

## 🔧 Key Test Coverage

### API Key Management
- ✅ API key generation with plaintext tokens
- ✅ Key activation/deactivation
- ✅ Authentication and authorization
- ✅ Plan-based limits (5 for free, 1000 for pro, unlimited for enterprise)

### Account Management
- ✅ Plan upgrades (free → pro → enterprise)
- ✅ Usage tracking and limits
- ✅ Storage calculation in GB
- ✅ Folder counting across buckets

### Bucket Operations
- ✅ Bucket creation and deletion
- ✅ Plan-based bucket limits
- ✅ Region validation
- ✅ Authorization checks

### Object Storage
- ✅ Object listing with pagination
- ✅ Prefix filtering
- ✅ Folder-based organization
- ✅ Plan-based folder limits

## 🎯 Pre-Docker Build Checklist

Before running `docker compose build`, run:

```bash
# 1. Complete validation
rake docker_validate

# 2. If that passes, you're safe to build
docker compose build storage-control-plane
```

## 🐛 Common Issues & Solutions

### Docker Build Fails Due to Tests
```bash
# Check what failed
make coverage-check

# Run tests locally to see details
make coverage

# Fix coverage issues
rake coverage:report
open coverage/coverage.html
```

### Test Failures
```bash
# Check database setup
rails db:test:prepare

# Run specific failing test
rails test test/models/api_key_test.rb
```

### Coverage Below 100%
```bash
# See what's not covered
rake coverage:report

# Generate detailed report
make coverage-report

# Check specific files
grep -E "(0\.0|\\d+\\.\\d+)" coverage/.last_run.json
```

### Missing Dependencies
```bash
# Install test gems
bundle install

# Ensure test database exists
rails db:create db:migrate RAILS_ENV=test
```

### Plan Limit Errors
- Check `Account.plan_limits` method
- Verify plan validation in models
- Ensure limits are enforced in controllers

## 📊 Test Output Example

```
🚀 Running quick pre-build tests...
🔍 Testing test/models/api_key_test.rb...
✅ PASS
🔍 Testing test/models/account_test.rb...
✅ PASS
🔍 Testing test/controllers/v1/account_controller_test.rb...
✅ PASS
🔍 Testing test/controllers/v1/buckets_controller_test.rb...
✅ PASS
🔍 Testing test/controllers/v1/objects_controller_test.rb...
✅ PASS
✅ All quick tests passed!
🎉 All Docker validation tests passed!
🐳 Ready to build Docker image!
```

## 🔍 Writing New Tests

Use the test helper methods:

```ruby
def setup
  @user = create_test_user(plan: "pro")
  @account = @user.account
  @api_key, @token = create_test_api_key(account: @account)
  @bucket = create_test_bucket(account: @account)
end

# Test assertions
assert_json_response([:id, :name, :status])
assert_error_response(:unprocessable_entity)
```

## 🐳 Docker Integration

### Multi-Stage Build Process
1. **Test Stage**: Runs all tests with 100% coverage requirement
2. **Validation Stage**: Runs additional Docker-specific tests  
3. **Build Stage**: Creates production image (only if tests pass)

### Build Failure Examples
```bash
# Test failure
❌ TESTS FAILED OR COVERAGE BELOW 100%

# Coverage failure  
❌ COVERAGE FAILED: 98.5% (required: 100.0%)

# Validation failure
❌ DOCKER VALIDATION FAILED
```

### Coverage Reports
- **HTML Report**: `coverage/coverage.html` - Interactive coverage visualization
- **JSON Report**: `coverage/coverage.json` - Machine-readable coverage data
- **Last Run**: `coverage/.last_run.json` - Most recent coverage results

## 🚨 Integration with CI/CD

### GitHub Actions (Included)
```yaml
# Automatic on push/PR
- Runs tests with 100% coverage
- Validates Docker build
- Security audit (bundler-audit, brakeman)
- Builds and pushes production image
```

### Manual Pipeline Integration
```bash
# Pre-build validation
make docker-build-validate

# Production build (only if tests pass)
make docker-prod

# CI pipeline
make ci
```

### Environment Variables
```bash
# Coverage requirements
COVERAGE_MINIMUM=100.0

# Test environment
RAILS_ENV=test
DATABASE_URL=postgres://...
```

This ensures no broken code reaches your Docker build stage and maintains 100% code coverage!
