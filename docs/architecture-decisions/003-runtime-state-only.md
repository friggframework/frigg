# ADR-003: Runtime State Only for Management GUI

**Status**: Accepted  
**Date**: 2025-01-25  
**Deciders**: Sean, Frigg Team  

## Context

When designing the Frigg management GUI's security model, we initially considered:
- JWT authentication
- Encrypted credential storage
- Session management
- Complex CORS policies

We needed to determine the appropriate security level for a local development tool.

## Decision

The Frigg management GUI will use a **minimal security model** appropriate for local development:

- **No authentication**: It's a local dev tool
- **No credential storage**: Everything in memory
- **No encryption**: Local-only communication
- **Simple CORS**: localhost only
- **Read-only file access**: Only read project files

## Consequences

### Positive
- **Developer friendly**: No login or setup required
- **Fast iteration**: No auth overhead
- **Simple codebase**: No security complexity
- **Clear purpose**: Obviously a dev tool, not production
- **No secrets risk**: Nothing sensitive stored

### Negative
- **Local only**: Cannot be exposed to network
- **No multi-user**: Single developer tool only
- **No audit trail**: No tracking of who did what

### Neutral
- Developers understand it's a local tool
- Security matches the use case
- Cannot be accidentally deployed to production

## Implementation Example

```javascript
// Simple security configuration
const security = {
  cors: {
    origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: false
  },
  
  // No auth middleware
  auth: null,
  
  // Only allow local connections
  validateRequest: (req) => {
    const host = req.headers.host;
    return host.startsWith('localhost') || host.startsWith('127.0.0.1');
  },
  
  // File access restrictions
  fileAccess: {
    mode: 'read-only',
    allowedPaths: [process.cwd()] // Current project only
  }
};
```

## Alternatives Considered

### Full Authentication System
- **Rejected**: Massive overkill for local dev tool
- Would slow down developer workflow
- No actual security benefit locally

### Basic Auth
- **Rejected**: Still unnecessary friction
- Password would likely be shared anyway
- False sense of security

### Token-Based Auth
- **Rejected**: Complexity without benefit
- Where would tokens be stored?
- Who issues the tokens?

## Guidelines

1. **Never expose to network**: Always bind to localhost
2. **Clear warnings**: If someone tries to access remotely
3. **No production data**: Should never touch real user data
4. **Obvious naming**: "Local Development GUI" in all UI