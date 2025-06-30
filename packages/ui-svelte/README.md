# @friggframework/ui-svelte

Svelte integration package for the Frigg UI Core framework. This package provides Svelte-specific components, stores, and utilities that seamlessly integrate with `@friggframework/ui-core`.

## Installation

```bash
npm install @friggframework/ui-svelte @friggframework/ui-core
# or
yarn add @friggframework/ui-svelte @friggframework/ui-core
# or
pnpm add @friggframework/ui-svelte @friggframework/ui-core
```

## Quick Start

### 1. Initialize in your app

```javascript
// app.js or main.js
import { initializeSvelteFrigg } from '@friggframework/ui-svelte';

// Initialize with your configuration
await initializeSvelteFrigg({
  apiBaseUrl: 'https://api.yourapp.com',
  environment: 'production',
  // ... other configuration
});
```

### 2. Use components in your Svelte files

```svelte
<script>
  import { ToastNotification, IntegrationList, LoadingSpinner } from '@friggframework/ui-svelte';
  import { toastStore } from '@friggframework/ui-svelte';
  
  function handleConnect(event) {
    const { integration } = event.detail;
    toastStore.success(`Connected to ${integration.name}`);
  }
</script>

<!-- Toast notifications -->
<ToastNotification position="top-right" />

<!-- Integration list -->
<IntegrationList 
  integrations={myIntegrations}
  on:connect={handleConnect}
/>

<!-- Loading spinner -->
{#if loading}
  <LoadingSpinner overlay message="Loading integrations..." />
{/if}
```

## Core Features

### 🔌 Svelte Plugin

The package includes a complete Svelte plugin that integrates with ui-core:

```javascript
import { sveltePlugin } from '@friggframework/ui-svelte';
import { friggUICore } from '@friggframework/ui-core';

// Plugin is automatically registered when you use initializeSvelteFrigg()
// Or manually:
friggUICore.registerPlugin(sveltePlugin);
friggUICore.activateFramework('svelte');
```

### 📦 Stores

All ui-core services are available as reactive Svelte stores:

#### Toast Store
```javascript
import { toastStore, success, error, warning, info } from '@friggframework/ui-svelte';

// Show notifications
success('Operation completed!');
error('Something went wrong');
warning('Please check your input');
info('New update available');

// Or use the store directly
toastStore.toast({
  title: 'Custom Toast',
  description: 'With all options',
  variant: 'default',
  duration: 5000,
  action: {
    label: 'Undo',
    onClick: () => console.log('Undo clicked')
  }
});

// Manage toasts
toastStore.dismiss(toastId);
toastStore.dismissAll();
toastStore.clear();
```

#### API Store
```javascript
import { api, apiLoading, apiErrors } from '@friggframework/ui-svelte';

// Make API calls with automatic loading state
const data = await api.get('/users');
await api.post('/users', { name: 'John' });

// Access loading state
$: if ($apiLoading) {
  console.log('API request in progress...');
}

// Handle errors
$: if ($apiErrors.length > 0) {
  console.error('API errors:', $apiErrors);
}
```

#### Alerts Store
```javascript
import { alertsStore, alertCounts, criticalAlerts } from '@friggframework/ui-svelte';

// Add alerts
await alertsStore.addAlert({
  title: 'System Alert',
  message: 'Database connection lost',
  severity: 'critical'
});

// Access alert counts
$: console.log(`You have ${$alertCounts.unread} unread alerts`);

// Filter by severity
$: if ($criticalAlerts.length > 0) {
  console.warn('Critical alerts:', $criticalAlerts);
}
```

#### CloudWatch Store
```javascript
import { cloudWatchStore, healthStatus } from '@friggframework/ui-svelte';

// Fetch metrics
await cloudWatchStore.fetchLambdaMetrics('my-function');
await cloudWatchStore.fetchApiGatewayMetrics('my-api');

// Start real-time monitoring
cloudWatchStore.startRealtime({
  lambdaFunctions: ['function-1', 'function-2'],
  apiGateways: ['api-1'],
  sqsQueues: ['queue-1']
});

// Check health status
$: if ($healthStatus.overall === 'error') {
  console.error('System health check failed');
}
```

### 🎨 Components

#### ToastNotification
Displays toast notifications with automatic positioning and animations.

```svelte
<ToastNotification 
  position="top-right"
  maxToasts={5}
/>
```

#### IntegrationList
Displays a list of integrations with search, filter, and action capabilities.

```svelte
<IntegrationList 
  integrations={integrations}
  loading={loading}
  error={error}
  variant="grid"
  columns={3}
  showFilters={true}
  showSearch={true}
  on:connect={handleConnect}
  on:disconnect={handleDisconnect}
  on:configure={handleConfigure}
  on:view={handleView}
/>
```

#### IntegrationCard
Individual integration card with status and actions.

```svelte
<IntegrationCard 
  integration={integration}
  variant="default"
  showActions={true}
  on:connect={handleConnect}
  on:disconnect={handleDisconnect}
/>
```

#### AlertsPanel
Real-time alerts panel with filtering and management.

```svelte
<AlertsPanel 
  maxHeight="400px"
  showHeader={true}
  showFilters={true}
  autoRefresh={true}
  refreshInterval={30000}
/>
```

#### Modal
Flexible modal dialog component.

```svelte
<Modal 
  bind:open={showModal}
  title="Confirm Action"
  description="Are you sure you want to proceed?"
  size="md"
>
  <p>Modal content goes here</p>
  
  <div slot="footer" class="flex gap-2">
    <button on:click={() => showModal = false}>Cancel</button>
    <button on:click={handleConfirm}>Confirm</button>
  </div>
</Modal>
```

#### LoadingSpinner
Customizable loading indicator.

```svelte
<LoadingSpinner 
  size="lg"
  color="primary"
  overlay={true}
  message="Processing..."
/>
```

#### ErrorBoundary
Error boundary component for graceful error handling.

```svelte
<ErrorBoundary 
  onError={handleError}
  fallback={CustomErrorComponent}
>
  <YourComponent />
</ErrorBoundary>
```

### 🎯 Actions

Svelte actions for enhanced functionality:

#### clickOutside
Detect clicks outside an element.

```svelte
<div 
  use:clickOutside={{ 
    enabled: true, 
    callback: () => closeMenu() 
  }}
>
  Menu content
</div>
```

#### portal
Render elements in a portal.

```svelte
<div use:portal={'#modal-root'}>
  Modal content
</div>
```

#### tooltip
Add tooltips to elements.

```svelte
<button 
  use:tooltip={{
    content: 'Click to save',
    placement: 'top',
    delay: 500
  }}
>
  Save
</button>
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type { 
  ToastStore, 
  AlertsStore, 
  Integration,
  ToastProps 
} from '@friggframework/ui-svelte';

// All types are exported and documented
```

## SvelteKit Integration

For SvelteKit projects, initialize in your root layout:

```svelte
<!-- +layout.svelte -->
<script>
  import { initializeSvelteFrigg } from '@friggframework/ui-svelte';
  import { onMount } from 'svelte';
  
  onMount(async () => {
    await initializeSvelteFrigg({
      // your config
    });
  });
</script>
```

## Advanced Usage

### Custom Store Creation

Create custom stores that integrate with ui-core:

```javascript
import { sveltePlugin } from '@friggframework/ui-svelte';

// Create a store from any ui-core service
const customStore = sveltePlugin.createStoreFromService(
  myService,
  (state) => state.data // optional transform function
);
```

### Context API Integration

Use Svelte's context API with ui-core:

```javascript
import { getCore } from '@friggframework/ui-svelte';
import { setContext } from 'svelte';

// In parent component
const core = getCore();
setContext('frigg', core);

// In child component
import { getContext } from 'svelte';
const core = getContext('frigg');
```

## Testing

The package includes comprehensive test utilities:

```javascript
import { render } from '@testing-library/svelte';
import { IntegrationCard } from '@friggframework/ui-svelte';

test('renders integration card', () => {
  const { getByText } = render(IntegrationCard, {
    props: {
      integration: {
        name: 'Test Integration',
        status: 'connected'
      }
    }
  });
  
  expect(getByText('Test Integration')).toBeInTheDocument();
});
```

## Contributing

Please see the main Frigg repository for contribution guidelines.

## License

MIT