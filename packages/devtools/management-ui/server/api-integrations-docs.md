# Integrations API Documentation

## Overview

The Integrations API has been refactored to follow REST best practices and separate concerns. The API now provides dedicated endpoints for different integration-related operations.

## Base URL

All endpoints are prefixed with `/api/integrations`

## Authentication

All endpoints require authentication. Include the authentication token in the request headers.

## API Endpoints

### 1. Available Integrations (Marketplace/Discovery)

#### GET /api/integrations/available

Get integrations available for installation from the NPM registry.

**Query Parameters:**
- `category` (optional): Filter by integration category (CRM, Communication, etc.)
- `search` (optional): Search term to filter integrations
- `limit` (optional): Maximum number of results (default: 100)

**Response:**
```json
{
  "success": true,
  "data": {
    "integrations": [
      {
        "id": "@friggframework/api-module-hubspot",
        "name": "@friggframework/api-module-hubspot",
        "version": "1.2.3",
        "description": "HubSpot CRM integration for Frigg",
        "category": "CRM",
        "tags": ["crm", "hubspot", "sales"],
        "npmUrl": "https://www.npmjs.com/package/@friggframework/api-module-hubspot",
        "published": "2024-01-15T10:30:00.000Z",
        "type": "available"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 100
    },
    "filters": {
      "category": "CRM",
      "search": null
    }
  }
}
```

### 2. Installed Integrations

#### GET /api/integrations/installed

Get all installed integrations for the current user.

**Response:**
```json
{
  "success": true,
  "data": {
    "integrations": [
      {
        "id": "hubspot",
        "name": "hubspot",
        "displayName": "HubSpot",
        "description": "HubSpot integration",
        "category": "CRM",
        "version": "1.0.0",
        "status": "active",
        "type": "installed",
        "className": "HubSpotIntegration",
        "events": ["contact.created", "deal.updated"],
        "supportedVersions": ["v1", "v2"],
        "hasUserConfig": true,
        "icon": "hubspot-icon.png",
        "detailsUrl": "https://hubspot.com",
        "apiModules": [
          {
            "name": "contacts",
            "module": "ContactsModule",
            "description": "API module for contacts"
          }
        ],
        "constructor": {
          "name": "HubSpotIntegration",
          "hasConfig": true,
          "hasOptions": true,
          "hasModules": true
        }
      }
    ],
    "count": 3,
    "summary": {
      "active": 2,
      "error": 1,
      "categories": ["CRM", "Communication"]
    }
  }
}
```

#### GET /api/integrations/installed/:id

Get a specific installed integration by ID.

**Path Parameters:**
- `id`: Integration ID or name

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "hubspot",
    "name": "hubspot",
    "displayName": "HubSpot",
    "description": "HubSpot integration",
    "category": "CRM",
    "version": "1.0.0",
    "status": "active",
    "type": "installed"
    // ... other integration details
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Integration not found",
    "details": "Integration with id 'nonexistent' not found"
  }
}
```

### 3. Integration Configuration

#### GET /api/integrations/installed/:id/config

Get configuration for a specific integration.

**Response:**
```json
{
  "success": true,
  "data": {
    "integrationId": "hubspot",
    "integrationName": "HubSpot",
    "config": {
      "apiKey": "hubspot-api-key",
      "portalId": "12345",
      "syncSettings": {
        "autoSync": true,
        "syncFrequency": "1hour"
      }
    }
  }
}
```

#### PUT /api/integrations/installed/:id/config

Update configuration for a specific integration.

**Request Body:**
```json
{
  "config": {
    "apiKey": "new-hubspot-api-key",
    "portalId": "67890",
    "syncSettings": {
      "autoSync": false,
      "syncFrequency": "1day"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "integrationId": "hubspot",
    "integrationName": "HubSpot",
    "config": {
      "apiKey": "new-hubspot-api-key",
      "portalId": "67890",
      "syncSettings": {
        "autoSync": false,
        "syncFrequency": "1day"
      }
    },
    "message": "Configuration saved successfully"
  }
}
```

#### POST /api/integrations/installed/:id/config/test

Test the configuration for a specific integration.

**Response:**
```json
{
  "success": true,
  "data": {
    "integrationId": "hubspot",
    "integrationName": "HubSpot",
    "testResult": "success",
    "message": "Configuration test passed"
  }
}
```

### 4. Integration Installation

#### POST /api/integrations/install

Install a new integration package.

**Request Body:**
```json
{
  "packageName": "@friggframework/api-module-hubspot"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "packageName": "@friggframework/api-module-hubspot",
    "status": "installed",
    "message": "Integration @friggframework/api-module-hubspot installed successfully",
    "output": "npm install output..."
  }
}
```

#### DELETE /api/integrations/install/:packageName

Uninstall an integration package.

**Response:**
```json
{
  "success": true,
  "data": {
    "packageName": "@friggframework/api-module-hubspot",
    "status": "removed",
    "message": "Integration @friggframework/api-module-hubspot removed successfully"
  }
}
```

### 5. Legacy Endpoint (Deprecated)

#### GET /api/integrations

**⚠️ DEPRECATED** - This endpoint is maintained for backward compatibility but should not be used in new implementations.

**Response:**
```json
{
  "success": true,
  "data": {
    "integrations": [...],
    "availableApiModules": [...],
    "total": 10,
    "activeIntegrations": 3,
    "availableModules": 7,
    "source": "appDefinition",
    "message": "Found 3 active integrations from backend appDefinition",
    "deprecationNotice": {
      "message": "This endpoint is deprecated. Please use the new RESTful endpoints:",
      "newEndpoints": {
        "available": "GET /api/integrations/available",
        "installed": "GET /api/integrations/installed",
        "configuration": "GET /api/integrations/installed/:id/config"
      }
    }
  }
}
```

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

- `VALIDATION_ERROR`: Request validation failed
- `NOT_FOUND`: Resource not found
- `INTERNAL_ERROR`: Server error
- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Access denied

## WebSocket Events

The API broadcasts WebSocket events for real-time updates:

### Installation Events

**Event:** `integration-install`

**Payload:**
```json
{
  "status": "installing|installed|error",
  "packageName": "@friggframework/api-module-hubspot",
  "message": "Status message",
  "output": "Command output (on success)",
  "error": "Error message (on error)"
}
```

### Removal Events

**Event:** `integration-remove`

**Payload:**
```json
{
  "status": "removing|removed|error",
  "packageName": "@friggframework/api-module-hubspot",
  "message": "Status message",
  "error": "Error message (on error)"
}
```

## Migration Guide

### From Legacy Endpoint

**Before:**
```javascript
// Old way - single endpoint
const response = await fetch('/api/integrations');
const data = await response.json();
const { integrations, availableApiModules } = data;
```

**After:**
```javascript
// New way - separate endpoints
const [installedResponse, availableResponse] = await Promise.all([
  fetch('/api/integrations/installed'),
  fetch('/api/integrations/available')
]);

const installed = await installedResponse.json();
const available = await availableResponse.json();
```

### Benefits of New Structure

1. **Single Responsibility**: Each endpoint has a clear, single purpose
2. **Better Caching**: Can cache different types of data independently
3. **Improved Performance**: Only fetch the data you need
4. **RESTful Design**: Follows REST principles with proper resource separation
5. **Better Error Handling**: Specific error responses for different scenarios
6. **Extensibility**: Easy to add new features without breaking existing endpoints

## Integration Categories

Available integration categories:

- **CRM**: Customer Relationship Management (HubSpot, Salesforce, etc.)
- **Communication**: Email, SMS, Chat (Slack, Discord, Teams, etc.)
- **E-commerce**: Online stores and payment systems (Stripe, PayPal, etc.)
- **Marketing**: Marketing automation (Mailchimp, ActiveCampaign, etc.)
- **Productivity**: Task and project management (Asana, Trello, Notion, etc.)
- **Analytics**: Data tracking and analysis (Google Analytics, Mixpanel, etc.)
- **Support**: Customer support systems (Zendesk, Intercom, etc.)
- **Finance**: Accounting and billing (QuickBooks, Xero, etc.)
- **Developer Tools**: Development and collaboration tools (GitHub, GitLab, etc.)
- **Social Media**: Social media platforms (Facebook, Twitter, Instagram, etc.)
- **Other**: Miscellaneous integrations