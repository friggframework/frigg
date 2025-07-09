# Frigg Healthcheck Endpoint Documentation

## Overview

The Frigg service includes comprehensive healthcheck endpoints to monitor service health, connectivity, and readiness. These endpoints follow industry best practices and are designed for use with monitoring systems, load balancers, and container orchestration platforms.

## Endpoints

### 1. Basic Health Check
**GET** `/health`

Simple health check endpoint that returns basic service information. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T12:00:00.000Z",
  "service": "frigg-core-api",
  "version": "1.0.0"
}
```

**Status Codes:**
- `200 OK` - Service is running

### 2. Detailed Health Check
**GET** `/health/detailed`

Comprehensive health check that tests all service components and dependencies.

**Response:**
```json
{
  "service": "frigg-core-api",
  "status": "healthy",  // "healthy", "degraded", or "unhealthy"
  "timestamp": "2024-01-10T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,  // seconds
  "checks": {
    "database": {
      "status": "healthy",
      "state": "connected",
      "type": "mongodb",
      "responseTime": 5  // milliseconds
    },
    "external_apis": {
      "github": {
        "status": "healthy",
        "statusCode": 200,
        "responseTime": 150,
        "reachable": true
      },
      "npm": {
        "status": "healthy",
        "statusCode": 200,
        "responseTime": 200,
        "reachable": true
      }
    },
    "integrations": {
      "status": "healthy",
      "modules": {
        "count": 10,
        "available": ["module1", "module2", "..."]
      },
      "integrations": {
        "count": 5,
        "available": ["integration1", "integration2", "..."]
      }
    },
    "memory": {
      "status": "healthy",
      "rss": "150 MB",
      "heapTotal": "100 MB",
      "heapUsed": "80 MB",
      "external": "20 MB"
    }
  },
  "responseTime": 250  // total endpoint response time in milliseconds
}
```

**Status Codes:**
- `200 OK` - Service is healthy or degraded (but operational)
- `503 Service Unavailable` - Service is unhealthy

### 3. Liveness Probe
**GET** `/health/live`

Kubernetes-style liveness probe. Returns whether the service process is alive.

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-10T12:00:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Service process is alive

### 4. Readiness Probe
**GET** `/health/ready`

Kubernetes-style readiness probe. Returns whether the service is ready to receive traffic.

**Response:**
```json
{
  "ready": true,
  "timestamp": "2024-01-10T12:00:00.000Z",
  "checks": {
    "database": true,
    "modules": true
  }
}
```

**Status Codes:**
- `200 OK` - Service is ready
- `503 Service Unavailable` - Service is not ready

## Health Status Definitions

- **healthy**: All components are functioning normally
- **degraded**: Some non-critical components have issues, but core functionality is available
- **unhealthy**: Critical components are failing, service cannot function properly

## Component Checks

### Database Connectivity
- Checks MongoDB connection state
- Performs ping test if connected
- Reports connection state and response time

### External API Connectivity
- Tests connectivity to external services (GitHub, npm registry)
- Configurable timeout (default: 5 seconds)
- Reports reachability and response times

### Integration Status
- Verifies available modules and integrations are loaded
- Reports counts and lists of available components

### Memory Usage
- Reports current memory usage statistics
- Includes RSS, heap, and external memory metrics

## Usage Examples

### Monitoring Systems
Configure your monitoring system to poll `/health/detailed` every 30-60 seconds:
```bash
curl https://your-frigg-instance.com/health/detailed
```

### Load Balancer Health Checks
Configure load balancers to use the simple `/health` endpoint:
```bash
curl https://your-frigg-instance.com/health
```

### Kubernetes Configuration
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  periodSeconds: 10
  timeoutSeconds: 5

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
```

## Customization

### Adding External API Checks
To add more external API checks, modify the `externalAPIs` array in the health router:
```javascript
const externalAPIs = [
    { name: 'github', url: 'https://api.github.com/status' },
    { name: 'npm', url: 'https://registry.npmjs.org' },
    { name: 'your-api', url: 'https://your-api.com/health' }
];
```

### Adjusting Timeouts
The default timeout for external API checks is 5 seconds. Adjust as needed:
```javascript
const checkExternalAPI = (url, timeout = 5000) => {
    // ...
};
```

## Best Practices

1. **No Authentication**: Basic health endpoints should not require authentication to allow monitoring systems easy access
2. **Fast Response**: Health checks should respond quickly (< 1 second)
3. **Graceful Degradation**: Service can continue operating even if some non-critical components fail
4. **Detailed Logging**: Failed health checks are logged for debugging
5. **Version Information**: Always include version information for tracking deployments

## Troubleshooting

### Database Connection Issues
- Check `MONGO_URI` environment variable
- Verify network connectivity to MongoDB
- Check MongoDB server status

### External API Failures
- May indicate network issues or external service downtime
- Service continues to operate but reports "degraded" status

### Memory Issues
- Monitor memory metrics over time
- Consider increasing container/instance memory limits if consistently high

## Security Considerations

- Health endpoints do not expose sensitive information
- Database connection strings and credentials are never included in responses
- External API checks use read-only endpoints
- Consider IP whitelisting for detailed health endpoints in production