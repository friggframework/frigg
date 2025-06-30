# Getting Started with Frigg Framework and React

This guide will help you integrate Frigg Framework with React to build powerful integration management interfaces. By the end of this guide, you'll have a working React application with Frigg integration capabilities.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Setup](#project-setup)
- [Basic Integration](#basic-integration)
- [Adding UI Components](#adding-ui-components)
- [State Management](#state-management)
- [Real-time Features](#real-time-features)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Next Steps](#next-steps)

## Prerequisites

Before starting, ensure you have:

- **Node.js 18+** installed
- **Create React App** or **Vite** (recommended)
- Basic knowledge of React hooks and modern React patterns
- Frigg backend service running (see [Backend Setup](./backend-only.md))

```bash
# Verify prerequisites
node --version  # Should be 18+
npx --version   # Should be 8+

# Install Frigg CLI if you haven't already
npm install -g @friggframework/devtools
frigg --version
```

## Quick Start

The fastest way to get started is using the Frigg CLI to scaffold a new React project:

```bash
# Create new Frigg React project
frigg init my-frigg-react-app --template react

# Navigate to project
cd my-frigg-react-app

# Install dependencies
npm install

# Start development server
npm start
```

This creates a complete React application with:
- ✅ Frigg Framework integration
- ✅ Sample integrations (HubSpot, Salesforce)
- ✅ Authentication setup
- ✅ Monitoring dashboard
- ✅ Responsive UI components

**Your app is now running at `http://localhost:3000`**

Skip to [Basic Integration](#basic-integration) to start customizing, or continue reading to set up manually.

## Project Setup

### Manual Setup with Existing React Project

If you have an existing React project, you can add Frigg Framework:

```bash
# Install Frigg packages
npm install @friggframework/ui @friggframework/ui-core

# Install peer dependencies (if not already installed)
npm install react@^18.0.0 react-dom@^18.0.0
```

### Manual Setup with New React Project

```bash
# Create new React project with Vite (recommended)
npm create react-app my-frigg-app --template typescript

# Or with Vite for better performance
npm create vite@latest my-frigg-app -- --template react-ts

cd my-frigg-app
npm install

# Add Frigg packages
npm install @friggframework/ui @friggframework/ui-core

# Add additional dependencies for full functionality
npm install @tanstack/react-query axios
```

## Basic Integration

### 1. Configure Frigg Core

Create or update your `src/index.js` (or `src/main.tsx` for TypeScript):

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFriggUICore } from '@friggframework/ui-core';
import { FriggProvider } from '@friggframework/ui';
import App from './App';
import './index.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Configure Frigg Core
const friggCore = createFriggUICore({
  api: {
    baseUrl: process.env.REACT_APP_FRIGG_API_URL || 'http://localhost:3000',
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
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <FriggProvider core={friggCore}>
        <App />
      </FriggProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

### 2. Environment Configuration

Create `.env.local` file in your project root:

```bash
# Frigg API Configuration
REACT_APP_FRIGG_API_URL=http://localhost:3000
REACT_APP_FRIGG_WEBSOCKET_URL=ws://localhost:3001

# Development settings
REACT_APP_NODE_ENV=development
REACT_APP_DEBUG_MODE=true
```

### 3. Basic Integration Component

Create `src/components/IntegrationManager.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { 
  useApiClient, 
  useToast,
  IntegrationCard,
  LoadingSpinner,
  Button
} from '@friggframework/ui';

export default function IntegrationManager() {
  const [integrations, setIntegrations] = useState([]);
  
  // Frigg hooks
  const { 
    loading, 
    error, 
    hasError, 
    listIntegrations,
    createIntegration,
    clearError 
  } = useApiClient();
  
  const { 
    toasts, 
    success, 
    error: showError, 
    dismiss 
  } = useToast();
  
  // Load integrations on mount
  useEffect(() => {
    loadIntegrations();
  }, []);
  
  const loadIntegrations = async () => {
    try {
      const result = await listIntegrations();
      setIntegrations(result.integrations || []);
      success('Integrations loaded successfully');
    } catch (err) {
      showError('Failed to load integrations');
      console.error('Load integrations error:', err);
    }
  };
  
  const handleConfigure = (integration) => {
    // Navigate to configuration page
    showError('Configuration UI coming soon!');
  };
  
  const handleTest = async (integration) => {
    try {
      success(`Testing ${integration.name}...`);
      // Add actual test logic here
    } catch (err) {
      showError(`Failed to test ${integration.name}`);
    }
  };
  
  const addIntegration = () => {
    // Open integration picker/creation modal
    showError('Add integration UI coming soon!');
  };
  
  if (loading) {
    return (
      <div className="integration-manager-loading">
        <LoadingSpinner />
        <p>Loading integrations...</p>
      </div>
    );
  }
  
  if (hasError) {
    return (
      <div className="integration-manager-error">
        <p>Error: {error.message}</p>
        <Button onClick={clearError}>Retry</Button>
      </div>
    );
  }
  
  return (
    <div className="integration-manager">
      <h2>Integration Management</h2>
      
      <div className="integrations-grid">
        {integrations.map(integration => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            onConfigure={() => handleConfigure(integration)}
            onTest={() => handleTest(integration)}
          />
        ))}
        
        <button onClick={addIntegration} className="add-integration-btn">
          + Add Integration
        </button>
      </div>
      
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className={`toast toast-${toast.variant}`}
          >
            {toast.title}: {toast.description}
            <button onClick={() => dismiss(toast.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add corresponding CSS in `src/components/IntegrationManager.css`:

```css
.integration-manager {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.integration-manager-loading {
  text-align: center;
  padding: 3rem;
}

.integration-manager-error {
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
```

## Adding UI Components

### 1. Integration Dashboard

```jsx
import React from 'react';
import { 
  IntegrationBrowser,
  IntegrationList, 
  AlertsPanel,
  MonitoringDashboard
} from '@friggframework/ui';

export default function Dashboard() {
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [userIntegrations, setUserIntegrations] = useState([]);
  const [availableIntegrations, setAvailableIntegrations] = useState([]);
  
  const handleIntegrationSelect = (integration) => {
    setSelectedIntegration(integration);
  };
  
  const openConfiguration = (integration) => {
    // Open configuration modal or navigate to config page
    console.log('Configure:', integration);
  };
  
  const removeIntegration = async (integrationId) => {
    // Remove integration logic
    console.log('Remove:', integrationId);
  };
  
  const handleAlertAcknowledge = (alertId) => {
    // Acknowledge alert logic
    console.log('Acknowledge alert:', alertId);
  };
  
  return (
    <div className="dashboard">
      <h1>Integration Dashboard</h1>
      
      {/* Integration Browser */}
      <section className="dashboard-section">
        <h2>Available Integrations</h2>
        <IntegrationBrowser 
          integrations={availableIntegrations}
          onSelect={handleIntegrationSelect}
        />
      </section>
      
      {/* User's Integrations */}
      <section className="dashboard-section">
        <h2>Your Integrations</h2>
        <IntegrationList 
          integrations={userIntegrations}
          onConfigure={openConfiguration}
          onRemove={removeIntegration}
        />
      </section>
      
      {/* Monitoring */}
      <section className="dashboard-section">
        <h2>System Monitoring</h2>
        <MonitoringDashboard />
      </section>
      
      {/* Alerts */}
      {selectedIntegration && (
        <section className="dashboard-section">
          <h2>Alerts</h2>
          <AlertsPanel 
            integrationId={selectedIntegration.id}
            onAcknowledge={handleAlertAcknowledge}
          />
        </section>
      )}
    </div>
  );
}
```

### 2. Authentication Components

```jsx
import React, { useState } from 'react';
import { useApiClient, useToast, Button, Input } from '@friggframework/ui';

export default function AuthContainer({ children }) {
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [user, setUser] = useState(null);
  
  const { login, loading } = useApiClient();
  const { success, error } = useToast();
  
  const isAuthenticated = !!user;
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const result = await login(credentials.username, credentials.password);
      setUser(result.user);
      success('Successfully signed in!');
    } catch (err) {
      error('Failed to sign in. Please check your credentials.');
    }
  };
  
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('frigg-jwt');
    success('Successfully signed out!');
  };
  
  const handleInputChange = (field) => (e) => {
    setCredentials(prev => ({
      ...prev,
      [field]: e.target.value
    }));
  };
  
  if (!isAuthenticated) {
    return (
      <div className="auth-container">
        <div className="login-form">
          <h2>Sign In to Frigg</h2>
          <form onSubmit={handleLogin}>
            <Input
              type="text"
              placeholder="Username"
              value={credentials.username}
              onChange={handleInputChange('username')}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={credentials.password}
              onChange={handleInputChange('password')}
              required
            />
            <Button type="submit" disabled={loading} variant="primary">
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    );
  }
  
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Frigg Dashboard</h1>
        <div className="user-menu">
          <span>Welcome, {user.name}!</span>
          <Button onClick={handleLogout} variant="outline">
            Sign Out
          </Button>
        </div>
      </header>
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
```

## State Management

### 1. Context-based State Management

```jsx
// src/context/IntegrationContext.js
import React, { createContext, useContext, useReducer } from 'react';

const IntegrationContext = createContext();

const initialState = {
  integrations: [],
  selectedIntegration: null,
  loading: false,
  error: null
};

function integrationReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_INTEGRATIONS':
      return { ...state, integrations: action.payload, loading: false };
    case 'SET_SELECTED_INTEGRATION':
      return { ...state, selectedIntegration: action.payload };
    case 'ADD_INTEGRATION':
      return { 
        ...state, 
        integrations: [...state.integrations, action.payload] 
      };
    case 'UPDATE_INTEGRATION':
      return {
        ...state,
        integrations: state.integrations.map(integration =>
          integration.id === action.payload.id 
            ? { ...integration, ...action.payload } 
            : integration
        )
      };
    case 'REMOVE_INTEGRATION':
      return {
        ...state,
        integrations: state.integrations.filter(
          integration => integration.id !== action.payload
        )
      };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

export function IntegrationProvider({ children }) {
  const [state, dispatch] = useReducer(integrationReducer, initialState);
  
  return (
    <IntegrationContext.Provider value={{ state, dispatch }}>
      {children}
    </IntegrationContext.Provider>
  );
}

export function useIntegrationContext() {
  const context = useContext(IntegrationContext);
  if (!context) {
    throw new Error('useIntegrationContext must be used within IntegrationProvider');
  }
  return context;
}
```

### 2. Custom Hooks for Integration Management

```jsx
// src/hooks/useIntegrations.js
import { useEffect } from 'react';
import { useApiClient } from '@friggframework/ui';
import { useIntegrationContext } from '../context/IntegrationContext';

export function useIntegrations() {
  const { state, dispatch } = useIntegrationContext();
  const { listIntegrations, createIntegration, updateIntegration, deleteIntegration } = useApiClient();
  
  useEffect(() => {
    loadIntegrations();
  }, []);
  
  const loadIntegrations = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const result = await listIntegrations();
      dispatch({ type: 'SET_INTEGRATIONS', payload: result.integrations });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };
  
  const addIntegration = async (integrationData) => {
    try {
      const newIntegration = await createIntegration(integrationData);
      dispatch({ type: 'ADD_INTEGRATION', payload: newIntegration });
      return newIntegration;
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  };
  
  const editIntegration = async (id, updates) => {
    try {
      const updatedIntegration = await updateIntegration(id, updates);
      dispatch({ type: 'UPDATE_INTEGRATION', payload: updatedIntegration });
      return updatedIntegration;
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  };
  
  const removeIntegration = async (id) => {
    try {
      await deleteIntegration(id);
      dispatch({ type: 'REMOVE_INTEGRATION', payload: id });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
      throw error;
    }
  };
  
  const selectIntegration = (integration) => {
    dispatch({ type: 'SET_SELECTED_INTEGRATION', payload: integration });
  };
  
  return {
    ...state,
    loadIntegrations,
    addIntegration,
    editIntegration,
    removeIntegration,
    selectIntegration
  };
}
```

## Real-time Features

### 1. WebSocket Integration with React

```jsx
import React, { useState, useEffect } from 'react';
import { useSocket } from '@friggframework/ui';

export default function RealTimeMonitoring() {
  const [metrics, setMetrics] = useState({
    activeIntegrations: 0,
    apiCalls: 0,
    errorRate: 0
  });
  const [recentLogs, setRecentLogs] = useState([]);
  
  // WebSocket connection
  const { 
    connectionStatus, 
    subscribe, 
    unsubscribe 
  } = useSocket();
  
  useEffect(() => {
    // Subscribe to real-time updates
    const unsubscribeMetrics = subscribe('metrics', (data) => {
      setMetrics(prev => ({ ...prev, ...data }));
    });
    
    const unsubscribeLogs = subscribe('logs', (log) => {
      setRecentLogs(prev => [log, ...prev.slice(0, 49)]); // Keep latest 50
    });
    
    return () => {
      unsubscribeMetrics();
      unsubscribeLogs();
    };
  }, [subscribe, unsubscribe]);
  
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };
  
  return (
    <div className="monitoring-dashboard">
      <h2>Real-time Monitoring</h2>
      
      {/* Connection Status */}
      <div className={`connection-status ${connectionStatus}`}>
        {connectionStatus === 'connected' ? '🟢 Connected' : '🔴 Disconnected'}
      </div>
      
      {/* Live Metrics */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Active Integrations</h3>
          <div className="metric-value">{metrics.activeIntegrations}</div>
        </div>
        
        <div className="metric-card">
          <h3>API Calls Today</h3>
          <div className="metric-value">{metrics.apiCalls}</div>
        </div>
        
        <div className="metric-card">
          <h3>Error Rate</h3>
          <div className="metric-value">{metrics.errorRate}%</div>
        </div>
      </div>
      
      {/* Live Logs */}
      <div className="live-logs">
        <h3>Live Activity</h3>
        <div className="log-entries">
          {recentLogs.map(log => (
            <div 
              key={log.id}
              className={`log-entry log-${log.level}`}
            >
              <span className="timestamp">{formatTime(log.timestamp)}</span>
              <span className="message">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Authentication

### JWT Token Management with React

```jsx
// src/hooks/useAuth.js
import { useState, useEffect, createContext, useContext } from 'react';
import { useApiClient } from '@friggframework/ui';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('frigg-jwt') || '');
  const [user, setUser] = useState(null);
  
  const { login: apiLogin, createUser } = useApiClient();
  
  const isAuthenticated = !!token && !!user;
  
  const login = async (username, password) => {
    const result = await apiLogin(username, password);
    setToken(result.jwt);
    setUser(result.user);
    localStorage.setItem('frigg-jwt', result.jwt);
    return result;
  };
  
  const logout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('frigg-jwt');
  };
  
  const signup = async (userData) => {
    const result = await createUser(userData);
    setToken(result.jwt);
    setUser(result.user);
    localStorage.setItem('frigg-jwt', result.jwt);
    return result;
  };
  
  const value = {
    token,
    user,
    isAuthenticated,
    login,
    logout,
    signup
  };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

## Deployment

### 1. Build for Production

```bash
# Build React app
npm run build

# Build will be in build/ directory
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

```bash
# Deploy to Netlify
npx netlify-cli deploy --prod --dir=build

# Deploy to Vercel
npx vercel --prod

# Deploy to AWS S3
aws s3 sync build/ s3://your-bucket-name --delete
```

## Next Steps

Congratulations! You now have a working React application with Frigg Framework integration. Here's what to explore next:

### 🚀 Advanced Topics
- [Integration Patterns](../tutorials/integration-patterns.md) - Common integration architectures
- [State Management](../tutorials/react-state-management.md) - Advanced state patterns
- [Testing Strategies](../tutorials/testing-react-integrations.md) - Testing your integrations
- [Performance Optimization](../tutorials/react-performance.md) - Optimizing your React app

### 🔧 Framework-Specific Features
- [React Router Integration](../tutorials/react-router-integration.md) - Advanced routing patterns
- [Custom Hooks](../tutorials/react-custom-hooks.md) - Building reusable integration hooks
- [TypeScript Integration](../tutorials/react-typescript.md) - Full TypeScript setup

### 🏗️ Production Considerations
- [Security Best Practices](../tutorials/security-best-practices.md) - Securing your integrations
- [Monitoring and Alerting](../tutorials/monitoring-alerting.md) - Production monitoring
- [Error Boundaries](../tutorials/react-error-boundaries.md) - Robust error handling

### 🤝 Community Resources
- [React Examples Repository](https://github.com/friggframework/frigg-examples-react) - Complete example projects
- [Discord Community](https://discord.gg/frigg) - Get help and share your projects
- [Contribute](../contributing/README.md) - Help improve Frigg Framework

---

**Need help?** Join our [Discord community](https://discord.gg/frigg) or check out the [troubleshooting guide](../support/troubleshooting.md).