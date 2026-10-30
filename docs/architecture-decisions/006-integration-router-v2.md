# ADR-006: Integration Router v2 Restructuring

**Status**: Accepted
**Date**: 2025-12-14
**Deciders**: Frigg Core Team

## Context

The Integration Router is the primary API surface for Frigg adopters and their end-users. The v1 API evolved organically with several pain points:

1. **Modules Router Confusion**: `/api/modules/*` endpoints duplicated entity functionality and confused integrators about which to use
2. **Inconsistent Naming**: Mix of singular (`/api/entity`) and plural (`/api/integrations`) endpoints
3. **Missing Capabilities**: No credential management, no proxy endpoints for MCP/tool-calling use cases
4. **No API Documentation**: Required external documentation, no self-describing API

### Current Route Map (v1)

```
/api/integrations          - CRUD operations
/api/modules/*             - DEPRECATED (duplicated entity logic)
/api/entity                - Singular (inconsistent)
/api/authorize             - OAuth flows
```

## Decision

### Route Restructuring

Consolidate and modernize the API surface:

```mermaid
graph TB
    subgraph "v2 Router Structure"
        subgraph "Integrations"
            I1[GET /api/v2/integrations]
            I2[GET /api/v2/integrations/options]
            I3[POST /api/v2/integrations]
            I4[PATCH /api/v2/integrations/:id]
            I5[DELETE /api/v2/integrations/:id]
        end

        subgraph "Entities (Accounts)"
            E1[GET /api/entities]
            E2[POST /api/entities]
            E3[GET /api/entities/:id]
            E4[DELETE /api/entities/:id]
            E5[GET /api/entities/types]
            E6[GET /api/entities/types/:type]
            E7[GET /api/entities/types/:type/requirements]
            E8[POST /api/entities/:id/proxy]
        end

        subgraph "Credentials"
            C1[GET /api/credentials]
            C2[DELETE /api/credentials/:id]
            C3[GET /api/credentials/:id/reauthorize]
            C4[POST /api/credentials/:id/reauthorize]
            C5[POST /api/credentials/:id/proxy]
        end

        subgraph "Authorization"
            A1[GET /api/authorize]
            A2[POST /api/authorize]
            A3[GET /api/authorize/:sessionId]
            A4[POST /api/authorize/:sessionId/step]
        end

        subgraph "Documentation"
            D1[GET /api/docs]
            D2[GET /api/openapi.json]
            D3[GET /api/v1/docs]
            D4[GET /api/v2/docs]
        end
    end
```

### Key Changes

| Change | Before (v1) | After (v2) | Rationale |
|--------|-------------|------------|-----------|
| Modules Router | `/api/modules/*` | **REMOVED** | Duplicated entity functionality |
| Entity Naming | `/api/entity` (singular) | `/api/entities` (plural) | REST conventions |
| Credentials | None | `/api/credentials/*` | Explicit credential management |
| Proxy Endpoints | None | `/api/entities/:id/proxy` | MCP/tool-calling support |
| Reauthorize | Manual | `/api/credentials/:id/reauthorize` | Self-service credential refresh |
| API Docs | External | `/api/docs` (Scalar UI) | Self-describing API |

### Authentication Architecture

```mermaid
flowchart LR
    subgraph "Request"
        R[HTTP Request]
    end

    subgraph "Auth Methods"
        B[Bearer Token]
        X[X-API-Key]
        H[X-Frigg Headers]
        J[Adopter JWT]
    end

    subgraph "Middleware"
        LU[loadUser]
        RLI[requireLoggedInUser]
        RA[requireAdmin]
    end

    subgraph "Routes"
        USER[User Routes]
        ADMIN[Admin Routes]
        PUBLIC[Public Routes]
    end

    R --> B --> LU --> RLI --> USER
    R --> X --> RA --> ADMIN
    R --> H --> LU --> RLI --> USER
    R --> J --> LU --> RLI --> USER
    R --> PUBLIC
```

### Proxy Endpoint Flow

New proxy endpoints enable MCP (Model Context Protocol) and tool-calling use cases:

```mermaid
sequenceDiagram
    participant Client as AI Agent/Tool
    participant Frigg as Frigg Router
    participant Cred as Credential Store
    participant API as External API

    Client->>Frigg: POST /api/entities/:id/proxy
    Note over Client,Frigg: { method: "GET", path: "/contacts", query: {...} }

    Frigg->>Cred: Get credential for entity
    Cred-->>Frigg: OAuth tokens

    Frigg->>API: GET /contacts (with auth)
    API-->>Frigg: { data: [...] }

    Frigg-->>Client: { success: true, status: 200, data: [...] }
```

### Authorization Flow (Multi-Step)

```mermaid
sequenceDiagram
    participant User
    participant App as Frigg App
    participant OAuth as OAuth Provider

    User->>App: GET /api/entities/types/hubspot/requirements
    App-->>User: { step: 1, fields: [], redirectUrl: "..." }

    User->>OAuth: Redirect to OAuth
    OAuth-->>User: Authorization code

    User->>App: POST /api/authorize
    Note over User,App: { entityType: "hubspot", data: { code: "xyz" } }

    App->>OAuth: Exchange code for tokens
    OAuth-->>App: Access + Refresh tokens

    App-->>User: { credential_id, entity_id }
```

### OpenAPI Documentation

Self-describing API with version-specific documentation:

```
GET /api/docs          → Scalar UI with version selector
GET /api/v1/docs       → v1 API documentation
GET /api/v2/docs       → v2 API documentation
GET /api/openapi.json  → Default (v2) OpenAPI spec
```

## Consequences

### Positive

- **Cleaner API surface**: Removes confusion between modules and entities
- **REST conventions**: Plural endpoints, consistent naming
- **Self-documenting**: OpenAPI specs with interactive Scalar UI
- **MCP-ready**: Proxy endpoints enable AI agent integration
- **Credential lifecycle**: Explicit management and re-authorization
- **Backward compatible**: v1 routes preserved during migration

### Negative

- **Migration effort**: Existing integrations need to update endpoints
- **Documentation updates**: All guides need endpoint updates
- **Testing burden**: Both v1 and v2 need test coverage

### Neutral

- v1 endpoints remain functional (no breaking changes)
- New features only available on v2 endpoints

## Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Remove modules router, consolidate entities | ✅ |
| 2 | Add credentials router with proxy | ✅ |
| 3 | OpenAPI specs and Scalar UI | ✅ |
| 4 | Management UI updates | ✅ |
| 5 | @friggframework/ui updates | Pending |

## Related

- [Integration Router Implementation](/packages/core/integrations/integration-router.js)
- [API Router v2 Spec](/docs/specs/api-router-v2-restructuring.md)
- [OpenAPI Specs](/packages/core/handlers/routers/openapi/)
