# Examples and Tutorials

This section provides practical examples and comprehensive tutorials for building integrations with Frigg Framework across all supported frontend frameworks.

## Table of Contents

- [Quick Examples](#quick-examples)
- [Framework-Specific Examples](#framework-specific-examples)
- [Integration Patterns](#integration-patterns)
- [Real-World Applications](#real-world-applications)
- [Code Samples Repository](#code-samples-repository)

## Quick Examples

### 🚀 5-Minute Integration Dashboard

The fastest way to see Frigg in action across different frameworks:

| Framework | Live Demo | Source Code | Deploy |
|-----------|-----------|-------------|---------|
| **React** | [Demo](https://frigg-react-demo.netlify.app) | [GitHub](https://github.com/friggframework/examples-react-dashboard) | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/friggframework/examples-react-dashboard) |
| **Vue.js** | [Demo](https://frigg-vue-demo.netlify.app) | [GitHub](https://github.com/friggframework/examples-vue-dashboard) | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/friggframework/examples-vue-dashboard) |
| **Angular** | [Demo](https://frigg-angular-demo.netlify.app) | [GitHub](https://github.com/friggframework/examples-angular-dashboard) | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/friggframework/examples-angular-dashboard) |
| **Svelte** | [Demo](https://frigg-svelte-demo.netlify.app) | [GitHub](https://github.com/friggframework/examples-svelte-dashboard) | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/friggframework/examples-svelte-dashboard) |

### 📱 Mobile-First Integration App

Responsive integration management optimized for mobile devices:

```bash
# Clone and run
git clone https://github.com/friggframework/examples-mobile-first
cd examples-mobile-first
npm install && npm start
```

### 🏢 Enterprise Dashboard

Full-featured enterprise integration management with advanced monitoring:

```bash
# Clone and run  
git clone https://github.com/friggframework/examples-enterprise-dashboard
cd examples-enterprise-dashboard
npm install && npm start
```

## Framework-Specific Examples

### React Examples

#### Basic Integration Manager
```jsx
import React, { useState, useEffect } from 'react';
import { 
  useApiClient, 
  useToast, 
  IntegrationList, 
  LoadingSpinner 
} from '@friggframework/ui';

export default function IntegrationManager() {
  const [integrations, setIntegrations] = useState([]);
  const { loading, listIntegrations } = useApiClient();
  const { success, error } = useToast();

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const result = await listIntegrations();
      setIntegrations(result.integrations);
      success('Integrations loaded successfully');
    } catch (err) {
      error('Failed to load integrations');
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="integration-manager">
      <h1>My Integrations</h1>
      <IntegrationList 
        integrations={integrations}
        onRefresh={loadIntegrations}
      />
    </div>
  );
}
```

**[📖 Full React Tutorial →](./react/integration-dashboard.md)**

#### Advanced React Patterns
- [Custom Hooks for Integration Logic](./react/custom-hooks.md)
- [Error Boundaries for Robust UX](./react/error-boundaries.md)
- [Performance Optimization with React.memo](./react/performance.md)
- [Testing Integration Components](./react/testing.md)

### Vue.js Examples

#### Basic Integration Manager with Composition API
```vue
<template>
  <div class="integration-manager">
    <h1>My Integrations</h1>
    
    <LoadingSpinner v-if="loading" />
    
    <IntegrationList 
      v-else
      :integrations="integrations"
      @refresh="loadIntegrations"
    />
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { 
  useApiClient, 
  useToast, 
  IntegrationList, 
  LoadingSpinner 
} from '@friggframework/ui-vue'

export default {
  name: 'IntegrationManager',
  components: { IntegrationList, LoadingSpinner },
  setup() {
    const integrations = ref([])
    const { loading, listIntegrations } = useApiClient()
    const { success, error } = useToast()

    const loadIntegrations = async () => {
      try {
        const result = await listIntegrations()
        integrations.value = result.integrations
        success('Integrations loaded successfully')
      } catch (err) {
        error('Failed to load integrations')
      }
    }

    onMounted(() => {
      loadIntegrations()
    })

    return {
      integrations,
      loading,
      loadIntegrations
    }
  }
}
</script>
```

**[📖 Full Vue.js Tutorial →](./vue/integration-dashboard.md)**

#### Advanced Vue.js Patterns
- [Composables for Reusable Logic](./vue/composables.md)
- [Pinia Store Integration](./vue/pinia-stores.md)
- [Vue Router Dynamic Routes](./vue/dynamic-routing.md)
- [Testing with Vue Test Utils](./vue/testing.md)

### Angular Examples

#### Basic Integration Manager with Services
```typescript
// integration-manager.component.ts
import { Component, OnInit } from '@angular/core';
import { FriggApiService, ToastService } from '@friggframework/ui-angular';

@Component({
  selector: 'app-integration-manager',
  template: `
    <div class="integration-manager">
      <h1>My Integrations</h1>
      
      <frigg-loading-spinner *ngIf="loading"></frigg-loading-spinner>
      
      <frigg-integration-list 
        *ngIf="!loading"
        [integrations]="integrations"
        (refresh)="loadIntegrations()">
      </frigg-integration-list>
    </div>
  `
})
export class IntegrationManagerComponent implements OnInit {
  integrations: Integration[] = [];
  loading = false;

  constructor(
    private apiService: FriggApiService,
    private toastService: ToastService
  ) {}

  ngOnInit() {
    this.loadIntegrations();
  }

  async loadIntegrations() {
    this.loading = true;
    try {
      const result = await this.apiService.listIntegrations().toPromise();
      this.integrations = result.integrations;
      this.toastService.success('Integrations loaded successfully');
    } catch (error) {
      this.toastService.error('Failed to load integrations');
    } finally {
      this.loading = false;
    }
  }
}
```

**[📖 Full Angular Tutorial →](./angular/integration-dashboard.md)**

#### Advanced Angular Patterns
- [Services and Dependency Injection](./angular/services.md)
- [Reactive Forms for Configuration](./angular/reactive-forms.md)
- [NgRx for State Management](./angular/ngrx.md)
- [Testing with Angular Testing Utilities](./angular/testing.md)

### Svelte Examples

#### Basic Integration Manager with Stores
```svelte
<!-- IntegrationManager.svelte -->
<script>
  import { onMount } from 'svelte';
  import { 
    apiClient, 
    toastStore,
    IntegrationList, 
    LoadingSpinner 
  } from '@friggframework/ui-svelte';

  let integrations = [];
  let loading = false;

  onMount(() => {
    loadIntegrations();
  });

  async function loadIntegrations() {
    loading = true;
    try {
      const result = await apiClient.listIntegrations();
      integrations = result.integrations;
      toastStore.success('Integrations loaded successfully');
    } catch (error) {
      toastStore.error('Failed to load integrations');
    } finally {
      loading = false;
    }
  }
</script>

<div class="integration-manager">
  <h1>My Integrations</h1>
  
  {#if loading}
    <LoadingSpinner />
  {:else}
    <IntegrationList 
      {integrations}
      on:refresh={loadIntegrations}
    />
  {/if}
</div>
```

**[📖 Full Svelte Tutorial →](./svelte/integration-dashboard.md)**

#### Advanced Svelte Patterns
- [Stores for State Management](./svelte/stores.md)
- [Actions for DOM Interactions](./svelte/actions.md)
- [Transitions and Animations](./svelte/animations.md)
- [Testing with Jest and Testing Library](./svelte/testing.md)

## Integration Patterns

### Authentication Patterns

#### OAuth 2.0 Flow Implementation
```javascript
// Universal pattern - works across all frameworks
async function handleOAuthFlow(integrationId) {
  // 1. Get authorization requirements
  const authReq = await apiClient.getAuthorizeRequirements(integrationId);
  
  // 2. Redirect user to OAuth provider
  const authUrl = new URL(authReq.url);
  Object.entries(authReq.params).forEach(([key, value]) => {
    authUrl.searchParams.set(key, value);
  });
  
  // 3. Open popup or redirect
  const popup = window.open(
    authUrl.toString(),
    'oauth-popup',
    'width=600,height=600'
  );
  
  // 4. Listen for callback
  return new Promise((resolve, reject) => {
    const messageHandler = (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'oauth-callback') {
        popup.close();
        window.removeEventListener('message', messageHandler);
        
        if (event.data.success) {
          resolve(event.data);
        } else {
          reject(new Error(event.data.error));
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
  });
}
```

**[📖 Complete Authentication Guide →](./patterns/authentication.md)**

### Data Synchronization Patterns

#### Real-time Data Sync
```javascript
// WebSocket-based real-time synchronization
class IntegrationSyncManager {
  constructor(integrationId) {
    this.integrationId = integrationId;
    this.socket = null;
    this.listeners = new Map();
  }
  
  connect() {
    this.socket = new WebSocket(`wss://api.frigg.dev/sync/${this.integrationId}`);
    
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleSyncEvent(data);
    };
  }
  
  handleSyncEvent(event) {
    const listeners = this.listeners.get(event.type) || [];
    listeners.forEach(listener => listener(event.data));
  }
  
  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }
  
  // Framework-specific integration examples:
  
  // React hook
  useRealtimeSync() {
    useEffect(() => {
      this.connect();
      return () => this.disconnect();
    }, []);
  }
  
  // Vue composable
  useRealtimeSync() {
    onMounted(() => this.connect());
    onUnmounted(() => this.disconnect());
  }
  
  // Angular service integration
  ngOnInit() { this.connect(); }
  ngOnDestroy() { this.disconnect(); }
  
  // Svelte store integration
  const syncStore = writable({});
  this.subscribe('data-update', (data) => {
    syncStore.set(data);
  });
}
```

**[📖 Complete Data Sync Guide →](./patterns/data-synchronization.md)**

### Error Handling Patterns

#### Centralized Error Management
```javascript
// Framework-agnostic error handling
class IntegrationErrorHandler {
  constructor(toastManager, logger) {
    this.toastManager = toastManager;
    this.logger = logger;
  }
  
  handleApiError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      code: error.code,
      context,
      timestamp: new Date().toISOString()
    };
    
    // Log error for debugging
    this.logger.error('Integration API Error', errorInfo);
    
    // Show user-friendly message
    switch (error.code) {
      case 'AUTH_EXPIRED':
        this.toastManager.warning('Session expired. Please sign in again.');
        this.redirectToLogin();
        break;
      case 'RATE_LIMITED':
        this.toastManager.info('Too many requests. Please wait a moment.');
        break;
      case 'INTEGRATION_UNAVAILABLE':
        this.toastManager.error('Integration temporarily unavailable.');
        break;
      default:
        this.toastManager.error('Something went wrong. Please try again.');
    }
  }
  
  // Framework-specific implementations:
  
  // React Error Boundary
  componentDidCatch(error, errorInfo) {
    this.handleApiError(error, errorInfo);
  }
  
  // Vue Error Handler  
  app.config.errorHandler = (error, instance, info) => {
    this.handleApiError(error, { component: instance, info });
  };
  
  // Angular Error Handler
  handleError(error: any): void {
    this.handleApiError(error);
  }
  
  // Svelte Error Handler
  window.addEventListener('unhandledrejection', (event) => {
    this.handleApiError(event.reason);
  });
}
```

**[📖 Complete Error Handling Guide →](./patterns/error-handling.md)**

## Real-World Applications

### 📊 CRM Integration Hub
**Use Case:** Connect your CRM with 10+ external services for automated data sync.

- **Tech Stack:** React + TypeScript + AWS
- **Integrations:** Salesforce, HubSpot, Pipedrive, Slack, Gmail
- **Features:** Real-time sync, conflict resolution, audit logs

**[🚀 View Demo](https://crm-hub-demo.frigg.dev)** | **[📄 Case Study](./case-studies/crm-integration-hub.md)**

### 🛒 E-commerce Integration Platform  
**Use Case:** Sync product data across multiple marketplaces and tools.

- **Tech Stack:** Vue.js + Pinia + Google Cloud
- **Integrations:** Shopify, Amazon, eBay, QuickBooks, Stripe
- **Features:** Bulk operations, inventory sync, order management

**[🚀 View Demo](https://ecommerce-platform-demo.frigg.dev)** | **[📄 Case Study](./case-studies/ecommerce-platform.md)**

### 🏢 Enterprise Workflow Automation
**Use Case:** Automate complex business workflows across departments.

- **Tech Stack:** Angular + NgRx + Azure
- **Integrations:** Microsoft 365, SAP, Workday, ServiceNow
- **Features:** Workflow builder, approval chains, reporting

**[🚀 View Demo](https://enterprise-automation-demo.frigg.dev)** | **[📄 Case Study](./case-studies/enterprise-automation.md)**

### 📱 Mobile-First Integration App
**Use Case:** Manage integrations on mobile devices with offline support.

- **Tech Stack:** Svelte + PWA + Firebase
- **Integrations:** Google Workspace, Slack, Trello, Zoom
- **Features:** Offline mode, push notifications, mobile UI

**[🚀 View Demo](https://mobile-integration-demo.frigg.dev)** | **[📄 Case Study](./case-studies/mobile-integration.md)**

## Code Samples Repository

### 📂 Browse by Category

#### Integration Patterns
- [OAuth 2.0 Implementations](https://github.com/friggframework/examples/tree/main/oauth-patterns)
- [Webhook Handling](https://github.com/friggframework/examples/tree/main/webhook-patterns)
- [Rate Limiting Strategies](https://github.com/friggframework/examples/tree/main/rate-limiting)
- [Data Transformation](https://github.com/friggframework/examples/tree/main/data-transformation)

#### UI Components
- [Custom Integration Cards](https://github.com/friggframework/examples/tree/main/ui-components/cards)
- [Configuration Forms](https://github.com/friggframework/examples/tree/main/ui-components/forms)
- [Monitoring Dashboards](https://github.com/friggframework/examples/tree/main/ui-components/dashboards)
- [Toast Notifications](https://github.com/friggframework/examples/tree/main/ui-components/notifications)

#### Testing Examples
- [Unit Test Patterns](https://github.com/friggframework/examples/tree/main/testing/unit)
- [Integration Tests](https://github.com/friggframework/examples/tree/main/testing/integration)
- [E2E Test Suites](https://github.com/friggframework/examples/tree/main/testing/e2e)
- [Mock Strategies](https://github.com/friggframework/examples/tree/main/testing/mocks)

#### Deployment Examples
- [AWS Serverless](https://github.com/friggframework/examples/tree/main/deployment/aws)
- [Google Cloud Run](https://github.com/friggframework/examples/tree/main/deployment/gcp)
- [Azure Functions](https://github.com/friggframework/examples/tree/main/deployment/azure)
- [Docker Containers](https://github.com/friggframework/examples/tree/main/deployment/docker)

### 🛠️ Development Tools

#### Scaffolding Templates
```bash
# Clone specific example
npx create-frigg-example <template-name>

# Available templates:
npx create-frigg-example react-dashboard
npx create-frigg-example vue-enterprise  
npx create-frigg-example angular-mobile
npx create-frigg-example svelte-minimal
```

#### Example Browser
Interactive tool to explore and customize examples:

**[🔍 Browse Examples](https://examples.frigg.dev)**

Features:
- Live code editing
- Framework switching
- Instant deployment
- Component library

## Contributing Examples

### 📝 Submit Your Example

Have a great Frigg implementation? Share it with the community!

1. **Fork the examples repository**
2. **Create your example** following our [contribution guidelines](../contributing/examples.md)
3. **Submit a pull request** with documentation
4. **Get featured** in our showcase gallery

### 🏆 Example Categories

We're looking for examples in these categories:
- **Industry-specific solutions** (Healthcare, Finance, Education)
- **Framework patterns** (Advanced hooks, composables, services)
- **Performance optimizations** (Lazy loading, caching, bundling)
- **Accessibility implementations** (Screen readers, keyboard navigation)
- **Internationalization** (Multi-language, RTL support)

### 💡 Example Requirements

For examples to be accepted:
- ✅ Complete, working code
- ✅ Comprehensive documentation
- ✅ Following Frigg best practices
- ✅ Responsive design
- ✅ Accessibility considerations
- ✅ Performance optimized

---

**Ready to start building?** Choose an example that matches your use case and start customizing it for your needs.

**Need help?** Join our [Discord community](https://discord.gg/frigg) to get help from other developers and the Frigg team.

**Want to contribute?** See our [contribution guidelines](../contributing/examples.md) to share your examples with the community.