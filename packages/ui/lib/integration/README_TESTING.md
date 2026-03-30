# Frigg UI Library - Testing Components

This directory contains comprehensive testing components for the Frigg UI Library, designed to help developers test and explore their integrations during local development.

## Components Overview

### 🧪 UserActionTester
Test user-facing actions with form rendering and JSONForms integration.

**Features:**
- Form-based input with JSONForms
- Multiple display modes (JSON, Card, Table, Form)
- Real-time form validation
- Integration with existing Form component

### ⚡ SystemActionsTester
Test system-level actions like webhooks, polling, and queue workers.

**Features:**
- Webhook event simulation
- Polling process control
- Queue worker execution
- Lifecycle event triggering
- Real-time logging

### 🎛️ TestingDashboard
Unified interface combining all testing tools with session management.

**Features:**
- Tabbed interface for different test types
- Test session management
- Data export/import functionality
- Quick actions panel
- Fullscreen mode

### 🎲 MockDataGenerator
Generate realistic test data for your integrations.

**Features:**
- Schema-based data generation
- Multiple data templates
- Realistic test data creation
- API response simulation

## Quick Start

```jsx
import { TestingDashboard } from '@friggframework/ui';

function MyApp() {
  return (
    <TestingDashboard
      friggBaseUrl="http://localhost:3000"
      authToken="your-jwt-token"
    />
  );
}
```

## Demo

Run the demo to see all components in action:

```jsx
import { TestingDemo } from '@friggframework/ui';

function App() {
  return <TestingDemo />;
}
```

## API Requirements

The testing components require these API endpoints in your Frigg backend:

### User Actions
- `GET /api/integrations` - List integrations
- `POST /api/integrations/{id}/actions` - Get user actions
- `POST /api/integrations/{id}/actions/{action}/options` - Get action options
- `POST /api/integrations/{id}/actions/{action}` - Execute action

### System Actions
- `GET /api/integrations/{id}/system-actions` - Get system actions
- `POST /api/integrations/{id}/system-actions/{type}` - Execute system action
- `POST /api/integrations/{id}/webhooks/trigger` - Trigger webhook
- `POST /api/integrations/{id}/polling` - Control polling
- `POST /api/integrations/{id}/queue-worker` - Execute queue worker
- `POST /api/integrations/{id}/lifecycle-events` - Trigger lifecycle event

## Documentation

For detailed documentation, see:
- [Testing System Documentation](../docs/TESTING_SYSTEM.md)
- [API Reference](../docs/API_REFERENCE.md)
- [Component Examples](../docs/EXAMPLES.md)

## Examples

### Basic User Action Testing

```jsx
import { UserActionTester } from '@friggframework/ui';

function TestPage() {
  return (
    <UserActionTester
      friggBaseUrl="http://localhost:3000"
      authToken="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      onActionExecuted={(action, result) => {
        console.log('Action executed:', action, result);
      }}
    />
  );
}
```

### System Action Testing

```jsx
import { SystemActionsTester } from '@friggframework/ui';

function SystemTestPage() {
  return (
    <SystemActionsTester
      friggBaseUrl="http://localhost:3000"
      authToken="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      onActionExecuted={(action, result) => {
        console.log('System action executed:', action, result);
      }}
    />
  );
}
```

### Custom Testing Interface

```jsx
import { 
  UserActionTester, 
  SystemActionsTester,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@friggframework/ui';

function CustomTestingInterface() {
  return (
    <Tabs defaultValue="user-actions">
      <TabsList>
        <TabsTrigger value="user-actions">User Actions</TabsTrigger>
        <TabsTrigger value="system-actions">System Actions</TabsTrigger>
      </TabsList>
      
      <TabsContent value="user-actions">
        <UserActionTester
          friggBaseUrl="http://localhost:3000"
          authToken="your-token"
        />
      </TabsContent>
      
      <TabsContent value="system-actions">
        <SystemActionsTester
          friggBaseUrl="http://localhost:3000"
          authToken="your-token"
        />
      </TabsContent>
    </Tabs>
  );
}
```

## Development

To contribute to the testing components:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.