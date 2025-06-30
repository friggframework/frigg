# Getting Started with Frigg Framework and Vue.js

This guide will help you integrate Frigg Framework with Vue.js to build powerful integration management interfaces. By the end of this guide, you'll have a working Vue.js application with Frigg integration capabilities.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Setup](#project-setup)
- [Basic Integration](#basic-integration)
- [Adding UI Components](#adding-ui-components)
- [Real-time Features](#real-time-features)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Next Steps](#next-steps)

## Prerequisites

Before starting, ensure you have:

- **Node.js 18+** installed
- **Vue CLI** or **Vite** (recommended)
- Basic knowledge of Vue.js 3 and Composition API
- Frigg backend service running (see [Backend Setup](./backend-only.md))

```bash
# Verify prerequisites
node --version  # Should be 18+
vue --version   # Vue CLI 5+ or use Vite

# Install Frigg CLI if you haven't already
npm install -g @friggframework/devtools
frigg --version
```

## Quick Start

The fastest way to get started is using the Frigg CLI to scaffold a new Vue.js project:

```bash
# Create new Frigg Vue project
frigg init my-frigg-vue-app --template vue

# Navigate to project
cd my-frigg-vue-app

# Install dependencies
npm install

# Start development server
npm run dev
```

This creates a complete Vue.js application with:
- ✅ Frigg Framework integration
- ✅ Sample integrations (HubSpot, Salesforce)
- ✅ Authentication setup
- ✅ Monitoring dashboard
- ✅ Responsive UI components

**Your app is now running at `http://localhost:5173`**

Skip to [Basic Integration](#basic-integration) to start customizing, or continue reading to set up manually.

## Project Setup

### Manual Setup with Existing Vue Project

If you have an existing Vue.js project, you can add Frigg Framework:

```bash
# Install Frigg packages
npm install @friggframework/ui-vue @friggframework/ui-core

# Install peer dependencies (if not already installed)
npm install vue@^3.0.0
```

### Manual Setup with New Vue Project

```bash
# Create new Vue project with Vite (recommended)
npm create vue@latest my-frigg-app

# Follow prompts, recommended selections:
# ✅ TypeScript - Yes (recommended for better DX)
# ✅ Router - Yes
# ✅ Pinia - Yes (for state management)
# ✅ ESLint - Yes
# ❌ Other options - Optional based on your needs

cd my-frigg-app
npm install

# Add Frigg packages
npm install @friggframework/ui-vue @friggframework/ui-core
```

## Basic Integration

### 1. Configure Frigg Core

Create or update your `src/main.js` (or `src/main.ts` for TypeScript):

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createFriggUICore } from '@friggframework/ui-core'
import FriggUIVue from '@friggframework/ui-vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// Create Pinia store
const pinia = createPinia()
app.use(pinia)

// Configure Frigg Core
const friggCore = createFriggUICore({
  api: {
    baseUrl: process.env.VUE_APP_FRIGG_API_URL || 'http://localhost:3000',
    jwt: localStorage.getItem('frigg-jwt') || ''
  },
  toast: {
    limit: 3,
    removeDelay: 5000
  },
  monitoring: {
    enabled: true,
    interval: 30000
  }
})

// Install Frigg Vue plugin
app.use(FriggUIVue, { core: friggCore })

app.use(router)
app.mount('#app')
```

### 2. Environment Configuration

Create `.env.local` file in your project root:

```bash
# Frigg API Configuration
VUE_APP_FRIGG_API_URL=http://localhost:3000
VUE_APP_FRIGG_WEBSOCKET_URL=ws://localhost:3001

# Development settings
VUE_APP_NODE_ENV=development
VUE_APP_DEBUG_MODE=true
```

### 3. Basic Integration Component

Create `src/components/IntegrationManager.vue`:

```vue
<template>
  <div class="integration-manager">
    <h2>Integration Management</h2>
    
    <!-- Loading State -->
    <div v-if="loading" class="loading">
      <LoadingSpinner />
      <p>Loading integrations...</p>
    </div>
    
    <!-- Error State -->
    <div v-else-if="hasError" class="error">
      <p>Error: {{ error.message }}</p>
      <button @click="clearError">Retry</button>
    </div>
    
    <!-- Integrations List -->
    <div v-else class="integrations-grid">
      <IntegrationCard 
        v-for="integration in integrations" 
        :key="integration.id"
        :integration="integration"
        @configure="handleConfigure"
        @test="handleTest"
      />
      
      <button @click="addIntegration" class="add-integration-btn">
        + Add Integration
      </button>
    </div>
    
    <!-- Toast Notifications -->
    <div class="toast-container">
      <div 
        v-for="toast in toasts" 
        :key="toast.id"
        :class="['toast', `toast-${toast.variant}`]"
      >
        {{ toast.title }}: {{ toast.description }}
        <button @click="dismiss(toast.id)">×</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useApiClient, useToast } from '@friggframework/ui-vue'
import { IntegrationCard, LoadingSpinner } from '@friggframework/ui-vue'

export default {
  name: 'IntegrationManager',
  components: {
    IntegrationCard,
    LoadingSpinner
  },
  setup() {
    // State
    const integrations = ref([])
    
    // Frigg Composables
    const { 
      loading, 
      error, 
      hasError, 
      listIntegrations,
      createIntegration,
      clearError 
    } = useApiClient()
    
    const { 
      toasts, 
      success, 
      error: showError, 
      dismiss 
    } = useToast()
    
    // Methods
    const loadIntegrations = async () => {
      try {
        const result = await listIntegrations()
        integrations.value = result.integrations || []
        success('Integrations loaded successfully')
      } catch (err) {
        showError('Failed to load integrations')
        console.error('Load integrations error:', err)
      }
    }
    
    const handleConfigure = (integration) => {
      // Navigate to configuration page
      showError('Configuration UI coming soon!')
    }
    
    const handleTest = async (integration) => {
      try {
        // Test integration
        success(`Testing ${integration.name}...`)
        // Add actual test logic here
      } catch (err) {
        showError(`Failed to test ${integration.name}`)
      }
    }
    
    const addIntegration = () => {
      // Open integration picker/creation modal
      showError('Add integration UI coming soon!')
    }
    
    // Lifecycle
    onMounted(() => {
      loadIntegrations()
    })
    
    return {
      // State
      integrations,
      loading,
      error,
      hasError,
      toasts,
      
      // Methods
      handleConfigure,
      handleTest,
      addIntegration,
      clearError,
      dismiss
    }
  }
}
</script>

<style scoped>
.integration-manager {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.loading {
  text-align: center;
  padding: 3rem;
}

.error {
  text-align: center;
  padding: 2rem;
  color: #dc3545;
}

.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
}

.add-integration-btn {
  border: 2px dashed #ccc;
  background: none;
  padding: 3rem;
  border-radius: 8px;
  cursor: pointer;
  color: #666;
  font-size: 1.1rem;
  transition: all 0.2s;
}

.add-integration-btn:hover {
  border-color: #007bff;
  color: #007bff;
}

.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 1000;
}

.toast {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 0.5rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border-left: 4px solid #007bff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 300px;
}

.toast-success {
  border-left-color: #28a745;
}

.toast-error {
  border-left-color: #dc3545;
}

.toast button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  margin-left: 1rem;
}
</style>
```

## Adding UI Components

### 1. Integration Cards

Frigg provides pre-built components for common UI patterns:

```vue
<template>
  <div class="dashboard">
    <!-- Integration Browser -->
    <IntegrationBrowser 
      :integrations="availableIntegrations"
      @select="handleIntegrationSelect"
    />
    
    <!-- Integration List -->
    <IntegrationList 
      :integrations="userIntegrations"
      @configure="openConfiguration"
      @remove="removeIntegration"
    />
    
    <!-- Alerts Panel -->
    <AlertsPanel 
      :integration-id="selectedIntegration"
      @acknowledge="handleAlertAcknowledge"
    />
  </div>
</template>

<script>
import { 
  IntegrationBrowser,
  IntegrationList, 
  AlertsPanel 
} from '@friggframework/ui-vue'

export default {
  components: {
    IntegrationBrowser,
    IntegrationList,
    AlertsPanel
  }
  // ... rest of component
}
</script>
```

### 2. Authentication Components

```vue
<template>
  <div class="auth-container">
    <!-- Login Form -->
    <div v-if="!isAuthenticated" class="login-form">
      <h2>Sign In to Frigg</h2>
      <form @submit.prevent="handleLogin">
        <input 
          v-model="credentials.username"
          type="text" 
          placeholder="Username"
          required
        />
        <input 
          v-model="credentials.password"
          type="password" 
          placeholder="Password"
          required
        />
        <button type="submit" :disabled="loading">
          {{ loading ? 'Signing In...' : 'Sign In' }}
        </button>
      </form>
    </div>
    
    <!-- User Profile -->
    <div v-else class="user-profile">
      <h3>Welcome, {{ user.name }}!</h3>
      <button @click="handleLogout">Sign Out</button>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import { useApiClient, useToast } from '@friggframework/ui-vue'

export default {
  setup() {
    const credentials = ref({
      username: '',
      password: ''
    })
    
    const user = ref(null)
    
    const { login, loading } = useApiClient()
    const { success, error } = useToast()
    
    const isAuthenticated = computed(() => !!user.value)
    
    const handleLogin = async () => {
      try {
        const result = await login(
          credentials.value.username, 
          credentials.value.password
        )
        user.value = result.user
        success('Successfully signed in!')
      } catch (err) {
        error('Failed to sign in. Please check your credentials.')
      }
    }
    
    const handleLogout = () => {
      user.value = null
      localStorage.removeItem('frigg-jwt')
      success('Successfully signed out!')
    }
    
    return {
      credentials,
      user,
      isAuthenticated,
      loading,
      handleLogin,
      handleLogout
    }
  }
}
</script>
```

## Real-time Features

### 1. WebSocket Integration

```vue
<template>
  <div class="monitoring-dashboard">
    <h2>Real-time Monitoring</h2>
    
    <!-- Connection Status -->
    <div :class="['connection-status', connectionStatus]">
      {{ connectionStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected' }}
    </div>
    
    <!-- Live Metrics -->
    <div class="metrics-grid">
      <div class="metric-card">
        <h3>Active Integrations</h3>
        <div class="metric-value">{{ metrics.activeIntegrations }}</div>
      </div>
      
      <div class="metric-card">
        <h3>API Calls Today</h3>
        <div class="metric-value">{{ metrics.apiCalls }}</div>
      </div>
      
      <div class="metric-card">
        <h3>Error Rate</h3>
        <div class="metric-value">{{ metrics.errorRate }}%</div>
      </div>
    </div>
    
    <!-- Live Logs -->
    <div class="live-logs">
      <h3>Live Activity</h3>
      <div class="log-entries">
        <div 
          v-for="log in recentLogs" 
          :key="log.id"
          :class="['log-entry', `log-${log.level}`]"
        >
          <span class="timestamp">{{ formatTime(log.timestamp) }}</span>
          <span class="message">{{ log.message }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSocket } from '@friggframework/ui-vue'

export default {
  setup() {
    const metrics = ref({
      activeIntegrations: 0,
      apiCalls: 0,
      errorRate: 0
    })
    
    const recentLogs = ref([])
    
    // WebSocket connection
    const { 
      connectionStatus, 
      subscribe, 
      unsubscribe 
    } = useSocket()
    
    // Subscribe to real-time updates
    const unsubscribeMetrics = subscribe('metrics', (data) => {
      metrics.value = { ...metrics.value, ...data }
    })
    
    const unsubscribeLogs = subscribe('logs', (log) => {
      recentLogs.value.unshift(log)
      if (recentLogs.value.length > 50) {
        recentLogs.value = recentLogs.value.slice(0, 50)
      }
    })
    
    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString()
    }
    
    onMounted(() => {
      // Initial data load
      // Additional setup if needed
    })
    
    onUnmounted(() => {
      unsubscribeMetrics()
      unsubscribeLogs()
    })
    
    return {
      metrics,
      recentLogs,
      connectionStatus,
      formatTime
    }
  }
}
</script>

<style scoped>
.connection-status {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  display: inline-block;
  margin-bottom: 2rem;
  font-weight: bold;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.connection-status.disconnected {
  background: #f8d7da;
  color: #721c24;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.metric-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  text-align: center;
}

.metric-value {
  font-size: 2rem;
  font-weight: bold;
  color: #007bff;
  margin-top: 0.5rem;
}

.live-logs {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
}

.log-entries {
  max-height: 400px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.9rem;
}

.log-entry {
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
  display: flex;
}

.timestamp {
  color: #666;
  margin-right: 1rem;
  white-space: nowrap;
}

.log-error {
  background: #fee;
  color: #c33;
}

.log-warning {
  background: #fff3cd;
  color: #856404;
}
</style>
```

## Authentication

### JWT Token Management

```javascript
// src/composables/useAuth.js
import { ref, computed } from 'vue'
import { useApiClient } from '@friggframework/ui-vue'

const token = ref(localStorage.getItem('frigg-jwt') || '')
const user = ref(null)

export function useAuth() {
  const { login: apiLogin, createUser } = useApiClient()
  
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  
  const login = async (username, password) => {
    const result = await apiLogin(username, password)
    token.value = result.jwt
    user.value = result.user
    localStorage.setItem('frigg-jwt', result.jwt)
    return result
  }
  
  const logout = () => {
    token.value = ''
    user.value = null
    localStorage.removeItem('frigg-jwt')
  }
  
  const signup = async (userData) => {
    const result = await createUser(userData)
    token.value = result.jwt
    user.value = result.user
    localStorage.setItem('frigg-jwt', result.jwt)
    return result
  }
  
  return {
    token,
    user,
    isAuthenticated,
    login,
    logout,
    signup
  }
}
```

## Deployment

### 1. Build for Production

```bash
# Build Vue app
npm run build

# Build will be in dist/ directory
```

### 2. Deploy with Frigg CLI

```bash
# Deploy entire application (backend + frontend)
frigg deploy

# Deploy only frontend
frigg deploy --frontend-only

# Deploy to specific environment
frigg deploy --environment production
```

### 3. Manual Deployment

You can deploy the Vue.js frontend to any static hosting service:

```bash
# Deploy to Netlify
npx netlify-cli deploy --prod --dir=dist

# Deploy to Vercel
npx vercel --prod

# Deploy to AWS S3
aws s3 sync dist/ s3://your-bucket-name --delete
```

## Next Steps

Congratulations! You now have a working Vue.js application with Frigg Framework integration. Here's what to explore next:

### 🚀 Advanced Topics
- [Integration Patterns](../tutorials/integration-patterns.md) - Common integration architectures
- [State Management](../tutorials/vue-state-management.md) - Advanced Pinia integration
- [Testing Strategies](../tutorials/testing-vue-integrations.md) - Testing your integrations
- [Performance Optimization](../tutorials/vue-performance.md) - Optimizing your Vue app

### 🔧 Framework-Specific Features
- [Vue Router Integration](../tutorials/vue-router-integration.md) - Advanced routing patterns
- [Composition API Patterns](../tutorials/vue-composition-patterns.md) - Advanced composable patterns
- [TypeScript Integration](../tutorials/vue-typescript.md) - Full TypeScript setup

### 🏗️ Production Considerations
- [Security Best Practices](../tutorials/security-best-practices.md) - Securing your integrations
- [Monitoring and Alerting](../tutorials/monitoring-alerting.md) - Production monitoring
- [Error Handling](../tutorials/error-handling.md) - Robust error handling patterns

### 🤝 Community Resources
- [Vue.js Examples Repository](https://github.com/friggframework/frigg-examples-vue) - Complete example projects
- [Discord Community](https://discord.gg/frigg) - Get help and share your projects
- [Contribute](../contributing/README.md) - Help improve Frigg Framework

---

**Need help?** Join our [Discord community](https://discord.gg/frigg) or check out the [troubleshooting guide](../support/troubleshooting.md).