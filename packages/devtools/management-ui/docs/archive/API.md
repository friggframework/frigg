# Frigg Management UI API

## Overview

The Management UI provides both a DDD-based development server and integrates with the core Frigg backend APIs.

## API Endpoints

### Integration Management

#### GET /api/integrations
Returns the user's installed integrations.

**Response:**
```json
[
  {
    "id": "int1",
    "name": "slack",
    "version": "1.0.0",
    "installed": true,
    "configured": true,
    "userActions": []
  }
]
```

#### GET /api/integrations/options
Returns available integration types configured in the Frigg instance.

**Response:**
```json
{
  "integrations": [
    {
      "type": "slack",
      "displayName": "Slack",
      "description": "Connect your Slack workspace",
      "category": "communication",
      "logo": "/icons/slack.svg",
      "modules": {},
      "requiredEntities": []
    }
  ],
  "count": 1
}
```

#### GET /api/entities
Returns user's authorized entities/accounts with enhanced information.

**Response:**
```json
{
  "entities": [
    {
      "id": "entity1",
      "type": "slack",
      "name": "My Slack Workspace",
      "status": "connected",
      "createdAt": "2023-01-01T00:00:00.000Z",
      "updatedAt": "2023-01-01T00:00:00.000Z",
      "credential": {
        "id": "cred1",
        "type": "slack"
      },
      "compatibleIntegrations": [
        {
          "integrationType": "slack-integration",
          "moduleKey": "slack",
          "displayName": "Slack Integration"
        }
      ],
      "metadata": {}
    }
  ],
  "entitiesByType": {
    "slack": [
      {
        "id": "entity1",
        "type": "slack",
        "name": "My Slack Workspace",
        "status": "connected"
      }
    ]
  },
  "totalCount": 1,
  "types": ["slack"]
}
```

#### POST /api/integrations
Create a new integration instance.

**Request:**
```json
{
  "entities": {
    "slack": "entity1"
  },
  "config": {
    "type": "slack-integration",
    "settings": {}
  }
}
```

**Response:**
```json
{
  "id": "int2",
  "name": "slack-integration",
  "entities": {
    "slack": "entity1"
  },
  "config": {},
  "status": "active"
}
```

#### PATCH /api/integrations/:integrationId
Update an existing integration.

**Request:**
```json
{
  "config": {
    "settings": {
      "channel": "#general"
    }
  }
}
```

#### DELETE /api/integrations/:integrationId
Delete an integration instance.

**Response:**
```json
{}
```

#### GET /api/integrations/:integrationId/test-auth
Test authentication for an integration.

**Response (Success):**
```json
{
  "status": "ok"
}
```

**Response (Failure):**
```json
{
  "errors": [
    {
      "title": "Authentication Error",
      "message": "Token expired",
      "timestamp": 1234567890
    }
  ]
}
```

### Entity Management

#### GET /api/authorize
Get authorization requirements for an entity type.

**Query Parameters:**
- `entityType` (required): The type of entity to authorize

**Response:**
```json
{
  "url": "https://oauth.example.com/authorize?...",
  "requiresCallback": true
}
```

#### POST /api/authorize
Process authorization callback.

**Request:**
```json
{
  "entityType": "slack",
  "data": {
    "code": "oauth-code"
  }
}
```

#### GET /api/entities/:entityId/test-auth
Test authentication for a specific entity.

**Response (Success):**
```json
{
  "status": "ok"
}
```

**Response (Failure):**
```json
{
  "errors": [
    {
      "title": "Authentication Error",
      "message": "Connection failed",
      "timestamp": 1234567890
    }
  ]
}
```

## Migration Guide

### From Old API Structure

**Before (Monolithic Response):**
```javascript
// GET /api/integrations returned everything
const response = await fetch('/api/integrations')
const data = await response.json()
// data.integrations - user's integrations
// data.entities.options - available API modules
// data.entities.authorized - user's entities
```

**After (Separated Endpoints):**
```javascript
// Fetch user's installed integrations
const integrations = await fetch('/api/integrations').then(r => r.json())

// Fetch available integration types
const options = await fetch('/api/integrations/options').then(r => r.json())

// Fetch user's entities
const entities = await fetch('/api/entities').then(r => r.json())
```

## Notes

- All `/api/integrations*` and `/api/entities*` routes require authentication
- Route naming follows REST conventions with nested resources (e.g., `/api/integrations/options`, not `/api/integration-options`)
- The `/api/entities` endpoint now returns enhanced information including compatible integrations
- Response formats are consistent between development server and production backend