# Frigg Management UI API Contract

## Overview
This document defines the API contract for CLI-GUI communication in the Frigg Management UI, implementing Phase 1 requirements from RFC 0001.

## Base Configuration
- **Base URL**: `http://localhost:3001/api`
- **WebSocket**: `ws://localhost:3001`
- **Content-Type**: `application/json`
- **Protocol**: REST API + WebSocket for real-time updates

## Standard Response Format

### Success Response
```json
{
  "status": "success",
  "data": any,
  "message": string,
  "timestamp": ISO8601
}
```

### Error Response
```json
{
  "status": "error",
  "error": {
    "code": string,
    "message": string,
    "details": any
  },
  "timestamp": ISO8601
}
```

## API Endpoints

### 1. Project Management
#### GET /api/project/status
Get current project status and configuration.

**Response:**
```json
{
  "status": "success",
  "data": {
    "name": "my-frigg-app",
    "version": "1.0.0",
    "friggVersion": "2.5.0",
    "status": "running|stopped|starting|stopping",
    "pid": number|null,
    "uptime": number,
    "port": number,
    "environment": "development|staging|production",
    "lastStarted": ISO8601|null
  }
}
```

#### POST /api/project/start
Start the Frigg project.

**Request:**
```json
{
  "stage": "dev|staging|production",
  "verbose": boolean,
  "port": number
}
```

#### POST /api/project/stop
Stop the Frigg project.

#### POST /api/project/restart
Restart the Frigg project with optional new configuration.

### 2. Integration Management
#### GET /api/integrations
List all available and installed integrations.

**Response:**
```json
{
  "status": "success",
  "data": {
    "installed": [
      {
        "id": string,
        "name": string,
        "displayName": string,
        "version": string,
        "description": string,
        "status": "active|inactive|error",
        "installedAt": ISO8601,
        "configRequired": boolean
      }
    ],
    "available": [
      {
        "name": string,
        "displayName": string,
        "description": string,
        "version": string,
        "category": string,
        "documentation": string
      }
    ]
  }
}
```

#### POST /api/integrations/install
Install a new integration.

**Request:**
```json
{
  "name": string,
  "version": string,
  "autoConfig": boolean
}
```

#### DELETE /api/integrations/:id
Uninstall an integration.

#### PUT /api/integrations/:id/configure
Configure an integration.

**Request:**
```json
{
  "config": Record<string, any>
}
```

### 3. Environment Management
#### GET /api/environment
Get environment variables.

**Response:**
```json
{
  "status": "success",
  "data": {
    "variables": Record<string, string>,
    "stage": "development|staging|production",
    "source": "file|aws-parameter-store"
  }
}
```

#### PUT /api/environment
Update environment variables.

**Request:**
```json
{
  "variables": Record<string, string>,
  "stage": string,
  "writeToFile": boolean
}
```

### 4. User Management (Test/Development)
#### GET /api/users
Get test users for development.

#### POST /api/users
Create a test user.

#### DELETE /api/users/:id
Delete a test user.

### 5. Connection Management
#### GET /api/connections
Get active connections and entities.

#### POST /api/connections/:integration/test
Test a connection for an integration.

#### GET /api/connections/:integration/entities
Get entities for a specific integration.

### 6. CLI Interface
#### POST /api/cli/execute
Execute CLI commands from the GUI.

**Request:**
```json
{
  "command": string,
  "args": string[],
  "options": Record<string, any>
}
```

#### GET /api/cli/commands
Get available CLI commands.

### 7. Logs and Monitoring
#### GET /api/logs
Get application logs.

**Query Parameters:**
- `limit`: number (default: 100)
- `level`: "error|warn|info|debug"
- `since`: ISO8601
- `component`: string

#### DELETE /api/logs
Clear logs.

## WebSocket Events

### Connection Management
- `connection` - Client connected
- `disconnect` - Client disconnected
- `error` - Connection error

### Project Events
- `project:status` - Project status changed
- `project:logs` - New log entries
- `project:error` - Project error occurred

### Integration Events
- `integrations:update` - Integration list changed
- `integrations:install` - Integration installed
- `integrations:uninstall` - Integration removed
- `integrations:configure` - Integration configured

### Environment Events
- `environment:update` - Environment variables changed
- `environment:sync` - Environment synced with remote

### CLI Events
- `cli:output` - CLI command output
- `cli:complete` - CLI command completed
- `cli:error` - CLI command error

## Error Codes

### General Errors
- `INVALID_REQUEST` - Invalid request format
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `INTERNAL_ERROR` - Server error

### Project Errors
- `PROJECT_NOT_FOUND` - No Frigg project found
- `PROJECT_ALREADY_RUNNING` - Project is already running
- `PROJECT_NOT_RUNNING` - Project is not running
- `PROJECT_START_FAILED` - Failed to start project
- `PROJECT_STOP_FAILED` - Failed to stop project

### Integration Errors
- `INTEGRATION_NOT_FOUND` - Integration not found
- `INTEGRATION_ALREADY_INSTALLED` - Integration already installed
- `INTEGRATION_INSTALL_FAILED` - Installation failed
- `INTEGRATION_CONFIG_INVALID` - Invalid configuration

### Environment Errors
- `ENV_READ_FAILED` - Failed to read environment
- `ENV_WRITE_FAILED` - Failed to write environment
- `ENV_SYNC_FAILED` - Failed to sync with remote

## Security Considerations
- Local development only (no external network calls)
- Environment variables properly masked in responses
- File system access limited to project directory
- Process management restricted to Frigg processes
- WebSocket connections authenticated via session