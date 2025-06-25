# Phase 2 Integration Guide

## Overview

This guide covers the complete integration of all Phase 2 features for the Frigg Management UI as specified in RFC 0001. Phase 2 introduces core features that transform the developer experience with visual tools for integration management, testing, and deployment.

## Phase 2 Core Features

### 1. Integration Discovery and Installation

The integration discovery system connects to the npm registry to find and install @friggframework modules.

#### Key Components:
- **IntegrationDiscoveryService**: Searches npm registry for Frigg integrations
- **IntegrationInstallerService**: Handles package installation and dependency management
- **UI Components**: Visual interface for browsing and installing integrations

#### Usage:
```javascript
// Discover integrations
const discoveries = await discoveryService.searchIntegrations({
  query: 'hubspot',
  limit: 20
});

// Install integration
const result = await installerService.installIntegration({
  packageName: '@friggframework/api-module-hubspot'
});
```

### 2. Dummy User Management System

Create and manage test users for development and testing purposes.

#### Features:
- Generate unique test IDs for each user
- Create OAuth credentials for testing
- Bulk user creation support
- Complete isolation from production data

#### API Endpoints:
- `POST /api/users/dummy` - Create a dummy user
- `GET /api/users/dummy` - List all dummy users
- `POST /api/users/dummy/:id/credentials` - Generate test credentials
- `POST /api/users/dummy/bulk` - Create multiple users

### 3. Connection/Entity Management

Manage connections between users and integrations with full entity synchronization.

#### Capabilities:
- Create and manage user-integration connections
- Health monitoring for active connections
- Entity CRUD operations
- Bulk synchronization support

#### Connection Lifecycle:
1. Create connection with user credentials
2. Test connection health
3. Manage entities (contacts, deals, messages, etc.)
4. Monitor connection status
5. Handle refresh/reconnection

### 4. Environment Variable Editor

Visual interface for managing environment variables across development and production.

#### Features:
- Read and display current variables
- Mask sensitive values (passwords, keys, secrets)
- Validate variable names
- Differentiate local vs production environments
- Bulk update support

#### Security:
- Automatic masking of sensitive values
- Validation to prevent invalid variable names
- Production update confirmation required
- AWS Parameter Store integration for production

## Integration Workflows

### Complete Integration Setup Flow

```javascript
const workflow = await phase2Workflows.setupIntegration('hubspot', {
  config: {
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret'
  },
  testUserName: 'HubSpot Test User',
  environment: 'development'
});
```

This workflow automatically:
1. Discovers integration details
2. Installs the package
3. Configures the integration
4. Creates a test user
5. Generates credentials
6. Creates a connection
7. Tests the connection
8. Sets up environment variables

### Bulk Integration Management

```javascript
const bulkResult = await phase2Workflows.bulkIntegrationSetup([
  { name: 'slack', options: { /* config */ } },
  { name: 'salesforce', options: { /* config */ } },
  { name: 'stripe', options: { /* config */ } }
], {
  batchSize: 3 // Process in parallel
});
```

### Development Environment Setup

```javascript
const devEnv = await phase2Workflows.setupDevelopmentEnvironment({
  projectType: 'saas',
  integrations: ['stripe', 'hubspot', 'slack'],
  testUserCount: 10,
  mockDataTypes: ['contacts', 'messages', 'payments']
});
```

## Testing Phase 2 Features

### Integration Tests

Run the comprehensive integration test suite:

```bash
npm run test:integration
```

Key test areas:
- End-to-end user flows
- WebSocket real-time updates
- Concurrent operation handling
- Error recovery
- Data consistency

### Performance Benchmarks

Run performance benchmarks:

```bash
npm run benchmark:phase2
```

Benchmark metrics:
- Integration discovery speed
- Installation throughput
- API response times
- WebSocket latency
- Memory usage under load
- Concurrent user capacity

### Validation Tests

Ensure RFC compliance:

```bash
npm run test:validation
```

Validates:
- All RFC requirements are met
- Security requirements
- Performance targets
- API contracts
- Migration compatibility

## Performance Optimization

### Caching Strategy

The discovery service implements a 1-hour cache for npm queries:
- Cold start: First request fetches from npm
- Cached: Subsequent requests use in-memory cache
- Cache invalidation: Manual or time-based

### Batch Processing

For optimal performance with multiple operations:
- Use bulk endpoints when available
- Process in configurable batch sizes
- Implement proper error handling per batch

### WebSocket Updates

Real-time updates for long-running operations:
- Installation progress
- Connection status changes
- Environment updates
- Error notifications

## Security Considerations

### Environment Variables
- Automatic masking of sensitive values
- Patterns detected: PASSWORD, SECRET, KEY, TOKEN, etc.
- Read-only access for discovery operations
- Production updates require explicit confirmation

### Test Data Isolation
- All dummy users marked with `isDummy: true`
- Test IDs include 'test' prefix
- Separate storage from production data
- No cross-contamination possible

### Input Validation
- Variable name validation (alphanumeric + underscore)
- Package name verification
- Credential format checking
- SQL injection prevention

## Migration from create-frigg-app

### Automated Migration

```javascript
const migration = await phase2Workflows.migrateProject('/path/to/project', {
  preserveCustom: true,
  integrationMapping: {
    'old-integration': 'new-integration'
  }
});
```

### Manual Migration Steps

1. **Backup existing project**
2. **Update dependencies**:
   ```json
   {
     "devDependencies": {
       "@friggframework/cli": "latest"
     }
   }
   ```
3. **Run migration command**:
   ```bash
   frigg migrate --from-create-frigg-app
   ```
4. **Verify integration configurations**
5. **Update environment variables**
6. **Test all connections**

## Troubleshooting

### Common Issues

#### Integration Discovery Fails
- Check network connectivity
- Verify npm registry access
- Clear discovery cache
- Check for proxy settings

#### Connection Test Failures
- Verify credentials are correct
- Check integration configuration
- Review API rate limits
- Inspect WebSocket connection

#### Environment Variable Issues
- Ensure valid variable names
- Check file permissions for .env
- Verify AWS credentials for production
- Look for conflicting variables

### Debug Mode

Enable debug logging:
```bash
DEBUG=frigg:* npm run dev:server
```

### Health Checks

Monitor system health:
```javascript
// API endpoint
GET /api/health

// Returns
{
  "status": "healthy",
  "services": {
    "discovery": "operational",
    "installer": "operational",
    "websocket": "connected",
    "environment": "configured"
  }
}
```

## Best Practices

1. **Use Workflows**: Leverage the provided workflows for complex operations
2. **Monitor Performance**: Regularly run benchmarks to ensure optimal performance
3. **Test Thoroughly**: Use the comprehensive test suites before deployment
4. **Handle Errors**: Implement proper error handling for all async operations
5. **Cache Wisely**: Use caching for frequently accessed data
6. **Secure Sensitive Data**: Always mask sensitive environment variables
7. **Document Custom Integrations**: Maintain clear documentation for custom work

## Next Steps

After Phase 2 implementation:

1. **Phase 3**: Advanced features including production monitoring
2. **Phase 4**: Multi-framework UI support
3. **Phase 5**: Complete migration and deprecation of create-frigg-app

For questions or issues, refer to the [Frigg documentation](https://docs.frigg.dev) or open an issue on GitHub.