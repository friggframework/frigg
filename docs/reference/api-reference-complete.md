# Complete API Reference

This comprehensive API reference covers all Frigg Framework packages and provides detailed documentation for classes, methods, components, and utilities across the entire multi-framework system.

## Table of Contents

- [Core Framework](#core-framework)
- [UI Frameworks](#ui-frameworks)
- [Development Tools](#development-tools)
- [Support Packages](#support-packages)
- [CLI Commands](#cli-commands)
- [Configuration Reference](#configuration-reference)

## Core Framework

### @friggframework/core

The heart of the Frigg Framework, providing backend functionality for integration management.

#### Integration Base Class

```javascript
class IntegrationBase {
  constructor(params)
  
  // Authentication methods
  async getAuthorizationRequirements()
  async processAuthorizationCallback(params)
  async deauthorize()
  
  // Configuration methods
  async testAuth()
  async getExternalUserId() 
  async getSampleData(category)
  async getUserActions()
  async processUserAction(params)
  
  // Data methods
  async getEntities(entityType, params)
  async createEntity(entityType, data)
  async updateEntity(entityType, id, data)
  async deleteEntity(entityType, id)
}
```

**Parameters:**
- `params` (Object): Configuration parameters
  - `userId` (string): User identifier
  - `integrationId` (string): Integration identifier  
  - `credential` (Object): Authentication credentials
  - `config` (Object): Integration-specific configuration

**Example:**
```javascript
import { IntegrationBase } from '@friggframework/core';

class HubSpotIntegration extends IntegrationBase {
  constructor(params) {
    super(params);
    this.baseUrl = 'https://api.hubapi.com';
  }
  
  async getAuthorizationRequirements() {
    return {
      url: `${this.baseUrl}/oauth/authorize`,
      type: 'oauth2',
      params: {
        client_id: this.config.clientId,
        scope: 'contacts'
      }
    };
  }
}
```

#### Module Plugin System

```javascript
class ModulePlugin {
  // Core methods
  getName()
  getVersion() 
  getDescription()
  
  // Authentication
  getAuther()
  
  // Entity management
  getEntityManager()
  
  // API interaction
  getRequester()
  
  // Configuration
  getConfigOptions()
  testConfiguration(config)
}
```

#### Encryption Utilities

```javascript
// Encryption functions
function encrypt(data, key?)
function decrypt(encryptedData, key?)

// Key management
function generateKey()
function deriveKey(password, salt)

// Secure storage
class SecureStorage {
  async store(key, value)
  async retrieve(key)
  async delete(key)
  async list()
}
```

**Example:**
```javascript
import { encrypt, decrypt } from '@friggframework/core/encrypt';

// Encrypt sensitive data
const encrypted = encrypt('sensitive-data');
console.log(encrypted); // Returns encrypted string

// Decrypt data
const decrypted = decrypt(encrypted);
console.log(decrypted); // Returns 'sensitive-data'
```

#### Database Models

```javascript
// User models
class IndividualUser extends mongoose.Model {
  static schema = {
    friggUserId: String,
    email: String,
    createdAt: Date,
    updatedAt: Date
  }
}

class OrganizationUser extends mongoose.Model {
  static schema = {
    friggUserId: String,
    orgId: String,
    role: String,
    permissions: [String]
  }
}

// Integration state
class State extends mongoose.Model {
  static schema = {
    integrationId: String,
    userId: String,
    data: mongoose.Schema.Types.Mixed,
    encrypted: Boolean
  }
}
```

#### Error Handling

```javascript
// Base error class
class FriggError extends Error {
  constructor(message, code, statusCode?)
  
  toJSON()
  toString()
}

// Specific error types
class ValidationError extends FriggError
class AuthenticationError extends FriggError  
class IntegrationError extends FriggError
class RateLimitError extends FriggError
```

**Example:**
```javascript
import { ValidationError } from '@friggframework/core/errors';

function validateInput(data) {
  if (!data.email) {
    throw new ValidationError('Email is required', 'MISSING_EMAIL');
  }
}
```

## UI Frameworks

### @friggframework/ui-core

Shared functionality across all UI frameworks.

#### Core API Client

```javascript
class ApiClient {
  constructor(config)
  
  // Authentication
  async login(username, password)
  async logout()
  async refreshToken()
  
  // Integration management
  async listIntegrations(params?)
  async getIntegration(id)
  async createIntegration(data)
  async updateIntegration(id, data)
  async deleteIntegration(id)
  
  // Authorization flow
  async getAuthorizeRequirements(integrationId)
  async authorize(integrationId, params)
  async deauthorize(integrationId)
  
  // Data operations
  async getSampleData(integrationId, category?)
  async getUserActions(integrationId)
  async submitUserAction(integrationId, action, params)
  
  // User management
  async getUser()
  async updateUser(data)
  async createUser(userData)
}
```

**Configuration:**
```javascript
const apiClient = new ApiClient({
  baseUrl: 'https://api.frigg.dev',
  jwt: 'your-jwt-token',
  timeout: 30000,
  retries: 3
});
```

#### Toast Manager

```javascript
class ToastManager {
  // Display methods
  toast(options)
  success(message, options?)
  error(message, options?)
  warning(message, options?)
  info(message, options?)
  
  // Management methods
  dismiss(id)
  dismissAll()
  clear()
  
  // Configuration
  setLimit(limit)
  setRemoveDelay(delay)
}
```

**Toast Options:**
```javascript
{
  title: string,
  description?: string,
  variant: 'default' | 'success' | 'error' | 'warning' | 'info',
  duration?: number,
  action?: {
    label: string,
    onClick: Function
  }
}
```

#### Framework Plugin Interface

```javascript
interface FrameworkPlugin {
  name: string
  version: string
  
  // Lifecycle
  initialize(core: FriggUICore): void
  destroy(): void
  
  // Framework-specific adapters
  getAdapter(): FrameworkAdapter
  
  // Component registration
  registerComponent(name: string, component: any): void
  getComponent(name: string): any
  
  // Event system
  on(event: string, handler: Function): void
  emit(event: string, data?: any): void
}
```

### @friggframework/ui-vue

Vue.js-specific implementation with Composition API patterns.

#### Composables

```javascript
// useApiClient composable
function useApiClient(config?) {
  return {
    // State
    loading: Ref<boolean>,
    error: Ref<Error | null>,
    hasError: ComputedRef<boolean>,
    
    // Authentication
    login: (username: string, password: string) => Promise<AuthResult>,
    logout: () => void,
    
    // Integrations
    listIntegrations: (params?) => Promise<Integration[]>,
    createIntegration: (data) => Promise<Integration>,
    updateIntegration: (id, data) => Promise<Integration>,
    deleteIntegration: (id) => Promise<void>,
    
    // Authorization
    getAuthorizeRequirements: (integrationId) => Promise<AuthRequirements>,
    authorize: (integrationId, params) => Promise<AuthResult>,
    
    // Data operations
    getSampleData: (integrationId, category?) => Promise<any>,
    getUserActions: (integrationId) => Promise<UserAction[]>,
    submitUserAction: (integrationId, action, params) => Promise<any>,
    
    // Utilities
    clearError: () => void
  }
}
```

```javascript
// useToast composable
function useToast() {
  return {
    // State
    toasts: Ref<Toast[]>,
    
    // Display methods
    toast: (options: ToastOptions) => string,
    success: (message: string, options?) => string,
    error: (message: string, options?) => string,
    warning: (message: string, options?) => string,
    info: (message: string, options?) => string,
    
    // Management
    dismiss: (id: string) => void,
    dismissAll: () => void,
    clear: () => void
  }
}
```

```javascript
// useAlerts composable
function useAlerts(integrationId?: string) {
  return {
    // State
    alerts: Ref<Alert[]>,
    loading: Ref<boolean>,
    error: Ref<Error | null>,
    
    // Computed
    activeAlerts: ComputedRef<Alert[]>,
    criticalAlerts: ComputedRef<Alert[]>,
    
    // Actions
    fetchAlerts: () => Promise<void>,
    acknowledgeAlert: (alertId: string, userId: string) => Promise<void>,
    resolveAlert: (alertId: string, userId: string, resolution: string) => Promise<void>,
    createAlert: (alertData: AlertData) => Promise<Alert>,
    updateAlert: (alertId: string, updates: Partial<Alert>) => Promise<Alert>,
    deleteAlert: (alertId: string) => Promise<void>,
    
    // Utilities
    filterBySeverity: (severity: AlertSeverity) => Alert[],
    filterByStatus: (status: AlertStatus) => Alert[],
    groupBySeverity: () => Record<AlertSeverity, Alert[]>,
    sortByTimestamp: (ascending: boolean) => Alert[],
    
    // Constants
    SEVERITY: AlertSeverity,
    STATUS: AlertStatus
  }
}
```

#### Components

```vue
<!-- IntegrationCard.vue -->
<template>
  <div class="integration-card">
    <div class="integration-header">
      <img :src="integration.logo" :alt="integration.name" />
      <h3>{{ integration.name }}</h3>
      <StatusBadge :status="integration.status" />
    </div>
    
    <div class="integration-body">
      <p>{{ integration.description }}</p>
      
      <div class="integration-metrics">
        <div class="metric">
          <span class="label">API Calls</span>
          <span class="value">{{ integration.apiCalls }}</span>
        </div>
        <div class="metric">
          <span class="label">Last Sync</span>
          <span class="value">{{ formatDate(integration.lastSync) }}</span>
        </div>
      </div>
    </div>
    
    <div class="integration-actions">
      <Button @click="$emit('configure')" variant="outline">
        Configure
      </Button>
      <Button @click="$emit('test')" variant="primary">
        Test
      </Button>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue'
import { StatusBadge, Button } from '@friggframework/ui-vue'

export default {
  name: 'IntegrationCard',
  components: { StatusBadge, Button },
  props: {
    integration: {
      type: Object,
      required: true
    }
  },
  emits: ['configure', 'test'],
  setup(props) {
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString()
    }
    
    return {
      formatDate
    }
  }
}
</script>
```

### @friggframework/ui (React)

React-specific implementation with hooks and components.

#### Hooks

```javascript
// useApiClient hook
function useApiClient(config?) {
  return {
    // State
    loading: boolean,
    error: Error | null,
    hasError: boolean,
    
    // Authentication  
    login: (username: string, password: string) => Promise<AuthResult>,
    logout: () => void,
    
    // Integrations
    listIntegrations: (params?) => Promise<Integration[]>,
    createIntegration: (data) => Promise<Integration>,
    updateIntegration: (id, data) => Promise<Integration>,
    deleteIntegration: (id) => Promise<void>,
    
    // Authorization
    getAuthorizeRequirements: (integrationId) => Promise<AuthRequirements>,
    authorize: (integrationId, params) => Promise<AuthResult>,
    
    // Data operations
    getSampleData: (integrationId, category?) => Promise<any>,
    getUserActions: (integrationId) => Promise<UserAction[]>,
    submitUserAction: (integrationId, action, params) => Promise<any>,
    
    // Utilities
    clearError: () => void
  }
}
```

```javascript
// useToast hook
function useToast() {
  return {
    // State
    toasts: Toast[],
    
    // Display methods
    toast: (options: ToastOptions) => string,
    success: (message: string, options?) => string,
    error: (message: string, options?) => string,
    warning: (message: string, options?) => string,
    info: (message: string, options?) => string,
    
    // Management
    dismiss: (id: string) => void,
    dismissAll: () => void,
    clear: () => void
  }
}
```

#### Components

```jsx
// IntegrationCard component
import React from 'react';
import { StatusBadge, Button } from '@friggframework/ui';

interface IntegrationCardProps {
  integration: Integration;
  onConfigure: () => void;
  onTest: () => void;
}

export function IntegrationCard({ 
  integration, 
  onConfigure, 
  onTest 
}: IntegrationCardProps) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString();
  };
  
  return (
    <div className="integration-card">
      <div className="integration-header">
        <img src={integration.logo} alt={integration.name} />
        <h3>{integration.name}</h3>
        <StatusBadge status={integration.status} />
      </div>
      
      <div className="integration-body">
        <p>{integration.description}</p>
        
        <div className="integration-metrics">
          <div className="metric">
            <span className="label">API Calls</span>
            <span className="value">{integration.apiCalls}</span>
          </div>
          <div className="metric">
            <span className="label">Last Sync</span>
            <span className="value">{formatDate(integration.lastSync)}</span>
          </div>
        </div>
      </div>
      
      <div className="integration-actions">
        <Button onClick={onConfigure} variant="outline">
          Configure
        </Button>
        <Button onClick={onTest} variant="primary">
          Test
        </Button>
      </div>
    </div>
  );
}
```

### @friggframework/ui-angular

Angular-specific implementation with services and components.

#### Services

```typescript
// FriggApiService
@Injectable({
  providedIn: 'root'
})
export class FriggApiService {
  constructor(private http: HttpClient) {}
  
  // Authentication
  login(username: string, password: string): Observable<AuthResult>
  logout(): void
  
  // Integrations
  listIntegrations(params?: any): Observable<Integration[]>
  createIntegration(data: any): Observable<Integration>
  updateIntegration(id: string, data: any): Observable<Integration>
  deleteIntegration(id: string): Observable<void>
  
  // Authorization
  getAuthorizeRequirements(integrationId: string): Observable<AuthRequirements>
  authorize(integrationId: string, params: any): Observable<AuthResult>
  
  // Data operations
  getSampleData(integrationId: string, category?: string): Observable<any>
  getUserActions(integrationId: string): Observable<UserAction[]>
  submitUserAction(integrationId: string, action: string, params: any): Observable<any>
}
```

```typescript
// ToastService
@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts$ = new BehaviorSubject<Toast[]>([]);
  
  get toasts(): Observable<Toast[]> {
    return this.toasts$.asObservable();
  }
  
  toast(options: ToastOptions): string
  success(message: string, options?: Partial<ToastOptions>): string
  error(message: string, options?: Partial<ToastOptions>): string
  warning(message: string, options?: Partial<ToastOptions>): string
  info(message: string, options?: Partial<ToastOptions>): string
  
  dismiss(id: string): void
  dismissAll(): void
  clear(): void
}
```

#### Components

```typescript
// IntegrationCardComponent
@Component({
  selector: 'frigg-integration-card',
  template: `
    <div class="integration-card">
      <div class="integration-header">
        <img [src]="integration.logo" [alt]="integration.name" />
        <h3>{{ integration.name }}</h3>
        <frigg-status-badge [status]="integration.status"></frigg-status-badge>
      </div>
      
      <div class="integration-body">
        <p>{{ integration.description }}</p>
        
        <div class="integration-metrics">
          <div class="metric">
            <span class="label">API Calls</span>
            <span class="value">{{ integration.apiCalls }}</span>
          </div>
          <div class="metric">
            <span class="label">Last Sync</span>
            <span class="value">{{ formatDate(integration.lastSync) }}</span>
          </div>
        </div>
      </div>
      
      <div class="integration-actions">
        <frigg-button (click)="configure.emit()" variant="outline">
          Configure
        </frigg-button>
        <frigg-button (click)="test.emit()" variant="primary">
          Test
        </frigg-button>
      </div>
    </div>
  `
})
export class IntegrationCardComponent {
  @Input() integration!: Integration;
  @Output() configure = new EventEmitter<void>();
  @Output() test = new EventEmitter<void>();
  
  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }
}
```

## Development Tools

### @friggframework/devtools

CLI and development utilities for Frigg Framework.

#### CLI Commands

```bash
# Project initialization
frigg init <project-name> [options]
  --template <framework>     # react, vue, angular, svelte
  --typescript               # Use TypeScript
  --git                      # Initialize git repository
  --install                  # Install dependencies

# Development server
frigg start [options]
  --port <port>              # Development server port
  --host <host>              # Development server host
  --https                    # Use HTTPS
  --open                     # Open browser automatically

# Building and deployment
frigg build [options]
  --environment <env>        # Target environment
  --optimize                 # Enable optimizations
  --analyze                  # Generate bundle analysis

frigg deploy [options]
  --environment <env>        # Target environment
  --frontend-only            # Deploy only frontend
  --backend-only             # Deploy only backend
  --dry-run                  # Show what would be deployed

# Integration management
frigg install <package> [options]
  --dev                      # Install as dev dependency
  --global                   # Install globally

frigg generate <type> <name> [options]
  --integration              # Generate integration template
  --component                # Generate component
  --page                     # Generate page component

# Infrastructure
frigg infra [command]
  create                     # Create infrastructure
  update                     # Update infrastructure
  destroy                    # Destroy infrastructure
  status                     # Show infrastructure status

# Utilities
frigg migrate [options]
  --from <framework>         # Source framework
  --to <framework>           # Target framework
  --analyze                  # Analyze migration complexity

frigg validate [options]
  --integration <name>       # Validate specific integration
  --all                      # Validate all integrations
```

#### Configuration Files

```javascript
// frigg.config.js
export default {
  // Project configuration
  project: {
    name: 'my-frigg-app',
    version: '1.0.0',
    description: 'My Frigg integration app'
  },
  
  // Framework configuration
  framework: {
    type: 'vue', // react, vue, angular, svelte
    version: '3',
    typescript: true
  },
  
  // API configuration
  api: {
    baseUrl: process.env.FRIGG_API_URL,
    timeout: 30000,
    retries: 3
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourceMaps: true,
    minify: true,
    target: 'es2020'
  },
  
  // Development configuration
  dev: {
    port: 3000,
    host: 'localhost',
    https: false,
    open: true
  },
  
  // Deployment configuration
  deploy: {
    provider: 'aws', // aws, gcp, azure, netlify, vercel
    region: 'us-east-1',
    environment: {
      development: {
        // Dev-specific config
      },
      production: {
        // Prod-specific config
      }
    }
  },
  
  // Integration configuration
  integrations: {
    // Integration-specific settings
  }
}
```

#### Infrastructure Configuration

```yaml
# serverless.yml (auto-generated)
service: frigg-app-${self:custom.projectName}

provider:
  name: aws
  runtime: nodejs18.x
  region: ${opt:region, 'us-east-1'}
  stage: ${opt:stage, 'dev'}
  
custom:
  projectName: my-frigg-app
  
functions:
  api:
    handler: src/backend/handler.main
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - websocket:
          route: $connect
      - websocket:
          route: $disconnect
      - websocket:
          route: $default

resources:
  Resources:
    # DynamoDB tables
    IntegrationsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:service}-integrations-${self:provider.stage}
        AttributeDefinitions:
          - AttributeName: id
            AttributeType: S
        KeySchema:
          - AttributeName: id
            KeyType: HASH
        BillingMode: PAY_PER_REQUEST
```

## Support Packages

### @friggframework/eslint-config

ESLint configuration for Frigg projects.

```javascript
// .eslintrc.js
module.exports = {
  extends: ['@friggframework/eslint-config'],
  rules: {
    // Project-specific rules
  }
}
```

### @friggframework/prettier-config

Prettier configuration for consistent code formatting.

```javascript
// prettier.config.js
module.exports = require('@friggframework/prettier-config')
```

### @friggframework/test

Testing utilities and configurations.

```javascript
// jest.config.js
module.exports = {
  preset: '@friggframework/test/jest-preset',
  testEnvironment: '@friggframework/test/test-environment'
}
```

## Configuration Reference

### Environment Variables

```bash
# Core API Configuration
FRIGG_API_URL=https://api.frigg.dev
FRIGG_API_KEY=your-api-key
FRIGG_JWT_SECRET=your-jwt-secret

# Database Configuration
FRIGG_DB_URL=mongodb://localhost:27017/frigg
FRIGG_DB_NAME=frigg

# Redis Configuration (optional)
FRIGG_REDIS_URL=redis://localhost:6379

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Encryption Configuration
FRIGG_ENCRYPTION_KEY=your-encryption-key

# Monitoring Configuration
FRIGG_MONITORING_ENABLED=true
FRIGG_LOG_LEVEL=info

# Development Configuration
NODE_ENV=development
DEBUG=frigg:*
```

### TypeScript Types

```typescript
// Core types
interface Integration {
  id: string;
  name: string;
  description: string;
  logo: string;
  status: 'active' | 'inactive' | 'error';
  type: string;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  lastSync?: string;
  apiCalls: number;
}

interface AuthRequirements {
  type: 'oauth2' | 'api-key' | 'basic';
  url?: string;
  params?: Record<string, any>;
  headers?: Record<string, string>;
}

interface AuthResult {
  success: boolean;
  user?: User;
  jwt?: string;
  error?: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'error' | 'warning' | 'info';
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface Alert {
  id: string;
  integrationId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved';
  title: string;
  description: string;
  timestamp: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
}
```

---

This API reference provides comprehensive documentation for all Frigg Framework packages. For specific implementation examples and tutorials, see the [Getting Started guides](../getting-started/) and [Tutorials section](../tutorials/).

**Need more details?** 
- 📖 [Core Concepts](./core-concepts.md) - Understand the underlying architecture
- 🧪 [Testing Guide](../tutorials/testing.md) - Learn how to test your integrations  
- 🔧 [Advanced Configuration](../tutorials/advanced-configuration.md) - Advanced setup options