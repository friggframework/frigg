# Frigg Healthcheck Endpoint Documentation

## Overview

The Frigg service includes comprehensive healthcheck endpoints to monitor service health, connectivity, and readiness. These endpoints follow industry best practices and are designed for use with monitoring systems, load balancers, and container orchestration platforms.

## Endpoints

### 1. Basic Health Check
**GET** `/health`

Simple health check endpoint that returns basic service information. No authentication required. This endpoint is rate-limited at the API Gateway level.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T12:00:00.000Z",
  "service": "frigg-core-api"
}
```

**Status Codes:**
- `200 OK` - Service is running

### 2. Detailed Health Check
**GET** `/health/detailed`

Comprehensive health check that tests all service components and dependencies.

**Authentication Required:**
- Header: `x-api-key: YOUR_API_KEY`
- The API key must match the `HEALTH_API_KEY` environment variable

**Response:**
```json
{
  "service": "frigg-core-api",
  "status": "healthy",  // "healthy" or "unhealthy"
  "timestamp": "2024-01-10T12:00:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "state": "connected",
      "responseTime": 5  // milliseconds
    },
    "externalApis": {
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
    }
  },
  "responseTime": 250  // total endpoint response time in milliseconds
}
```

**Status Codes:**
- `200 OK` - Service is healthy (all components operational)
- `503 Service Unavailable` - Service is unhealthy (any component failure)
- `401 Unauthorized` - Missing or invalid x-api-key header

### 3. Liveness Probe
**GET** `/health/live`

Kubernetes-style liveness probe. Returns whether the service process is alive.

**Authentication Required:**
- Header: `x-api-key: YOUR_API_KEY`

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

**Authentication Required:**
- Header: `x-api-key: YOUR_API_KEY`

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
- **unhealthy**: Any component is failing, service may not function properly

## Component Checks

### Database Connectivity
- Checks database connection state
- Performs ping test with 2-second timeout if connected
- Reports connection state and response time
- Database type is not exposed for security reasons

### External API Connectivity
- Tests connectivity to external services (GitHub, npm registry)
- Configurable timeout (default: 5 seconds)
- Reports reachability and response times
- Uses Promise.all for parallel checking

### Integration Status
- Verifies available modules and integrations are loaded
- Reports counts and lists of available components

## Usage Examples

### Monitoring Systems
Configure your monitoring system to poll `/health/detailed` every 30-60 seconds:
```bash
curl -H "x-api-key: YOUR_API_KEY" https://your-frigg-instance.com/health/detailed
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
    httpHeaders:
    - name: x-api-key
      value: YOUR_API_KEY
  periodSeconds: 10
  timeoutSeconds: 5

readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
    httpHeaders:
    - name: x-api-key
      value: YOUR_API_KEY
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
The default timeout for external API checks is 5 seconds. Database ping timeout is set to 2 seconds:
```javascript
const checkExternalAPI = (url, timeout = 5000) => {
    // ...
};

await mongoose.connection.db.admin().ping({ maxTimeMS: 2000 });
```

## Best Practices

1. **Authentication**: Basic `/health` endpoint requires no authentication, but detailed endpoints require `x-api-key` header
2. **Rate Limiting**: Configure rate limiting at the API Gateway level to prevent abuse
3. **Fast Response**: Health checks should respond quickly (< 1 second)
4. **Strict Status Codes**: Return 503 for any non-healthy state to ensure proper alerting
5. **Detailed Logging**: Failed health checks are logged for debugging
6. **Security**: No sensitive information (DB types, versions) exposed in responses
7. **Lambda Considerations**: Uptime and memory metrics not included as they're not relevant in serverless

## Troubleshooting

### Database Connection Issues
- Check `MONGO_URI` environment variable
- Verify network connectivity to MongoDB
- Check MongoDB server status

### External API Failures
- May indicate network issues or external service downtime
- Service reports "unhealthy" status if any external API is unreachable

## Security Considerations

- Basic health endpoint requires no authentication for monitoring compatibility
- Detailed endpoints require `x-api-key` header authentication
- Health endpoints do not expose sensitive information
- Database connection strings and credentials are never included in responses
- External API checks use read-only endpoints
- Rate limiting should be configured at the API Gateway level
- Consider IP whitelisting for health endpoints in production

## Environment Variables

- `HEALTH_API_KEY`: Required API key for accessing detailed health endpoints