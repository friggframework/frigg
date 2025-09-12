# Entities API Documentation

## Overview

The Entities API manages user entities/accounts that are connected to integrations. This API provides CRUD operations for managing connected accounts and their configurations.

## Base URL

All endpoints are prefixed with `/api/entities`

## Authentication

All endpoints require authentication. Include the authentication token in the request headers.

## API Endpoints

### 1. List Entities

#### GET /api/entities

Get all user entities/accounts.

**Query Parameters:**
- `type` (optional): Filter by entity type (hubspot, salesforce, etc.)
- `status` (optional): Filter by connection status (connected, connecting, error)

**Response:**
```json
{
  "success": true,
  "data": {
    "entities": [
      {
        "id": "entity-1",
        "name": "My HubSpot Account",
        "type": "hubspot",
        "status": "connected",
        "connectedAt": "2024-01-15T10:30:00.000Z",
        "lastSync": "2024-01-15T12:00:00.000Z",
        "metadata": {
          "accountId": "hubspot-123",
          "accountName": "My Company",
          "region": "us-east-1"
        }
      },
      {
        "id": "entity-2",
        "name": "Salesforce Org",
        "type": "salesforce",
        "status": "connected",
        "connectedAt": "2024-01-15T10:30:00.000Z",
        "lastSync": "2024-01-15T12:00:00.000Z",
        "metadata": {
          "orgId": "salesforce-456",
          "orgName": "Sales Org",
          "instanceUrl": "https://mycompany.salesforce.com"
        }
      }
    ],
    "count": 2,
    "filters": {
      "type": null,
      "status": null
    },
    "summary": {
      "connected": 2,
      "connecting": 0,
      "error": 0,
      "types": ["hubspot", "salesforce"]
    }
  }
}
```

### 2. Get Specific Entity

#### GET /api/entities/:id

Get a specific entity by ID.

**Path Parameters:**
- `id`: Entity ID

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "entity-1",
    "name": "My HubSpot Account",
    "type": "hubspot",
    "status": "connected",
    "connectedAt": "2024-01-15T10:30:00.000Z",
    "lastSync": "2024-01-15T12:00:00.000Z",
    "metadata": {
      "accountId": "hubspot-123",
      "accountName": "My Company",
      "region": "us-east-1"
    }
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Entity not found",
    "details": "Entity with id 'nonexistent' not found"
  }
}
```

### 3. Create Entity

#### POST /api/entities

Create a new entity/account connection.

**Request Body:**
```json
{
  "name": "New HubSpot Account",
  "type": "hubspot",
  "metadata": {
    "accountId": "hubspot-789",
    "accountName": "New Company",
    "region": "us-west-2"
  }
}
```

**Required Fields:**
- `name`: Display name for the entity
- `type`: Entity type (hubspot, salesforce, etc.)

**Response:**
```json
{
  "success": true,
  "data": {
    "entity": {
      "id": "entity-3",
      "name": "New HubSpot Account",
      "type": "hubspot",
      "status": "connecting",
      "connectedAt": "2024-01-15T14:30:00.000Z",
      "lastSync": "2024-01-15T14:30:00.000Z",
      "metadata": {
        "accountId": "hubspot-789",
        "accountName": "New Company",
        "region": "us-west-2"
      }
    },
    "message": "Entity created successfully"
  }
}
```

### 4. Update Entity

#### PUT /api/entities/:id

Update an existing entity.

**Request Body:**
```json
{
  "name": "Updated HubSpot Account",
  "metadata": {
    "accountId": "hubspot-789",
    "accountName": "Updated Company Name",
    "region": "us-east-1"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entity": {
      "id": "entity-1",
      "name": "Updated HubSpot Account",
      "type": "hubspot",
      "status": "connected",
      "connectedAt": "2024-01-15T10:30:00.000Z",
      "lastSync": "2024-01-15T15:00:00.000Z",
      "metadata": {
        "accountId": "hubspot-789",
        "accountName": "Updated Company Name",
        "region": "us-east-1"
      }
    },
    "message": "Entity updated successfully"
  }
}
```

### 5. Delete Entity

#### DELETE /api/entities/:id

Delete an entity and disconnect the account.

**Response:**
```json
{
  "success": true,
  "data": {
    "result": {
      "success": true,
      "deletedEntityId": "entity-1"
    },
    "message": "Entity deleted successfully"
  }
}
```

### 6. Test Entity Connection

#### POST /api/entities/:id/test

Test the connection to an entity's external service.

**Response:**
```json
{
  "success": true,
  "data": {
    "entityId": "entity-1",
    "status": "success",
    "message": "Connection test passed",
    "timestamp": "2024-01-15T15:30:00.000Z"
  }
}
```

### 7. Entity Options

#### GET /api/entities/:id/options

Get available configuration options for an entity.

**Response:**
```json
{
  "success": true,
  "data": {
    "entityId": "entity-1",
    "entityType": "hubspot",
    "options": [
      {
        "key": "sync_frequency",
        "label": "Sync Frequency",
        "type": "select",
        "values": ["5min", "15min", "1hour", "1day"]
      },
      {
        "key": "auto_sync",
        "label": "Auto Sync",
        "type": "boolean",
        "default": true
      },
      {
        "key": "notifications",
        "label": "Notifications",
        "type": "boolean",
        "default": false
      }
    ]
  }
}
```

#### POST /api/entities/:id/options

Update configuration options for an entity.

**Request Body:**
```json
{
  "options": {
    "sync_frequency": "1hour",
    "auto_sync": true,
    "notifications": false
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "entityId": "entity-1",
    "entityType": "hubspot",
    "options": {
      "sync_frequency": "1hour",
      "auto_sync": true,
      "notifications": false
    },
    "updatedAt": "2024-01-15T15:45:00.000Z",
    "message": "Entity options updated successfully"
  }
}
```

## Entity Status Values

- **connected**: Entity is successfully connected and operational
- **connecting**: Entity connection is in progress
- **error**: Entity connection failed or has errors
- **disconnected**: Entity is disconnected but not deleted

## Entity Types

Common entity types include:

- **hubspot**: HubSpot CRM accounts
- **salesforce**: Salesforce organizations
- **slack**: Slack workspaces
- **github**: GitHub repositories or organizations
- **stripe**: Stripe payment accounts
- **mailchimp**: Mailchimp marketing accounts
- **zendesk**: Zendesk support accounts

## Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": "Additional error details",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Request validation failed (missing required fields)
- `NOT_FOUND`: Entity not found
- `INTERNAL_ERROR`: Server error
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Access denied

## Entity Metadata Structure

The `metadata` field contains type-specific information about the entity:

### HubSpot Entity
```json
{
  "accountId": "hubspot-123",
  "accountName": "My Company",
  "region": "us-east-1",
  "portalId": "12345",
  "apiKey": "masked-api-key"
}
```

### Salesforce Entity
```json
{
  "orgId": "salesforce-456",
  "orgName": "Sales Org",
  "instanceUrl": "https://mycompany.salesforce.com",
  "username": "user@company.com",
  "environment": "production"
}
```

### Slack Entity
```json
{
  "teamId": "slack-team-123",
  "teamName": "My Team",
  "botUserId": "bot-user-456",
  "workspace": "mycompany.slack.com"
}
```

## Usage Examples

### List all connected entities
```javascript
const response = await fetch('/api/entities?status=connected');
const data = await response.json();
console.log('Connected entities:', data.data.entities);
```

### Create a new HubSpot entity
```javascript
const response = await fetch('/api/entities', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    name: 'Production HubSpot',
    type: 'hubspot',
    metadata: {
      accountId: 'hubspot-prod-123',
      accountName: 'Production Company',
      region: 'us-east-1'
    }
  })
});
```

### Test entity connection
```javascript
const response = await fetch('/api/entities/entity-1/test', {
  method: 'POST'
});
const result = await response.json();
if (result.data.status === 'success') {
  console.log('Connection test passed');
} else {
  console.log('Connection test failed');
}
```

### Update entity options
```javascript
const response = await fetch('/api/entities/entity-1/options', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    options: {
      sync_frequency: '1hour',
      auto_sync: true,
      notifications: false
    }
  })
});
```

## Integration with Integrations API

Entities work closely with the Integrations API:

1. **Install Integration**: Use `/api/integrations/install` to install an integration package
2. **Configure Integration**: Use `/api/integrations/installed/:id/config` to configure the integration
3. **Create Entity**: Use `/api/entities` to create connected accounts for the integration
4. **Manage Entity**: Use entity endpoints to manage the connected accounts

This separation allows for:
- Multiple accounts per integration (e.g., multiple HubSpot portals)
- Independent management of integrations and their connected accounts
- Better organization and scalability