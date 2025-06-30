# @friggframework/ui-core

Framework-agnostic UI core utilities and business logic for the Frigg integration platform. This package provides the foundation for building UI components across different frameworks (React, Vue, Svelte, Angular).

## Overview

`@friggframework/ui-core` extracts the business logic, state management, and utility functions from the React-specific `@friggframework/ui` package, enabling multi-framework support through a plugin system.

## Features

- **Framework Agnostic**: Pure JavaScript/TypeScript with no framework dependencies
- **Plugin System**: Extensible architecture for framework-specific bindings
- **State Management**: Toast notifications, data models, and service state
- **API Clients**: HTTP clients for Frigg platform services
- **Utilities**: Common helper functions and integration utilities
- **Services**: Business logic for monitoring, alerts, and CloudWatch
- **TypeScript Support**: Full type definitions included

## Installation

```bash
npm install @friggframework/ui-core
```

## Quick Start

```javascript
import { createFriggUICore } from '@friggframework/ui-core';

// Create core instance
const core = createFriggUICore({
  api: {
    baseURL: 'https://api.frigg.dev',
    authTokenSource: () => localStorage.getItem('token')
  }
});

// Use toast notifications
core.getToastManager().toast({
  title: 'Success',
  description: 'Integration connected successfully'
});

// Use API services
const integrations = await core.getApiService().get('/integrations');
```

## Architecture

### Modules

- **`api/`** - HTTP clients and API services
- **`state/`** - State management (toasts, etc.)
- **`utils/`** - Utility functions and helpers
- **`models/`** - Data models and managers
- **`services/`** - Business logic services
- **`plugins/`** - Framework binding system

### Plugin System

The plugin system allows binding core functionality to different UI frameworks:

```javascript
import { FrameworkPlugin, HOOKS, COMPONENTS } from '@friggframework/ui-core';

// Create React plugin
const reactPlugin = new FrameworkPlugin('react', '1.0.0');

// Register React-specific implementations
reactPlugin.registerHook(HOOKS.STATE_MANAGER, useReactState);
reactPlugin.registerComponent(COMPONENTS.TOAST, ReactToast);

// Install plugin
core.registerPlugin(reactPlugin);
core.activateFramework('react');
```

## API Reference

### FriggUICore

Main core class that provides access to all functionality:

```javascript
const core = createFriggUICore(config);

// Plugin management
core.registerPlugin(plugin);
core.activateFramework('react');

// Service access
core.getToastManager();
core.getApiService();
core.getCloudWatchService();
core.getAlertsService();

// Framework-specific access
core.getComponent('Toast');
core.getAdapter('state');
core.callHook('stateManager', initialState);
```

### Toast Manager

Framework-agnostic toast notification system:

```javascript
import { toastManager } from '@friggframework/ui-core';

// Show toast
const toast = toastManager.toast({
  title: 'Success',
  description: 'Operation completed',
  variant: 'success'
});

// Subscribe to toast changes
const unsubscribe = toastManager.subscribe(state => {
  console.log('Toast state:', state);
});

// Dismiss toast
toast.dismiss();
```

### API Client

HTTP client for Frigg platform APIs:

```javascript
import { ApiClient } from '@friggframework/ui-core';

const client = new ApiClient('https://api.frigg.dev', 'jwt-token');

// Authentication
await client.login(username, password);
await client.createUser(username, password);

// Integrations
const integrations = await client.listIntegrations();
await client.createIntegration(entity1, entity2, config);
await client.updateIntegration(id, config);
await client.deleteIntegration(id);
```

### Integration Utilities

Helper functions for integration management:

```javascript
import { 
  getActiveAndPossibleIntegrationsCombined,
  isIntegrationConnected,
  filterIntegrationsByStatus,
  groupIntegrationsByType
} from '@friggframework/ui-core';

const combined = getActiveAndPossibleIntegrationsCombined(data);
const connected = filterIntegrationsByStatus(integrations, 'connected');
const grouped = groupIntegrationsByType(integrations);
```

### Common Utilities

General-purpose utility functions:

```javascript
import { 
  mergeClassNames, 
  debounce, 
  throttle, 
  deepClone,
  parseTimeRange,
  formatRelativeTime
} from '@friggframework/ui-core';

const className = mergeClassNames('base-class', { 'active': isActive });
const debouncedFn = debounce(callback, 300);
const { start, end } = parseTimeRange('1h');
```

### Services

Business logic services for monitoring and alerts:

```javascript
import { CloudWatchService, AlertsService } from '@friggframework/ui-core';

// CloudWatch metrics
const cloudWatch = new CloudWatchService(apiService);
const metrics = await cloudWatch.getMetrics({
  integrationId: 'int-123',
  startTime: new Date(Date.now() - 3600000),
  endTime: new Date()
});

// Alerts management
const alerts = new AlertsService(apiService);
const alertList = await alerts.getAlerts('int-123');
await alerts.acknowledgeAlert('alert-123', 'user-456');
```

## Framework Bindings

### React

```bash
npm install @friggframework/ui-react
```

```javascript
import { FriggProvider, useToast } from '@friggframework/ui-react';

function App() {
  return (
    <FriggProvider config={{ api: { baseURL: '/api' } }}>
      <MyComponent />
    </FriggProvider>
  );
}

function MyComponent() {
  const { toast } = useToast();
  
  const handleClick = () => {
    toast({ title: 'Success!' });
  };
  
  return <button onClick={handleClick}>Show Toast</button>;
}
```

### Vue (Coming Soon)

```bash
npm install @friggframework/ui-vue
```

### Angular (Coming Soon)

```bash
npm install @friggframework/ui-angular
```

## Development

```bash
# Install dependencies
npm install

# Build package
npm run build

# Run tests
npm test

# Development build
npm run dev
```

## Configuration

```javascript
const config = {
  api: {
    baseURL: 'https://api.frigg.dev',
    wsURL: 'wss://ws.frigg.dev',
    authTokenSource: () => localStorage.getItem('authToken')
  }
};
```

## License

MIT

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.