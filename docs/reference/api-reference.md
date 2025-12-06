# API Reference

The Frigg Management API provides endpoints for managing integrations, credentials, and entities.

## OpenAPI Specification

The complete API specification is available as an [OpenAPI/Swagger document](/.gitbook/assets/Frigg%20Management%20API.yml).

## Endpoints Overview

### Authorization

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/authorize` | Get authorization options |
| `POST` | `/api/authorize` | Create authorization |

### Entities

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/entities/options/{credentialId}` | Get entity options for a credential |
| `POST` | `/api/entities` | Create a new entity |

### Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/integrations` | List all integrations |
| `POST` | `/api/integrations` | Create a new integration |
| `GET` | `/api/integrations/options` | Get integration options |
| `GET` | `/api/integrations/{integrationId}` | Get a specific integration |
| `PATCH` | `/api/integrations/{integrationId}` | Update an integration |
| `DELETE` | `/api/integrations/{integrationId}` | Delete an integration |

### Integration Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/integrations/{integrationId}/config/options` | Get configuration options |
| `GET` | `/api/integrations/{integrationId}/actions/{actionId}/options` | Get action options |
| `POST` | `/api/integrations/{integrationId}/actions/{actionId}` | Execute an action |

## Authentication

All API endpoints require authentication. Include your API token in the request headers:

```http
Authorization: Bearer <your-api-token>
```

## Response Format

All responses are returned in JSON format:

```json
{
  "success": true,
  "data": { ... }
}
```

Error responses follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```
