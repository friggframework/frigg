# ADR-001: Use Vite + React for Management UI

**Status**: Accepted  
**Date**: 2025-01-25  
**Deciders**: Sean, Frigg Team  

## Context

The Frigg CLI migration project requires a local management GUI for developers to:
- Visually manage integrations
- Test integrations locally
- Manage environment variables
- Monitor local and production instances

We needed to decide on the technology stack for this GUI component.

## Decision

We will use **Vite + React** for the Frigg management UI, served as a web application at `http://localhost:3001` when running `frigg ui`.

Key implementation details:
- Vite as the build tool and dev server
- React for the UI framework
- Leverage existing `@friggframework/ui` components
- Express.js API server for CLI communication
- No Electron or desktop application wrapper

## Consequences

### Positive
- **Consistency**: Aligns with existing `@friggframework/ui` which already uses Vite + React
- **Lightweight**: No Electron overhead, faster startup times
- **Familiar**: Team already knows the stack
- **Web-native**: Accessible from any browser, easier to debug
- **Fast development**: Vite's HMR provides instant feedback
- **Reusability**: Can reuse all existing UI components

### Negative
- **No offline access**: Requires running local server
- **No native OS integration**: Can't access system tray, native menus, etc.
- **Browser limitations**: Subject to browser security restrictions

### Neutral
- Developers access the GUI via browser instead of standalone app
- Requires keeping a browser tab open during development
- Standard web security model applies

## Alternatives Considered

### Electron + React
- **Rejected**: Adds complexity and overhead for minimal benefit
- Would require packaging, code signing, and distribution
- Heavier resource usage

### Next.js
- **Rejected**: SSR capabilities not needed for local dev tool
- More complex setup than Vite
- Heavier framework for our use case

### Pure CLI (no GUI)
- **Rejected**: Visual tools significantly improve developer experience
- Integration management benefits from visual interface
- ENV management much easier with GUI

### Native Desktop App
- **Rejected**: Cross-platform complexity
- Longer development time
- Maintenance overhead for multiple platforms