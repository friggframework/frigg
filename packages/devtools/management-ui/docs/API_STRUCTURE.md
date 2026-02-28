# Management UI Backend API Structure

## Philosophy
**Management UI** = Development tooling for building Frigg applications
- Manages projects/repositories
- Starts/stops Frigg processes
- Streams logs
- Provides IDE integration
- Discovers npm modules

**Frigg App** = Runtime (started by Management UI)
- User management
- Connection/OAuth management
- Integration testing

**Test Area Flow**:
1. Management UI starts Frigg → returns port
2. Test Area calls Frigg directly at `http://localhost:{port}`
3. UI library calls Frigg directly for all integration operations

---

## API Routes

### Projects

```
GET    /projects
```
Scan filesystem and list all Frigg projects (git repos with frigg config).

**Response:**
```json
[
  {
    "id": "a3f2c1b9",
    "name": "my-integration",
    "path": "/Users/sean/projects/my-integration",
    "last_modified": "2025-09-30T10:30:00Z",
    "has_frigg_config": true,
    "git_branch": "main"
  }
]
```

**Note:** ID is deterministic hash (first 8 chars of SHA-256 of absolute path)

---

```
GET    /projects/{id}
```
Get complete project details.

**Response:**
```json
{
  "id": "a3f2c1b9",
  "name": "my-integration",
  "path": "/Users/sean/projects/my-integration",
  "appDefinition": {
    "name": "my-app",
    "version": "1.0.0",
    "integrations": [
      {
        "name": "slack-integration",
        "modules": ["slack", "hubspot"]
      }
    ]
  },
  "apiModules": [
    { "name": "@friggframework/api-module-slack", "version": "1.2.3" }
  ],
  "git": {
    "currentBranch": "main",
    "status": { "staged": 0, "unstaged": 2, "untracked": 1 }
  },
  "friggStatus": {
    "running": true,
    "executionId": "uuid",
    "port": 3000
  }
}
```

---

### Frigg Process Management

```
POST   /projects/{id}/frigg/executions
```
Start Frigg process for this project.

**Request:**
```json
{
  "port": 3000,
  "env": { "NODE_ENV": "development" }
}
```

**Response:**
```json
{
  "execution_id": "uuid",
  "pid": 12345,
  "started_at": "2025-09-30T10:30:00Z",
  "port": 3000,
  "frigg_base_url": "http://localhost:3000",
  "websocket_url": "ws://localhost:8080/projects/{id}/frigg/executions/{execution-id}/logs"
}
```

**Note:** Test Area uses `frigg_base_url` to call Frigg directly

---

```
GET    /projects/{id}/frigg/executions/{execution-id}/status
```
Get status of a specific Frigg execution.

**Response:**
```json
{
  "execution_id": "uuid",
  "running": true,
  "started_at": "2025-09-30T10:30:00Z",
  "uptime_seconds": 3600,
  "pid": 12345,
  "port": 3000,
  "frigg_base_url": "http://localhost:3000"
}
```

---

```
DELETE /projects/{id}/frigg/executions/{execution-id}
```
Stop a specific Frigg process (SIGTERM → SIGKILL).

**Response:** 204 No Content

---

```
DELETE /projects/{id}/frigg/executions/current
```
Convenience endpoint: Stop the currently running Frigg process.

**Response:** 204 No Content

---

### IDE Integration

```
POST   /projects/{id}/ide-sessions
```
Open project in IDE.

**Request:**
```json
{
  "editor": "vscode",
  "focus_file": "src/index.ts"
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "editor": "vscode",
  "command": "code /Users/sean/projects/my-integration",
  "opened_at": "2025-09-30T10:30:00Z"
}
```

---

### Git Operations

```
GET    /projects/{id}/git/branches
```
List all branches.

**Response:**
```json
{
  "current": "main",
  "branches": [
    {
      "name": "main",
      "type": "local",
      "head_commit": "abc123",
      "tracking": "origin/main"
    }
  ]
}
```

---

```
GET    /projects/{id}/git/status
```
Get git working directory status.

**Response:**
```json
{
  "branch": "main",
  "staged": ["src/file1.ts"],
  "unstaged": ["src/file2.ts"],
  "untracked": ["temp/file3.ts"],
  "clean": false
}
```

---

```
PATCH  /projects/{id}/git/current-branch
```
Switch to a different branch.

**Request:**
```json
{
  "name": "feature/new-feature",
  "create": false,
  "force": false
}
```

**Response:**
```json
{
  "name": "feature/new-feature",
  "head_commit": "xyz789",
  "dirty": false
}
```

---

### API Module Library

```
GET    /api-module-library
```
Discover all @friggframework/api-module-* packages.

**Query params:**
- `?search=slack` - filter by name/description
- `?category=auth` - filter by category

**Response:**
```json
[
  {
    "id": "slack",
    "package_name": "@friggframework/api-module-slack",
    "version": "1.2.3",
    "description": "Slack API Module",
    "category": "communication",
    "npm_url": "https://www.npmjs.com/package/@friggframework/api-module-slack"
  }
]
```

---

```
GET    /api-module-library/{module-id}
```
Get detailed information about a specific module.

**Response:**
```json
{
  "id": "slack",
  "package_name": "@friggframework/api-module-slack",
  "version": "1.2.3",
  "description": "...",
  "repository": "https://github.com/friggframework/...",
  "configuration": {
    "required_env_vars": ["SLACK_CLIENT_ID"],
    "scopes": ["channels:read"]
  },
  "readme": "# Slack API Module..."
}
```

---

## Project ID Generation

```javascript
import crypto from 'crypto';

function generateProjectId(absolutePath) {
  const hash = crypto.createHash('sha256')
    .update(absolutePath)
    .digest('hex');
  return hash.substring(0, 8);
}
```

---

## Test Area Flow

1. **Frontend calls**: `POST /projects/{id}/frigg/executions` → get `port` and `execution_id`
2. **Test Area directly calls Frigg**:
   - `GET http://localhost:{port}/users`
   - `POST http://localhost:{port}/users`
   - `POST http://localhost:{port}/users/login` → get token
3. **Pass to UI Library**: `<IntegrationManager friggBaseUrl="http://localhost:{port}" token={token} />`
4. **UI Library calls Frigg directly**: All `/connections`, `/integrations` requests

**No proxy endpoints!** Management UI only starts/stops Frigg and streams logs.