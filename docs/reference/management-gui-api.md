# Management GUI API Reference

## Overview

The Frigg Management GUI exposes a REST API for interaction between the UI and the Frigg backend. This API is automatically started when running `frigg ui`.

**Base URL:** `http://localhost:3001/api`

## Authentication

The Management GUI API uses token-based authentication for production environments. In local development, authentication is optional.

```http
Authorization: Bearer <token>
```

## Endpoints

### System Status

#### GET /api/status
Get the current status of the Frigg system.

**Response:**
```json
{
  "status": "running",
  "version": "2.0.0",
  "uptime": 3600,
  "environment": "development",
  "integrations": {
    "loaded": 5,
    "available": 23
  }
}
```

### Integrations

#### GET /api/integrations
List all available integrations.

**Query Parameters:**
- `installed` (boolean): Filter by installation status
- `category` (string): Filter by category
- `search` (string): Search integrations

**Response:**
```json
{
  "integrations": [
    {
      "id": "hubspot",
      "name": "HubSpot",
      "category": "CRM",
      "description": "HubSpot CRM integration",
      "installed": true,
      "version": "1.2.0",
      "icon": "/icons/hubspot.svg",
      "authType": "oauth2"
    }
  ],
  "total": 23
}
```

#### GET /api/integrations/:id
Get details for a specific integration.

**Response:**
```json
{
  "id": "hubspot",
  "name": "HubSpot",
  "installed": true,
  "configuration": {
    "clientId": "xxx-xxx",
    "redirectUri": "http://localhost:3000/redirect/hubspot",
    "scopes": ["contacts", "companies"],
    "webhooksEnabled": true
  },
  "methods": [
    {
      "name": "listContacts",
      "description": "List all contacts",
      "parameters": [
        {
          "name": "limit",
          "type": "number",
          "required": false,
          "default": 20
        }
      ]
    }
  ]
}
```

#### POST /api/integrations/:id/install
Install an integration.

**Request Body:**
```json
{
  "version": "latest"
}
```

**Response:**
```json
{
  "success": true,
  "integration": "hubspot",
  "version": "1.2.0",
  "message": "Integration installed successfully"
}
```

#### PUT /api/integrations/:id/configure
Update integration configuration.

**Request Body:**
```json
{
  "clientId": "new-client-id",
  "clientSecret": "new-secret",
  "webhooksEnabled": true
}
```

#### POST /api/integrations/:id/test
Test integration connection.

**Request Body:**
```json
{
  "userId": "test-user-123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "details": {
    "authStatus": "valid",
    "apiCallsRemaining": 9950,
    "latency": 45
  }
}
```

### Test Users

#### GET /api/test-users
List all test users.

**Response:**
```json
{
  "users": [
    {
      "id": "test-user-123",
      "name": "John Doe",
      "email": "john@test.com",
      "connections": ["hubspot", "salesforce"],
      "created": "2024-01-25T10:00:00Z"
    }
  ]
}
```

#### POST /api/test-users
Create a new test user.

**Request Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@test.com"
}
```

#### POST /api/test-users/:id/connections
Connect integration to test user.

**Request Body:**
```json
{
  "integration": "hubspot",
  "credentials": {
    "accessToken": "test-token",
    "refreshToken": "test-refresh"
  }
}
```

### Environment Variables

#### GET /api/environment
Get environment variables (masked).

**Query Parameters:**
- `environment` (string): Target environment (local, staging, production)

**Response:**
```json
{
  "variables": [
    {
      "key": "HUBSPOT_CLIENT_ID",
      "value": "abc123...",
      "masked": false
    },
    {
      "key": "HUBSPOT_CLIENT_SECRET",
      "value": "****",
      "masked": true
    }
  ],
  "environment": "local"
}
```

#### PUT /api/environment
Update environment variables.

**Request Body:**
```json
{
  "variables": {
    "NEW_VAR": "value",
    "UPDATED_VAR": "new-value"
  },
  "environment": "local"
}
```

#### POST /api/environment/sync
Sync with AWS Parameter Store.

**Request Body:**
```json
{
  "direction": "push|pull",
  "environment": "production",
  "awsProfile": "default"
}
```

### API Testing

#### POST /api/test/method
Execute an integration method.

**Request Body:**
```json
{
  "integration": "hubspot",
  "method": "listContacts",
  "userId": "test-user-123",
  "parameters": {
    "limit": 10,
    "offset": 0
  }
}
```

**Response:**
```json
{
  "success": true,
  "duration": 145,
  "result": {
    "results": [...],
    "total": 100
  },
  "metadata": {
    "rateLimitRemaining": 950,
    "responseTime": 145
  }
}
```

### Code Generation

#### POST /api/generate/code
Generate code from configuration.

**Request Body:**
```json
{
  "type": "endpoint",
  "integration": "hubspot",
  "method": "listContacts",
  "options": {
    "includeAuth": true,
    "errorHandling": true,
    "pagination": true
  },
  "framework": "express"
}
```

**Response:**
```json
{
  "code": "const router = require('express').Router();\n\nrouter.get('/api/hubspot/contacts', ...",
  "language": "javascript",
  "filename": "hubspot-contacts.js"
}
```

### Monitoring

#### GET /api/monitor/metrics
Get performance metrics.

**Query Parameters:**
- `duration` (string): Time range (1h, 24h, 7d)
- `integration` (string): Filter by integration

**Response:**
```json
{
  "metrics": {
    "apiCalls": {
      "total": 1234,
      "series": [...]
    },
    "responseTime": {
      "average": 45,
      "p95": 120,
      "p99": 250
    },
    "errors": {
      "total": 5,
      "rate": 0.004
    }
  },
  "period": {
    "start": "2024-01-25T00:00:00Z",
    "end": "2024-01-25T01:00:00Z"
  }
}
```

#### GET /api/monitor/logs
Get activity logs.

**Query Parameters:**
- `limit` (number): Number of logs
- `offset` (number): Pagination offset
- `level` (string): Log level filter
- `integration` (string): Filter by integration

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2024-01-25T10:30:45Z",
      "level": "info",
      "method": "GET",
      "path": "/api/hubspot/contacts",
      "status": 200,
      "duration": 45,
      "integration": "hubspot",
      "user": "test-user-123"
    }
  ],
  "total": 500,
  "offset": 0
}
```

### Project Management

#### GET /api/project
Get project information.

**Response:**
```json
{
  "name": "my-integrations",
  "version": "1.0.0",
  "friggVersion": "2.0.0",
  "configuration": {
    "hasConfig": true,
    "configPath": "./frigg.config.js"
  },
  "structure": {
    "integrations": ["hubspot", "salesforce"],
    "customFiles": ["custom-auth.js"]
  }
}
```

#### POST /api/project/validate
Validate project structure.

**Response:**
```json
{
  "valid": true,
  "checks": [
    {
      "name": "structure",
      "passed": true
    },
    {
      "name": "dependencies",
      "passed": true
    },
    {
      "name": "configuration",
      "passed": true
    }
  ]
}
```

## WebSocket API

The Management GUI also provides WebSocket connections for real-time updates.

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3001/ws');
```

### Events

#### Subscribe to logs
```json
{
  "type": "subscribe",
  "channel": "logs"
}
```

#### Log event
```json
{
  "type": "log",
  "data": {
    "timestamp": "2024-01-25T10:30:45Z",
    "level": "info",
    "message": "API call completed"
  }
}
```

#### Subscribe to metrics
```json
{
  "type": "subscribe",
  "channel": "metrics"
}
```

#### Metrics update
```json
{
  "type": "metrics",
  "data": {
    "apiCalls": 1235,
    "activeConnections": 5,
    "responseTime": 43
  }
}
```

## Error Responses

All endpoints follow a consistent error format:

```json
{
  "error": {
    "code": "INTEGRATION_NOT_FOUND",
    "message": "Integration 'unknown' not found",
    "details": {
      "integration": "unknown",
      "available": ["hubspot", "salesforce", "slack"]
    }
  }
}
```

### Common Error Codes

- `INTEGRATION_NOT_FOUND`: Integration doesn't exist
- `CONFIGURATION_ERROR`: Invalid configuration
- `CONNECTION_FAILED`: Unable to connect to integration
- `VALIDATION_ERROR`: Request validation failed
- `AUTHENTICATION_REQUIRED`: Auth needed for this operation
- `PERMISSION_DENIED`: Insufficient permissions
- `RATE_LIMITED`: Too many requests

## Rate Limiting

Local development: No rate limiting
Production: 100 requests per minute per IP

Rate limit headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## CORS

The API supports CORS for local development:

```http
Access-Control-Allow-Origin: http://localhost:3001
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type, Authorization
```

## Health Check

#### GET /api/health

Always available endpoint for monitoring:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-25T10:30:00Z"
}
```