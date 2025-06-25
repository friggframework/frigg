# Phase 1 Development Guide

This guide covers the development workflow for RFC 0001 Phase 1 implementation, including CLI commands, Management UI, and integration testing.

## Overview

Phase 1 implements the core components of the Frigg CLI migration:

- **Enhanced CLI Commands**: `frigg init`, `frigg create`, `frigg ui`
- **Management UI**: React-based web interface for local development
- **CLI-GUI Communication**: Express API + WebSocket integration
- **Integration Testing**: Comprehensive test suite for all components

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Git (recommended)

### Setup Development Environment

```bash
# Install dependencies
npm install

# Setup development environment
node packages/devtools/scripts/dev-setup.js

# Start development servers
node packages/devtools/scripts/dev-workflow.js start --watch --test
```

## Architecture

### Directory Structure

```
packages/devtools/
├── frigg-cli/              # Enhanced CLI commands
│   ├── index.js           # Main CLI entry point
│   ├── init-command/      # frigg init implementation
│   ├── create-command/    # frigg create implementation
│   ├── ui-command/        # frigg ui implementation
│   └── templates/         # Project templates
├── management-ui/         # React + Vite GUI
│   ├── src/              # React components
│   ├── server/           # Express API server
│   └── vite.config.js    # Vite configuration
├── integration-tests/     # End-to-end tests
│   ├── cli-gui-integration.test.js
│   ├── performance.test.js
│   └── rfc-validation.test.js
└── scripts/              # Development workflow scripts
    ├── dev-setup.js
    └── dev-workflow.js
```

### Communication Flow

```
CLI Commands ←→ Express API ←→ Management UI
     ↓              ↓              ↓
  File System   WebSocket    React Components
     ↓          Real-time         ↓
Project Files   Updates     User Interface
```

## Development Workflow

### Starting Development

```bash
# Start all servers with file watching
npm run dev:start

# Start specific components
npm run dev:ui          # Management UI only
npm run dev:api         # API server only
npm run dev:tests       # Test watcher only
```

### Available Services

- **Management UI**: http://localhost:5173 (Vite dev server)
- **API Server**: http://localhost:3001 (Express + Socket.IO)
- **Test Runner**: Automatic on file changes

### Testing

```bash
# Run all integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Run RFC validation tests
npm run test:rfc

# Run tests in watch mode
npm run test:watch
```

### Building

```bash
# Development build
npm run build:dev

# Production build
npm run build:prod

# Build specific components
npm run build:ui
npm run build:cli
```

## Component Development

### CLI Commands

Located in `packages/devtools/frigg-cli/`

#### Adding New Commands

1. Create command directory: `new-command/index.js`
2. Implement command logic
3. Register in main `index.js`
4. Add tests in `integration-tests/`

Example command structure:

```javascript
// new-command/index.js
async function newCommand(options) {
  // Command implementation
}

module.exports = { newCommand };
```

```javascript
// index.js
const { newCommand } = require('./new-command');

program
  .command('new')
  .description('New command description')
  .action(newCommand);
```

#### Testing CLI Commands

```javascript
// In integration tests
test('new command works', async () => {
  const result = await runCLICommand(['new', '--option']);
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('expected output');
});
```

### Management UI

Located in `packages/devtools/management-ui/`

#### Frontend Development

React components in `src/`:

- `App.jsx` - Main application
- `components/` - Reusable components  
- `pages/` - Page components
- `services/` - API clients
- `hooks/` - Custom React hooks

#### Backend API

Express server in `server/`:

- `index.js` - Main server
- `api/` - API route handlers
- `middleware/` - Express middleware
- `websocket/` - Socket.IO handlers

#### Adding New API Endpoints

1. Create route handler in `server/api/`
2. Register route in `server/index.js`
3. Add WebSocket events if needed
4. Create frontend service client
5. Add integration tests

Example API endpoint:

```javascript
// server/api/new-feature.js
app.get('/api/new-feature', (req, res) => {
  res.json({ data: 'response' });
});

app.post('/api/new-feature', (req, res) => {
  // Handle POST request
  io.emit('new-feature:update', { data: req.body });
  res.json({ success: true });
});
```

#### Adding New UI Components

```jsx
// src/components/NewComponent.jsx
import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

export function NewComponent() {
  const [data, setData] = useState([]);
  const socket = useSocket();

  useEffect(() => {
    socket.on('new-feature:update', setData);
    return () => socket.off('new-feature:update');
  }, [socket]);

  return (
    <div>
      {/* Component UI */}
    </div>
  );
}
```

### Integration Testing

Located in `packages/devtools/integration-tests/`

#### Test Structure

- `cli-gui-integration.test.js` - End-to-end CLI-GUI communication
- `performance.test.js` - Performance and load testing
- `rfc-validation.test.js` - RFC 0001 requirements validation

#### Writing Integration Tests

```javascript
describe('New Feature Integration', () => {
  let uiServer = null;
  
  beforeAll(async () => {
    // Start test servers
    uiServer = await startTestServer();
  });
  
  afterAll(async () => {
    // Clean up
    if (uiServer) uiServer.kill();
  });
  
  test('feature works end-to-end', async () => {
    // Test CLI command
    const cliResult = await runCLICommand(['new-feature']);
    expect(cliResult.code).toBe(0);
    
    // Test API endpoint
    const apiResponse = await axios.get('http://localhost:3001/api/new-feature');
    expect(apiResponse.status).toBe(200);
    
    // Test WebSocket communication
    const socketClient = io('http://localhost:3001');
    await new Promise(resolve => {
      socketClient.on('new-feature:update', (data) => {
        expect(data).toHaveProperty('expected');
        resolve();
      });
      // Trigger update
      axios.post('http://localhost:3001/api/new-feature', { test: true });
    });
  });
});
```

## Performance Requirements

Phase 1 must meet RFC 0001 performance targets:

- **GUI Load Time**: < 2 seconds
- **Project Initialization**: < 30 seconds  
- **API Response Time**: < 1 second
- **Memory Usage**: < 100MB for development

### Performance Testing

```bash
# Run performance test suite
npm run test:performance

# Run specific performance tests
npm test -- --testNamePattern="Load Testing"
```

### Performance Monitoring

```javascript
// Built-in performance tracking
const startTime = Date.now();
// ... operation ...
const duration = Date.now() - startTime;
console.log(`Operation took: ${duration}ms`);
```

## RFC 0001 Validation

### Requirements Checklist

Run RFC validation tests to ensure all Phase 1 requirements are met:

```bash
npm run test:rfc
```

The test suite validates:

- ✅ Enhanced CLI Commands
- ✅ Local Management GUI  
- ✅ CLI-GUI Communication
- ✅ Technical Architecture
- ✅ Performance Requirements

### Manual Validation

```bash
# Test CLI commands
node packages/devtools/frigg-cli/index.js init test-project
node packages/devtools/frigg-cli/index.js ui

# Test Management UI
# Navigate to http://localhost:3001
# - Start/Stop Frigg controls
# - Integration installation
# - Environment variable editing
# - User management
# - Connection management
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Check what's using ports
lsof -i :3001
lsof -i :5173

# Kill processes
kill -9 <PID>
```

#### UI Not Loading

1. Check if Vite dev server is running
2. Verify API server is responding
3. Check browser console for errors
4. Verify WebSocket connection

#### CLI Commands Failing

1. Check Node.js version (18+ required)
2. Verify npm dependencies installed
3. Check file permissions
4. Review error logs

#### Tests Failing

1. Ensure all servers are stopped before running tests
2. Check for port conflicts
3. Verify test database/state is clean
4. Review test logs for specific failures

### Debugging

#### Enable Debug Logging

```bash
export DEBUG=frigg:*
export LOG_LEVEL=debug
npm run dev:start
```

#### View Development Logs

```bash
# Show all logs
npm run dev:logs

# Follow specific component logs
npm run dev:logs --follow --component=ui
npm run dev:logs --follow --component=api
npm run dev:logs --follow --component=tests
```

#### Test Debugging

```bash
# Run tests with verbose output
VERBOSE_TESTS=true npm run test:integration

# Run specific test
npm test -- --testNamePattern="specific test name"

# Debug test in watch mode
npm run test:watch
```

## Contributing

### Code Style

- ESLint + Prettier for formatting
- Conventional commits for commit messages
- Jest for testing
- JSDoc for documentation

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run full test suite: `npm run test:all`
4. Run RFC validation: `npm run test:rfc`
5. Create pull request with description
6. Ensure CI passes

### Development Scripts

```bash
# Setup development environment
npm run dev:setup

# Start development servers
npm run dev:start

# Stop development servers  
npm run dev:stop

# Run all tests
npm run test:all

# Build all components
npm run build:all

# Lint and format code
npm run lint:fix

# Show development status
npm run dev:status
```

## Resources

- [RFC 0001: Frigg CLI Migration](../../rfcs/0001-frigg-cli-migration.md)
- [Architecture Decisions](../architecture-decisions/)
- [API Reference](../reference/management-gui-api.md)
- [Contributing Guide](../contributing/README.md)

## Support

For development support:

- Check [FAQ](../support/frequently-asked-questions.md)
- Review [existing issues](https://github.com/friggframework/frigg/issues)
- Join [Slack channel](../support/chat-with-us/join-slack-channel.md)