# ADR-007: Management UI Architecture

**Status**: Accepted
**Date**: 2025-12-14
**Deciders**: Frigg Core Team

## Context

Frigg adopters need a development interface to:
1. Manage local Frigg projects during development
2. Connect to running Frigg apps for admin operations
3. Test integrations and manage users/entities

The Management UI must work across different environments:
- Local development (via `frigg ui`)
- Connected to remote Frigg apps (staging/production)
- Standalone for project scaffolding

### Challenges

1. **Security**: Admin API keys shouldn't be exposed to browser
2. **Multi-environment**: Same UI for local and remote apps
3. **State management**: No database for local dev tools (per ADR-002)
4. **DDD compliance**: Follow hexagonal architecture patterns

## Decision

### System Architecture

The Management UI operates as a **separate Express server** that proxies requests to running Frigg apps:

```mermaid
graph TB
    subgraph "Developer Machine"
        subgraph "Management UI (Port 3210)"
            Browser[React SPA]
            MUI_Server[Express Server]

            subgraph "DDD Layers"
                Controllers[Controllers]
                UseCases[Use Cases]
                Adapters[Infrastructure Adapters]
            end
        end

        subgraph "Frigg App (Port 3000)"
            FA_Routers[API Routers]
            FA_Admin[Admin Router]
            FA_Health[Health Router]
        end
    end

    subgraph "External"
        RemoteApp[Remote Frigg App]
    end

    Browser --> MUI_Server
    MUI_Server --> Controllers --> UseCases --> Adapters
    Adapters -->|X-API-Key| FA_Admin
    Adapters -->|X-API-Key| FA_Health
    Adapters -->|X-API-Key| RemoteApp
```

### Connection Flow

```mermaid
sequenceDiagram
    participant Browser as React App
    participant Server as MUI Server
    participant Frigg as Frigg App

    Browser->>Server: POST /api/frigg-app/connect
    Note over Browser,Server: { friggAppUrl, adminApiKey }

    Server->>Frigg: GET /health
    Note over Server,Frigg: X-API-Key: {adminApiKey}
    Frigg-->>Server: { status: "healthy" }

    Server->>Frigg: GET /api/config
    Frigg-->>Server: { user: { config: {...} } }

    Server->>Server: Store connection in memory
    Server->>Server: Detect UserManagementMode

    Server-->>Browser: { success: true, userManagementMode }
```

### Proxy Pattern

The Management UI server acts as a secure proxy:

```mermaid
flowchart LR
    subgraph "Browser (Untrusted)"
        React[React SPA]
    end

    subgraph "MUI Server (Trusted)"
        Proxy[FriggAppHttpAdapter]
        Key[(Admin API Key)]
    end

    subgraph "Frigg App"
        Admin[Admin Router]
    end

    React -->|No API key| Proxy
    Proxy -->|X-API-Key header| Admin
    Key -.->|Injected| Proxy
```

**Why proxy?**
- Admin API key never sent to browser
- Server validates requests before forwarding
- Consistent error handling and logging
- Single point for rate limiting/auditing

### DDD Layer Architecture

```mermaid
graph TB
    subgraph "Presentation Layer"
        Routes[friggAppRoutes.js]
        Controller[FriggAppController.js]
    end

    subgraph "Application Layer"
        UC1[ConnectToFriggAppUseCase]
        UC2[ListGlobalEntitiesUseCase]
        UC3[TestGlobalEntityUseCase]
        UC4[DeleteGlobalEntityUseCase]
    end

    subgraph "Domain Layer"
        VO1[FriggAppConnection]
        VO2[UserManagementMode]
        VO3[AdminApiConfig]
    end

    subgraph "Infrastructure Layer"
        HTTP[FriggAppHttpAdapter]
        Admin[FriggAdminApiAdapter]
        Settings[SettingsRepository]
    end

    Routes --> Controller
    Controller --> UC1 & UC2 & UC3 & UC4
    UC1 --> VO1 & VO2 & VO3
    UC1 & UC2 & UC3 & UC4 --> HTTP & Admin
    UC1 --> Settings
```

### Value Objects

**FriggAppConnection**: Immutable connection state

```javascript
FriggAppConnection.disconnected()
FriggAppConnection.connecting(config)
FriggAppConnection.connected({ config, healthStatus, userManagementMode })
FriggAppConnection.error(config, errorMessage)
```

**UserManagementMode**: Auth configuration from appDefinition

```javascript
UserManagementMode.fromAppDefinition(appDef)
// Detects: friggTokenEnabled, sharedSecretEnabled, adopterJwtEnabled, usePassword
```

**AdminApiConfig**: Connection configuration

```javascript
new AdminApiConfig({ baseUrl, apiKey, timeout })
config.validate()
config.getAuthHeaders()  // { 'X-API-Key': apiKey }
config.getNormalizedBaseUrl()
```

### User Management Modes

Frigg supports multiple authentication strategies. The Management UI detects and displays the active mode:

```mermaid
graph LR
    subgraph "appDefinition.user.config"
        A[authModes array]
    end

    subgraph "Detected Modes"
        F[Frigg Token]
        S[Shared Secret]
        J[Adopter JWT]
    end

    subgraph "UI Display"
        Badge1[Badge: Frigg Token]
        Badge2[Badge: Shared Secret]
        Badge3[Badge: Adopter JWT]
    end

    A --> F & S & J
    F --> Badge1
    S --> Badge2
    J --> Badge3
```

| Mode | Header | Use Case |
|------|--------|----------|
| Frigg Token | `Authorization: Bearer {token}` | Direct user auth |
| Shared Secret | `X-Frigg-AppUserId` | B2B embedded integrations |
| Adopter JWT | Custom JWT validation | White-label deployments |

### API Routes

```
Management UI Server (:3210)
├── /api/projects/*              # Local project management
├── /api/git/*                   # Git operations
├── /api/frigg-app/
│   ├── POST   /connect          # Connect to Frigg app
│   ├── POST   /disconnect       # Disconnect
│   ├── GET    /connection-status
│   ├── GET    /user-management-mode
│   ├── GET    /auth-methods
│   └── /admin/
│       ├── GET    /users
│       ├── POST   /users
│       ├── DELETE /users/:id
│       ├── POST   /users/:id/impersonate
│       ├── GET    /global-entities
│       ├── POST   /global-entities
│       ├── PUT    /global-entities/:id
│       ├── DELETE /global-entities/:id
│       └── POST   /global-entities/:id/test
└── /api/health                  # MUI health check
```

### React Component Architecture

```mermaid
graph TB
    subgraph "Admin View"
        AVC[AdminViewContainer]
        ACP[AdminConnectionPanel]
        GEM[GlobalEntityManagement]
        UM[UserManagement]
    end

    subgraph "Hooks"
        FAC[useFriggAppConnection]
    end

    subgraph "API Client"
        API[api-client.js]
    end

    AVC --> ACP & GEM & UM
    ACP --> FAC
    GEM --> API
    FAC --> API
    API -->|fetch| Server[MUI Server]
```

## Consequences

### Positive

- **Secure**: Admin API key never exposed to browser
- **Flexible**: Works with local and remote Frigg apps
- **DDD compliant**: Clean separation of concerns
- **Testable**: Each layer can be unit tested with mocks
- **Observable**: Connection state visible in UI

### Negative

- **Extra hop**: All admin requests go through MUI server
- **Memory state**: Connection lost on server restart
- **Port conflict**: Needs different port than Frigg app

### Risks Mitigated

- **Credential leakage**: API key stays server-side
- **CORS issues**: Server-to-server has no CORS
- **Mixed environments**: Clear separation of local vs remote

## Related

- [ADR-002: No Database for Local Development Tools](./002-no-database-for-local-dev.md)
- [ADR-003: Runtime State Only for Management GUI](./003-runtime-state-only.md)
- [Management UI Server](/packages/devtools/management-ui/server/)
- [FriggAppHttpAdapter](/packages/devtools/management-ui/server/src/infrastructure/adapters/FriggAppHttpAdapter.js)
