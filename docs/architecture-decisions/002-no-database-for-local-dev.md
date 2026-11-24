# ADR-002: No Database for Local Development Tools

**Status**: Accepted  
**Date**: 2025-01-25  
**Deciders**: Sean, Frigg Team  

## Context

Initial designs for the Frigg management GUI included SQLite for storing:
- User preferences
- Test user configurations
- Integration settings
- Development history

We needed to decide whether persistent storage was necessary for a local development tool.

## Decision

The Frigg management GUI will **NOT use any database** or persistent storage. All state will be:
- Runtime memory only
- Read from project files (package.json, .env, etc.)
- Lost on browser refresh (by design)

## Consequences

### Positive
- **Simplicity**: No database setup, migrations, or corruption issues
- **Faster startup**: No database initialization
- **Clean slate**: Each session starts fresh (good for testing)
- **No state bugs**: Can't get into weird persistent states
- **Lighter footprint**: No SQLite files or data directories
- **Privacy**: No user data stored locally

### Negative
- **No persistence**: Users must re-enter test data each session
- **No history**: Can't track previous test runs
- **No preferences**: Can't save UI preferences

### Neutral
- Browser refresh = fresh start
- Test data entered each session
- Settings read from project files each time

## Alternatives Considered

### SQLite Database
- **Rejected**: Overkill for temporary development data
- Adds complexity for minimal benefit
- Risk of database corruption

### Browser LocalStorage
- **Rejected**: Still adds persistence complexity
- Can cause confusion if stale data remains
- Storage limits and cross-origin issues

### JSON File Storage
- **Rejected**: File I/O complexity
- Synchronization issues
- Where to store the files?

## Implementation Notes

```javascript
// Everything in memory
const state = {
  testUser: null,        // Set via form
  selectedIntegrations: [], // Runtime selection
  envVars: readEnvFile(),  // Read fresh each time
  friggStatus: 'stopped'   // Runtime only
};

// On browser refresh: everything resets
```