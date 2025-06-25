# RFC: Frigg CLI Migration - Consolidating create-frigg-app

**RFC Number**: 0001  
**Title**: Consolidate create-frigg-app into Frigg CLI with Local Management GUI  
**Status**: In Progress (Phase 2 Complete)  
**Created**: 2025-01-25  
**Author**: Sean @ Frigg  
**Last Updated**: 2025-01-25

## Summary

This RFC proposes migrating the standalone `create-frigg-app` npm package into the main Frigg CLI as `frigg init` and `frigg create` commands, while introducing a local management GUI accessible via `frigg ui`. This consolidation will clarify Frigg's positioning as a backend service framework and enhance the developer experience with visual development tools.

## Motivation

Currently, developers use `npx create-frigg-app` to scaffold new Frigg applications. This separation creates several issues:

1. **Confusion about Frigg's purpose**: The frontend directory in templates has led to misunderstandings about Frigg being a full-stack framework
2. **Fragmented tooling**: Developers must use multiple tools for the complete Frigg experience
3. **Limited local development capabilities**: No visual tools for testing integrations locally
4. **Maintenance overhead**: Separate repositories and release cycles

## Detailed Design

### Enhanced CLI Commands

```bash
# New commands
frigg init [project-name]     # Initialize new Frigg project (replaces create-frigg-app)
frigg create [integration]    # Create new integration module
frigg ui                      # Launch local management GUI
frigg manage                  # Project and integration management
frigg monitor [instance]      # Monitor production instances

# Enhanced existing commands
frigg install                 # Interactive module selection
frigg start                   # With GUI integration
frigg build                   # Multi-environment support
frigg deploy                  # Enhanced validation
```

### Local Management GUI

A web-based development interface launched via `frigg ui`:

```
┌─────────────────────────────────────────────────────┐
│ Frigg Management UI                                 │
├─────────────────────────────────────────────────────┤
│ [▶️ Start Frigg] [⏹️ Stop Frigg] ● Running         │
├─────────────────────────────────────────────────────┤
│ Environment: [Local ▼] [Staging] [Production]      │
├─────────────────────────────────────────────────────┤
│ • Integration Discovery & Installation              │
│ • Dummy User Management (test IDs)                  │
│ • Connection/Entity Management                      │
│ • Environment Variable Editor                       │
│ • Local Testing Interface                           │
│ • Production Monitoring Dashboard                   │
│ • Code Generation (GUI → CLI → Code)              │
└─────────────────────────────────────────────────────┘
```

### Technical Architecture

#### Technology Stack
- **CLI**: Enhanced Commander.js commands
- **Management GUI**: Vite + React (leveraging @friggframework/ui)
- **Communication**: Express API server + WebSocket
- **Storage**: Runtime state only (no database needed)

#### Directory Structure
```
packages/
├── devtools/
│   ├── frigg-cli/          # Enhanced CLI
│   └── management-ui/      # Vite + React app
│       ├── src/
│       ├── server/         # Express API
│       └── vite.config.js
├── ui/                     # Existing UI components
├── ui-core/               # New framework-agnostic core
├── ui-vue/                # New Vue bindings
└── ui-svelte/             # New Svelte bindings
```

### Multi-Framework UI Support

Extract framework-agnostic logic and create bindings:

```javascript
// Core package
@friggframework/ui-core

// Framework-specific packages
@friggframework/ui-react    // Enhanced existing
@friggframework/ui-vue      // New
@friggframework/ui-svelte   // New
@friggframework/ui-angular  // New
```

### Environment Management

Visual ENV editor in the GUI:

```javascript
// Local: Write to .env file
fs.writeFileSync('.env', formatEnvFile(envVars));

// Production: Update via AWS Parameter Store
await updateAWSParameters(envVars);
```

## Implementation Plan

### Phase 1: Foundation (Weeks 1-4) ✅ COMPLETE
- [x] Add `frigg init` and `frigg create` commands
- [x] Create management UI scaffold with Vite + React
- [x] Implement CLI-GUI communication layer
- [x] Basic start/stop Frigg controls

### Phase 2: Core Features (Weeks 5-8) ✅ COMPLETE
- [x] Integration discovery and installation UI
- [x] Dummy user management system
- [x] Connection/entity management interface
- [x] Environment variable editor

### Phase 3: Advanced Features (Weeks 9-12)
- [ ] Production monitoring dashboard
- [ ] Code generation via GUI
- [ ] Extract ui-core package
- [ ] Begin Vue.js bindings

### Phase 4: Multi-Framework (Weeks 13-16)
- [ ] Complete Vue.js package
- [ ] Develop Svelte package
- [ ] Create Angular package
- [ ] Framework-specific templates

### Phase 5: Migration & Launch (Weeks 17-20)
- [ ] Migration tooling from create-frigg-app
- [ ] Documentation and guides
- [ ] Community rollout
- [ ] Deprecate create-frigg-app

## Migration Strategy

### For Existing Users
```bash
# Before
npx create-frigg-app my-app

# After (with migration)
frigg init my-app
frigg migrate --from-create-frigg-app
```

### Backward Compatibility
- Maintain create-frigg-app for 6 months with deprecation notices
- Automated migration tool for existing projects
- Clear documentation and video tutorials

## Success Metrics

- **Developer Adoption**: 90% migration within 6 months
- **Setup Time**: 50% reduction in time to first integration
- **Support Tickets**: 50% reduction in confusion-related issues
- **Performance**: <2s GUI load time, <30s project initialization
- **Test Coverage**: 90% unit tests, 80% integration tests

## Alternatives Considered

1. **Keep create-frigg-app separate**: Rejected due to maintenance overhead and confusion
2. **Electron-based GUI**: Rejected in favor of lighter web-based approach
3. **No GUI, CLI only**: Rejected as visual tools significantly improve DX
4. **Database for local state**: Rejected as unnecessary complexity

## Security Considerations

- Local development only (no external network calls)
- Read-only filesystem access for static analysis
- Environment variables properly masked in UI
- Production updates require explicit confirmation

## Open Questions

1. Should we support importing existing integrations from npm?
2. How deep should the production monitoring capabilities go?
3. Should the GUI support team collaboration features?

## References

- Current create-frigg-app: https://github.com/friggframework/create-frigg-app
- Frigg CLI source: packages/devtools/frigg-cli
- UI components: packages/ui