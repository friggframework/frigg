# @friggframework/ui-vue Documentation

Vue.js bindings for the Frigg Framework UI Core integration platform.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Components](#components)
- [Composables](#composables)
- [Advanced Patterns](#advanced-patterns)
- [TypeScript Support](#typescript-support)
- [Examples](#examples)
- [API Reference](#api-reference)

## Installation

```bash
npm install @friggframework/ui-vue @friggframework/ui-core vue
```

## Quick Start

### Basic Setup

```javascript
import { createApp } from 'vue';
import FriggUIVue from '@friggframework/ui-vue';
import { friggUICore } from '@friggframework/ui-core';
import App from './App.vue';

const app = createApp(App);

// Install the Vue plugin
app.use(FriggUIVue, {
  core: friggUICore
});

app.mount('#app');
```

### Using Composables

```vue
<template>
  <div>
    <button @click="showSuccess">Show Toast</button>
  </div>
</template>

<script setup>
import { useToast } from '@friggframework/ui-vue';

const { success } = useToast();

const showSuccess = () => {
  success('Operation completed successfully!');
};
</script>
```

## Components

### AlertsPanel

Displays and manages system alerts with filtering and actions.

```vue
<template>
  <AlertsPanel 
    :integration-id="integrationId" 
  />
</template>

<script setup>
import { AlertsPanel } from '@friggframework/ui-vue';

const integrationId = 'my-integration';
</script>
```

**Props:**
- `integrationId` (String, optional): Filter alerts by integration ID

### IntegrationCard

Display integration information with status and actions.

```vue
<template>
  <IntegrationCard 
    :integration="integration"
    :show-details="true"
    @activate="handleActivate"
    @configure="handleConfigure"
    @disconnect="handleDisconnect"
  />
</template>

<script setup>
import { IntegrationCard } from '@friggframework/ui-vue';

const integration = {
  id: '1',
  name: 'Salesforce',
  description: 'CRM Integration',
  status: 'active',
  icon: '/icons/salesforce.png'
};

const handleActivate = (integration) => {
  console.log('Activating:', integration);
};
</script>
```

**Props:**
- `integration` (Object, required): Integration data
- `showDetails` (Boolean, default: true): Show detailed information
- `isSelected` (Boolean, default: false): Selected state

**Events:**
- `@click`: Fired when card is clicked
- `@activate`: Fired when activate button is clicked
- `@configure`: Fired when configure button is clicked  
- `@disconnect`: Fired when disconnect button is clicked

### LoadingSpinner

Flexible loading indicator with multiple sizes and variants.

```vue
<template>
  <LoadingSpinner 
    size="large"
    variant="primary"
    message="Loading data..."
  />
</template>

<script setup>
import { LoadingSpinner } from '@friggframework/ui-vue';
</script>
```

**Props:**
- `size` (String): 'small', 'medium', 'large', 'xlarge'
- `variant` (String): 'primary', 'secondary', 'success', 'danger', 'warning', 'info'
- `message` (String): Loading message text
- `fullScreen` (Boolean): Display as full-screen overlay
- `color` (String): Custom color override

### ErrorBoundary

Catch and display errors gracefully with retry functionality.

```vue
<template>
  <ErrorBoundary 
    @error="handleError"
    @retry="handleRetry"
    show-details
  >
    <YourComponent />
  </ErrorBoundary>
</template>

<script setup>
import { ErrorBoundary } from '@friggframework/ui-vue';

const handleError = ({ error, instance, info }) => {
  console.error('Component error:', error);
};

const handleRetry = () => {
  console.log('Retrying...');
};
</script>
```

### Modal

Flexible modal dialog with customizable header, body, and footer.

```vue
<template>
  <button @click="showModal = true">Open Modal</button>
  
  <Modal 
    v-model="showModal"
    title="Confirm Action"
    size="medium"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  >
    <p>Are you sure you want to proceed?</p>
    
    <template #footer>
      <button @click="showModal = false">Cancel</button>
      <button @click="handleConfirm">Confirm</button>
    </template>
  </Modal>
</template>

<script setup>
import { ref } from 'vue';
import { Modal } from '@friggframework/ui-vue';

const showModal = ref(false);

const handleConfirm = () => {
  console.log('Confirmed');
  showModal.value = false;
};
</script>
```

## Composables

### useFriggCore

Core composable for initializing and accessing Frigg UI Core.

```javascript
import { useFriggCore } from '@friggframework/ui-vue';

const {
  core,
  isInitialized,
  error,
  hasError,
  initialize,
  updateConfig,
  getToastManager,
  getApiService,
  getCloudWatchService,
  getAlertsService
} = useFriggCore({
  apiUrl: 'https://api.example.com'
});
```

### useToast

Toast notification management.

```javascript
import { useToast } from '@friggframework/ui-vue';

const {
  toasts,
  activeToasts,
  hasActiveToasts,
  success,
  error,
  warning,
  info,
  promise,
  dismiss,
  clearAll
} = useToast();

// Show notifications
success('Operation completed!');
error('Something went wrong');

// Handle promises
const myPromise = fetch('/api/data');
promise(myPromise, {
  loading: 'Loading data...',
  success: 'Data loaded!',
  error: 'Failed to load data'
});
```

### useApiClient

API client wrapper with loading states.

```javascript
import { useApiClient } from '@friggframework/ui-vue';

const {
  loading,
  error,
  data,
  get,
  post,
  put,
  deleteRequest,
  setAuthToken
} = useApiClient();

// Make requests
const users = await get('/api/users');
const newUser = await post('/api/users', { name: 'John' });

// Set authentication
setAuthToken('Bearer xxx');
```

### useAlerts

Alert management with filtering and actions.

```javascript
import { useAlerts } from '@friggframework/ui-vue';

const {
  alerts,
  activeAlerts,
  criticalAlerts,
  loading,
  fetchAlerts,
  acknowledgeAlert,
  resolveAlert,
  createAlert
} = useAlerts('integration-id');

// Fetch alerts
await fetchAlerts();

// Create new alert
await createAlert({
  title: 'High CPU Usage',
  severity: 'high',
  message: 'CPU usage exceeded 90%'
});
```

### useCloudWatch

CloudWatch monitoring integration.

```javascript
import { useCloudWatch } from '@friggframework/ui-vue';

const {
  metrics,
  events,
  log,
  logMetric,
  logEvent,
  logError,
  startTimer,
  getMetrics
} = useCloudWatch('MyApp/Production');

// Log metrics
logMetric('APILatency', 150, 'Milliseconds');

// Time operations
const timer = startTimer('DatabaseQuery');
// ... perform operation
timer.end();
```

## Advanced Patterns

### Provide/Inject Pattern

Use Vue's provide/inject for deeply nested components:

```vue
<!-- Parent Component -->
<template>
  <div>
    <ChildComponents />
  </div>
</template>

<script setup>
import { provideFrigg } from '@friggframework/ui-vue';

// Provide Frigg context to all children
provideFrigg({
  apiUrl: 'https://api.example.com'
});
</script>
```

```vue
<!-- Child Component (any depth) -->
<template>
  <button @click="showToast">Show Toast</button>
</template>

<script setup>
import { useInjectedToast } from '@friggframework/ui-vue';

const toast = useInjectedToast();

const showToast = () => {
  toast.success('Hello from nested component!');
};
</script>
```

### Custom Plugin Configuration

```javascript
import { createApp } from 'vue';
import { VuePlugin } from '@friggframework/ui-vue/plugins';
import { createFriggUICore } from '@friggframework/ui-core';

const app = createApp(App);

// Create custom core instance
const customCore = createFriggUICore({
  apiUrl: process.env.VUE_APP_API_URL,
  environment: process.env.NODE_ENV,
  features: {
    alerts: true,
    cloudwatch: true,
    toast: true
  }
});

// Register Vue plugin
customCore.registerPlugin(new VuePlugin());
customCore.activateFramework('vue');

// Make available globally
app.config.globalProperties.$frigg = customCore;

app.mount('#app');
```

## TypeScript Support

Full TypeScript support with type definitions:

```typescript
import { 
  useFriggCore, 
  UseToastReturn,
  Alert,
  Integration 
} from '@friggframework/ui-vue';

// Typed composable returns
const toast: UseToastReturn = useToast();

// Component props typing
interface Props {
  integration: Integration;
  alerts: Alert[];
}
```

## Examples

### Complete Integration Dashboard

```vue
<template>
  <div class="dashboard">
    <ErrorBoundary>
      <div v-if="loading" class="center">
        <LoadingSpinner size="large" message="Loading integrations..." />
      </div>
      
      <div v-else class="integrations-grid">
        <IntegrationCard
          v-for="integration in integrations"
          :key="integration.id"
          :integration="integration"
          @activate="activateIntegration"
        />
      </div>
      
      <AlertsPanel 
        v-if="selectedIntegration"
        :integration-id="selectedIntegration.id"
      />
    </ErrorBoundary>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { 
  ErrorBoundary, 
  LoadingSpinner, 
  IntegrationCard, 
  AlertsPanel,
  useApiClient,
  useToast
} from '@friggframework/ui-vue';

const { get, loading } = useApiClient();
const { success, error } = useToast();

const integrations = ref([]);
const selectedIntegration = ref(null);

const fetchIntegrations = async () => {
  try {
    const data = await get('/api/integrations');
    integrations.value = data;
  } catch (err) {
    error('Failed to load integrations');
  }
};

const activateIntegration = async (integration) => {
  try {
    await post(`/api/integrations/${integration.id}/activate`);
    success(`${integration.name} activated successfully`);
    selectedIntegration.value = integration;
  } catch (err) {
    error(`Failed to activate ${integration.name}`);
  }
};

onMounted(fetchIntegrations);
</script>

<style scoped>
.dashboard {
  padding: 20px;
}

.center {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}
</style>
```

## API Reference

### Plugin Options

```typescript
interface VuePluginOptions {
  core?: FriggUICore;
  config?: {
    apiUrl?: string;
    environment?: string;
    features?: {
      alerts?: boolean;
      cloudwatch?: boolean;
      toast?: boolean;
    };
  };
}
```

### Composable Returns

See [TypeScript definitions](./src/types/index.d.ts) for complete API documentation.

## Best Practices

1. **Initialize Early**: Set up Frigg UI Core in your main.js or App.vue
2. **Use Provide/Inject**: For deeply nested components, use the provider pattern
3. **Handle Errors**: Always wrap API calls in try/catch blocks
4. **Loading States**: Show loading indicators for async operations
5. **TypeScript**: Use TypeScript for better type safety and IDE support

## Testing

Run tests with coverage:

```bash
npm run test
npm run coverage
```

## Contributing

See the main [Frigg Framework contributing guide](../../CONTRIBUTING.md).

## License

MIT