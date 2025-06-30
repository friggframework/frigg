# Migrating from React to Vue.js

This guide provides a comprehensive approach to migrating your Frigg Framework implementation from React to Vue.js. The migration is straightforward since both frameworks share similar concepts and Frigg provides equivalent functionality in both ecosystems.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Migration Strategy](#migration-strategy)
- [Environment Setup](#environment-setup)
- [Component Migration](#component-migration)
- [State Management Migration](#state-management-migration)
- [Routing Migration](#routing-migration)
- [Testing Migration](#testing-migration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## Overview

### Why Migrate to Vue.js?

- **Simpler Learning Curve** - More approachable for developers new to reactive frameworks
- **Better Performance** - Optimized reactivity system and smaller bundle sizes
- **Composition API** - More flexible and reusable code patterns
- **Official Tooling** - Excellent developer experience with Vue CLI and Vite
- **Template Syntax** - More intuitive for developers with HTML/CSS background

### Migration Complexity: **Easy** ⭐⭐☆☆☆
**Estimated Time: 2-4 hours** for a typical Frigg integration dashboard

### What Changes
- **Component syntax** - JSX → Vue Single File Components
- **State management** - React hooks → Vue Composition API
- **Routing** - React Router → Vue Router
- **Testing** - Jest + React Testing Library → Vitest + Vue Test Utils

### What Stays the Same
- **Frigg Core functionality** - All backend integration logic remains unchanged
- **API calls and data flow** - Same patterns with different syntax
- **Component architecture** - Similar component-based approach
- **Authentication flow** - Same JWT and user management patterns

## Prerequisites

Before starting the migration:

- **Node.js 18+** installed
- **Vue CLI** or **Vite** knowledge (recommended)
- **Basic Vue.js 3 Composition API** understanding
- **Access to your current React + Frigg implementation**

```bash
# Verify prerequisites
node --version  # Should be 18+
vue --version   # Vue CLI 5+ (optional, Vite recommended)

# Install Vue CLI globally (if not using Vite)
npm install -g @vue/cli
```

## Migration Strategy

### Recommended Approach: Parallel Development

1. **Create new Vue.js project** alongside existing React app
2. **Migrate components incrementally** starting with core functionality
3. **Test each component** as you migrate
4. **Switch over** when Vue app reaches feature parity
5. **Retire React app** after successful deployment

### Alternative: In-Place Migration
For smaller projects, you can migrate components one by one within the same repository, though this is more complex.

## Environment Setup

### 1. Create New Vue.js Project

```bash
# Create Vue project with Vite (recommended)
npm create vue@latest my-frigg-vue-app

# Follow prompts, recommended selections:
# ✅ TypeScript - Yes (if your React app uses TypeScript)
# ✅ Router - Yes
# ✅ Pinia - Yes (for state management)
# ✅ ESLint - Yes
# ✅ Testing (Vitest) - Yes

cd my-frigg-vue-app
npm install
```

### 2. Install Frigg Vue.js Packages

```bash
# Install Frigg Vue packages
npm install @friggframework/ui-vue @friggframework/ui-core

# Install additional dependencies if needed
npm install @vueuse/core  # Vue utility functions (equivalent to some React hooks)
```

### 3. Environment Configuration

Copy your environment variables from React app:

```bash
# Copy .env files from React project
cp ../my-react-frigg-app/.env* .

# Update variable names for Vue (REACT_APP_ → VITE_)
# .env.local
VITE_FRIGG_API_URL=http://localhost:3000
VITE_FRIGG_WEBSOCKET_URL=ws://localhost:3001
```

### 4. Configure Frigg Core

Update `src/main.js`:

```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createFriggUICore } from '@friggframework/ui-core'
import FriggUIVue from '@friggframework/ui-vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

// Configure Frigg Core (same config as React)
const friggCore = createFriggUICore({
  api: {
    baseUrl: import.meta.env.VITE_FRIGG_API_URL || 'http://localhost:3000',
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

app.use(pinia)
app.use(FriggUIVue, { core: friggCore })
app.use(router)
app.mount('#app')
```

## Component Migration

### Component Comparison

#### React Component (Before)
```jsx
// React component
import React, { useState, useEffect } from 'react';
import { useApiClient, useToast } from '@friggframework/ui';

export default function IntegrationList() {
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
      success('Integrations loaded');
    } catch (err) {
      error('Failed to load integrations');
    }
  };
  
  const handleConfigure = (integration) => {
    // Configuration logic
  };
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="integration-list">
      <h2>Integrations</h2>
      {integrations.map(integration => (
        <div key={integration.id} className="integration-card">
          <h3>{integration.name}</h3>
          <button onClick={() => handleConfigure(integration)}>
            Configure
          </button>
        </div>
      ))}
    </div>
  );
}
```

#### Vue Component (After)
```vue
<!-- Vue component -->
<template>
  <div class="integration-list">
    <h2>Integrations</h2>
    
    <div v-if="loading">Loading...</div>
    
    <div v-else>
      <div 
        v-for="integration in integrations" 
        :key="integration.id" 
        class="integration-card"
      >
        <h3>{{ integration.name }}</h3>
        <button @click="handleConfigure(integration)">
          Configure
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { useApiClient, useToast } from '@friggframework/ui-vue'

export default {
  name: 'IntegrationList',
  setup() {
    const integrations = ref([])
    const { loading, listIntegrations } = useApiClient()
    const { success, error } = useToast()
    
    const loadIntegrations = async () => {
      try {
        const result = await listIntegrations()
        integrations.value = result.integrations
        success('Integrations loaded')
      } catch (err) {
        error('Failed to load integrations')
      }
    }
    
    const handleConfigure = (integration) => {
      // Configuration logic
    }
    
    onMounted(() => {
      loadIntegrations()
    })
    
    return {
      integrations,
      loading,
      handleConfigure
    }
  }
}
</script>

<style scoped>
.integration-list {
  /* Same CSS as React version */
}

.integration-card {
  /* Same CSS as React version */
}
</style>
```

### Migration Pattern Reference

| React Pattern | Vue Equivalent | Notes |
|---------------|----------------|-------|
| `useState()` | `ref()` | Use `ref()` for primitive values |
| `useState({})` | `reactive()` | Use `reactive()` for objects |
| `useEffect()` | `onMounted()`, `watch()` | Different lifecycle hooks |
| `useCallback()` | `computed()` | For derived values |
| `useMemo()` | `computed()` | For expensive calculations |
| `useRef()` | `ref()` | For DOM element references |
| `props` | `props` | Similar concept, different syntax |
| `children` | `slots` | Vue uses named slots |

### Complex Component Migration Example

#### React Authentication Component
```jsx
// React version
import React, { useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { useToast } from '@friggframework/ui';

export default function LoginForm() {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const { login, loading } = useContext(AuthContext);
  const { success, error } = useToast();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(credentials.username, credentials.password);
      success('Login successful!');
    } catch (err) {
      error('Login failed');
    }
  };
  
  const handleInputChange = (field) => (e) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Username"
        value={credentials.username}
        onChange={handleInputChange('username')}
      />
      <input
        type="password"
        placeholder="Password"
        value={credentials.password}
        onChange={handleInputChange('password')}
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

#### Vue Authentication Component
```vue
<!-- Vue version -->
<template>
  <form @submit.prevent="handleSubmit">
    <input
      v-model="credentials.username"
      type="text"
      placeholder="Username"
    />
    <input
      v-model="credentials.password"
      type="password"
      placeholder="Password"
    />
    <button type="submit" :disabled="loading">
      {{ loading ? 'Logging in...' : 'Login' }}
    </button>
  </form>
</template>

<script>
import { reactive } from 'vue'
import { useAuth } from '../composables/useAuth'
import { useToast } from '@friggframework/ui-vue'

export default {
  name: 'LoginForm',
  setup() {
    const credentials = reactive({
      username: '',
      password: ''
    })
    
    const { login, loading } = useAuth()
    const { success, error } = useToast()
    
    const handleSubmit = async () => {
      try {
        await login(credentials.username, credentials.password)
        success('Login successful!')
      } catch (err) {
        error('Login failed')
      }
    }
    
    return {
      credentials,
      loading,
      handleSubmit
    }
  }
}
</script>
```

## State Management Migration

### From React Context to Pinia

#### React Context (Before)
```jsx
// React Context
import React, { createContext, useContext, useReducer } from 'react';

const IntegrationContext = createContext();

function integrationReducer(state, action) {
  switch (action.type) {
    case 'SET_INTEGRATIONS':
      return { ...state, integrations: action.payload };
    default:
      return state;
  }
}

export function IntegrationProvider({ children }) {
  const [state, dispatch] = useReducer(integrationReducer, {
    integrations: [],
    loading: false
  });
  
  return (
    <IntegrationContext.Provider value={{ state, dispatch }}>
      {children}
    </IntegrationContext.Provider>
  );
}

export function useIntegrationContext() {
  return useContext(IntegrationContext);
}
```

#### Pinia Store (After)
```javascript
// Pinia store
import { defineStore } from 'pinia'

export const useIntegrationStore = defineStore('integration', {
  state: () => ({
    integrations: [],
    loading: false
  }),
  
  actions: {
    setIntegrations(integrations) {
      this.integrations = integrations
    },
    
    setLoading(loading) {
      this.loading = loading
    },
    
    async loadIntegrations() {
      this.setLoading(true)
      try {
        // API call logic
        const integrations = await fetchIntegrations()
        this.setIntegrations(integrations)
      } finally {
        this.setLoading(false)
      }
    }
  },
  
  getters: {
    activeIntegrations: (state) => 
      state.integrations.filter(integration => integration.active)
  }
})
```

## Routing Migration

### From React Router to Vue Router

#### React Router (Before)
```jsx
// React Router setup
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Integrations from './pages/Integrations';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/integrations/:id" element={<IntegrationDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}
```

#### Vue Router (After)
```javascript
// Vue Router setup - router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import Dashboard from '../views/Dashboard.vue'
import Integrations from '../views/Integrations.vue'
import IntegrationDetail from '../views/IntegrationDetail.vue'
import Settings from '../views/Settings.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Dashboard',
      component: Dashboard
    },
    {
      path: '/integrations',
      name: 'Integrations',
      component: Integrations
    },
    {
      path: '/integrations/:id',
      name: 'IntegrationDetail',
      component: IntegrationDetail,
      props: true
    },
    {
      path: '/settings',
      name: 'Settings',
      component: Settings
    }
  ]
})

export default router
```

#### Navigation Component Migration
```jsx
// React navigation
import { Link, useNavigate } from 'react-router-dom';

function Navigation() {
  const navigate = useNavigate();
  
  const goToIntegrations = () => {
    navigate('/integrations');
  };
  
  return (
    <nav>
      <Link to="/">Dashboard</Link>
      <Link to="/integrations">Integrations</Link>
      <button onClick={goToIntegrations}>Go to Integrations</button>
    </nav>
  );
}
```

```vue
<!-- Vue navigation -->
<template>
  <nav>
    <router-link to="/">Dashboard</router-link>
    <router-link to="/integrations">Integrations</router-link>
    <button @click="goToIntegrations">Go to Integrations</button>
  </nav>
</template>

<script>
import { useRouter } from 'vue-router'

export default {
  setup() {
    const router = useRouter()
    
    const goToIntegrations = () => {
      router.push('/integrations')
    }
    
    return {
      goToIntegrations
    }
  }
}
</script>
```

## Testing Migration

### From Jest + React Testing Library to Vitest + Vue Test Utils

#### React Test (Before)
```jsx
// React test
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FriggProvider } from '@friggframework/ui';
import IntegrationList from '../IntegrationList';

const mockCore = {
  // Mock Frigg core
};

test('renders integration list', async () => {
  render(
    <FriggProvider core={mockCore}>
      <IntegrationList />
    </FriggProvider>
  );
  
  await waitFor(() => {
    expect(screen.getByText('Integrations')).toBeInTheDocument();
  });
});

test('handles integration configuration', async () => {
  render(
    <FriggProvider core={mockCore}>
      <IntegrationList />
    </FriggProvider>
  );
  
  const configButton = screen.getByText('Configure');
  fireEvent.click(configButton);
  
  // Assert expected behavior
});
```

#### Vue Test (After)
```javascript
// Vue test
import { mount } from '@vue/test-utils'
import { createFriggUICore } from '@friggframework/ui-core'
import FriggUIVue from '@friggframework/ui-vue'
import IntegrationList from '../IntegrationList.vue'

const mockCore = createFriggUICore({
  // Mock configuration
})

describe('IntegrationList', () => {
  test('renders integration list', async () => {
    const wrapper = mount(IntegrationList, {
      global: {
        plugins: [[FriggUIVue, { core: mockCore }]]
      }
    })
    
    await wrapper.vm.$nextTick()
    
    expect(wrapper.text()).toContain('Integrations')
  })
  
  test('handles integration configuration', async () => {
    const wrapper = mount(IntegrationList, {
      global: {
        plugins: [[FriggUIVue, { core: mockCore }]]
      }
    })
    
    const configButton = wrapper.find('button')
    await configButton.trigger('click')
    
    // Assert expected behavior
  })
})
```

## Deployment

### 1. Update Build Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest",
    "lint": "eslint . --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts --fix --ignore-path .gitignore"
  }
}
```

### 2. Deploy with Frigg CLI

```bash
# Deploy Vue app (same commands as React)
frigg deploy

# Deploy only frontend
frigg deploy --frontend-only
```

### 3. Update CI/CD Pipeline

If you have existing CI/CD for your React app:

```yaml
# Update GitHub Actions or similar
- name: Install dependencies
  run: npm install

- name: Build Vue app
  run: npm run build

- name: Test
  run: npm run test
```

## Troubleshooting

### Common Migration Issues

#### 1. Template Syntax Differences
```jsx
// React JSX
<div className="container">
  {loading && <div>Loading...</div>}
  {items.map(item => (
    <div key={item.id}>{item.name}</div>
  ))}
</div>
```

```vue
<!-- Vue template -->
<div class="container">
  <div v-if="loading">Loading...</div>
  <div v-for="item in items" :key="item.id">
    {{ item.name }}
  </div>
</div>
```

#### 2. Event Handling
```jsx
// React
<button onClick={handleClick}>Click me</button>
<input onChange={handleChange} />
```

```vue
<!-- Vue -->
<button @click="handleClick">Click me</button>
<input @input="handleChange" />
```

#### 3. Conditional CSS Classes
```jsx
// React
<div className={`card ${isActive ? 'active' : ''}`}>
```

```vue
<!-- Vue -->
<div :class="['card', { active: isActive }]">
```

### Performance Considerations

- **Bundle size** - Vue apps are typically smaller than React equivalents
- **Reactivity** - Vue's reactivity system can be more efficient for complex state
- **Build time** - Vite provides faster builds than traditional webpack setups

### Getting Help

If you encounter issues during migration:

1. **Check the Vue 3 Migration Guide** - For general Vue.js patterns
2. **Join Discord #migration-help** - Get real-time help from the community
3. **Review example repositories** - See complete migration examples
4. **File an issue** - Report bugs or missing features in migration tools

## Next Steps

After completing your migration:

1. **Test thoroughly** - Ensure all functionality works as expected
2. **Update documentation** - Reflect the new Vue.js implementation
3. **Train your team** - Share Vue.js knowledge and best practices
4. **Optimize performance** - Take advantage of Vue.js-specific optimizations
5. **Contribute back** - Share your migration experience with the community

---

**Migration completed successfully?** 

- 📖 [**Vue.js Best Practices Guide →**](../tutorials/vue-best-practices.md)
- 🔧 [**Advanced Vue.js Patterns →**](../tutorials/vue-advanced-patterns.md)
- 🧪 [**Testing Vue.js Integrations →**](../tutorials/testing-vue-integrations.md)

**Need help?** Join our [Discord migration channel](https://discord.gg/frigg-migration) for support from the community and Frigg team.