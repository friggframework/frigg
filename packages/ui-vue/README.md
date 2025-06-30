# @friggframework/ui-vue

Vue.js bindings for the Frigg Framework UI Core package, providing seamless integration of Frigg platform functionality into Vue.js applications.

## Installation

```bash
npm install @friggframework/ui-vue @friggframework/ui-core vue
```

## Quick Start

### 1. Install the Vue Plugin

```javascript
// main.js
import { createApp } from 'vue';
import { createFriggUICore } from '@friggframework/ui-core';
import FriggUIVue from '@friggframework/ui-vue';
import App from './App.vue';

const app = createApp(App);

// Create and configure ui-core instance
const friggCore = createFriggUICore({
  api: {
    baseUrl: 'http://localhost:3000',
    jwt: 'your-jwt-token'
  }
});

// Install Vue plugin with core instance
app.use(FriggUIVue, { core: friggCore });

app.mount('#app');
```

### 2. Use Composables in Your Components

```vue
<template>
  <div>
    <button @click="showSuccess">Show Success Toast</button>
    <button @click="loadIntegrations">Load Integrations</button>
    
    <div v-if="loading">Loading...</div>
    <div v-if="integrations.length">
      Found {{ integrations.length }} integrations
    </div>
  </div>
</template>

<script>
import { useToast, useApiClient } from '@friggframework/ui-vue';

export default {
  setup() {
    const { success } = useToast();
    const { listIntegrations, loading } = useApiClient();
    const integrations = ref([]);

    const showSuccess = () => {
      success('Operation completed successfully!');
    };

    const loadIntegrations = async () => {
      try {
        const result = await listIntegrations();
        integrations.value = result.integrations || [];
      } catch (error) {
        console.error('Failed to load integrations:', error);
      }
    };

    return {
      showSuccess,
      loadIntegrations,
      loading,
      integrations
    };
  }
};
</script>
```

## Available Composables

### useToast()

Provides toast notification functionality using ui-core's ToastManager.

```javascript
import { useToast } from '@friggframework/ui-vue';

const {
  toasts,        // Reactive array of current toasts
  toast,         // Generic toast function
  success,       // Success toast shorthand
  error,         // Error toast shorthand
  warning,       // Warning toast shorthand
  info,          // Info toast shorthand
  dismiss,       // Dismiss specific toast
  dismissAll,    // Dismiss all toasts
  clear          // Clear all toasts
} = useToast();

// Usage examples
success('Data saved successfully!');
error('Failed to save data');
warning('This action cannot be undone');
info('Processing will take a few minutes');

// Custom toast
toast({
  title: 'Custom Toast',
  description: 'This is a custom message',
  variant: 'default',
  duration: 5000
});
```

### useApiClient(config?)

Provides access to Frigg API functionality with loading states and error handling.

```javascript
import { useApiClient } from '@friggframework/ui-vue';

const {
  // State
  loading,       // Reactive loading state
  error,         // Reactive error state
  hasError,      // Computed boolean for error presence

  // Authentication
  login,
  createUser,

  // Integrations
  listIntegrations,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  getAuthorizeRequirements,
  authorize,
  getSampleData,
  getUserActions,
  submitUserAction,

  // Utilities
  clearError
} = useApiClient({
  baseUrl: 'https://api.frigg.dev',
  jwt: 'your-token'
});

// Usage
const integrations = await listIntegrations();
const auth = await login('username', 'password');
```

### useAlerts(integrationId?)

Manages alerts and notifications for integrations.

```javascript
import { useAlerts } from '@friggframework/ui-vue';

const {
  // State
  alerts,          // Reactive array of alerts
  loading,         // Loading state
  error,           // Error state
  activeAlerts,    // Computed active alerts
  criticalAlerts,  // Computed critical alerts

  // Actions
  fetchAlerts,
  acknowledgeAlert,
  resolveAlert,
  createAlert,
  updateAlert,
  deleteAlert,

  // Utilities
  filterBySeverity,
  filterByStatus,
  groupBySeverity,
  sortByTimestamp,

  // Constants
  SEVERITY,        // Alert severity levels
  STATUS           // Alert status types
} = useAlerts('integration-id');

// Usage
await acknowledgeAlert(alert.id, 'user-id');
await resolveAlert(alert.id, 'user-id', 'Fixed the issue');
const critical = filterBySeverity(SEVERITY.CRITICAL);
```

### useCloudWatch()

Access CloudWatch monitoring functionality.

```javascript
import { useCloudWatch } from '@friggframework/ui-vue';

const {
  // State
  metrics,         // Reactive metrics data
  logs,           // Reactive logs data
  loading,        // Loading state
  error,          // Error state

  // Actions
  fetchMetrics,
  fetchLogs,
  getMetricData,
  putMetric,
  getDeploymentStatus,
  streamLogs
} = useCloudWatch();

// Usage
await fetchMetrics({ region: 'us-east-1' });
const cpuMetrics = await getMetricData('CPUUtilization');
```

### useFriggCore(config?)

Direct access to the ui-core instance and its configuration.

```javascript
import { useFriggCore } from '@friggframework/ui-vue';

const {
  // State
  core,           // Reactive ui-core instance
  isInitialized,  // Initialization state
  error,          // Error state

  // Initialization
  initialize,
  updateConfig,

  // Services
  getToastManager,
  getApiService,
  getCloudWatchService,
  getAlertsService,

  // Plugin management
  registerPlugin,
  activateFramework,

  // Framework integration
  getComponent,
  getAdapter,
  callHook
} = useFriggCore({
  api: { baseUrl: 'https://api.frigg.dev' }
});
```

## Pre-built Components

The package includes several demo components that showcase ui-core integration:

### ToastDemo

A complete toast notification demonstration component.

```vue
<template>
  <ToastDemo />
</template>

<script>
import { ToastDemo } from '@friggframework/ui-vue';

export default {
  components: { ToastDemo }
};
</script>
```

### IntegrationList

A full-featured integration management component.

```vue
<template>
  <IntegrationList />
</template>

<script>
import { IntegrationList } from '@friggframework/ui-vue';

export default {
  components: { IntegrationList }
};
</script>
```

### AlertsPanel

A comprehensive alerts management panel.

```vue
<template>
  <AlertsPanel :integration-id="selectedIntegration" />
</template>

<script>
import { AlertsPanel } from '@friggframework/ui-vue';

export default {
  components: { AlertsPanel },
  data() {
    return {
      selectedIntegration: 'integration-123'
    };
  }
};
</script>
```

## Plugin Architecture

The Vue plugin implements the ui-core FrameworkPlugin interface:

```javascript
import { VuePlugin, vuePlugin } from '@friggframework/ui-vue/plugins';

// Manual plugin registration
const core = createFriggUICore();
core.registerPlugin(vuePlugin);
core.activateFramework('vue');

// Access Vue-specific adapters
const vueAdapter = vuePlugin.getVueAdapter();
const reactiveState = vueAdapter.createState({ count: 0 });
const watcher = vueAdapter.createEffect(() => {
  console.log('State changed:', reactiveState.count);
}, [reactiveState]);
```

## Advanced Usage

### Custom Configuration

```javascript
// Advanced core configuration
const friggCore = createFriggUICore({
  api: {
    baseUrl: process.env.VUE_APP_FRIGG_API_URL,
    jwt: localStorage.getItem('frigg-jwt')
  },
  toast: {
    limit: 3,
    removeDelay: 5000
  },
  monitoring: {
    enabled: true,
    interval: 30000
  }
});
```

### Real-time Integration

```javascript
// Set up real-time alerts subscription
const { alerts, subscribeToAlerts } = useAlerts('integration-id');

onMounted(() => {
  const unsubscribe = subscribeToAlerts();
  
  onUnmounted(() => {
    unsubscribe();
  });
});
```

### Error Handling

```javascript
const { error, hasError, clearError } = useApiClient();

// Global error handling
watch(error, (newError) => {
  if (newError) {
    console.error('API Error:', newError);
    // Show user-friendly error message
    showError('Something went wrong. Please try again.');
  }
});
```

## TypeScript Support

The package includes full TypeScript support:

```typescript
import type { Integration, Alert } from '@friggframework/ui-core';
import { useApiClient, useAlerts } from '@friggframework/ui-vue';

interface ComponentData {
  integrations: Integration[];
  alerts: Alert[];
}

export default defineComponent({
  setup(): ComponentData {
    const { listIntegrations } = useApiClient();
    const { alerts } = useAlerts();

    return {
      integrations: ref<Integration[]>([]),
      alerts
    };
  }
});
```

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Build package
npm run build

# Run tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT

## Contributing

See the main [Frigg Framework repository](https://github.com/friggframework/frigg) for contribution guidelines.