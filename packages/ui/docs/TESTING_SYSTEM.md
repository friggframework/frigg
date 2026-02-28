# Frigg UI Library Testing System

The Frigg UI Library provides a comprehensive testing system designed to help developers test and explore their integrations during local development. This system includes components for testing user actions, system actions, and various integration workflows.

## Overview

The testing system consists of several key components:

- **UserActionTester**: Test user-facing actions with form rendering and JSONForms integration
- **SystemActionsTester**: Test system-level actions like webhooks, polling, and queue workers
- **TestingDashboard**: Unified interface combining all testing tools
- **MockDataGenerator**: Generate realistic test data for integrations
- **QuickActionsPanel**: Common operations and shortcuts for rapid testing

## Quick Start

### Basic Usage

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

### Individual Components

```jsx
import { 
  UserActionTester, 
  SystemActionsTester 
} from '@friggframework/ui';

function CustomTestingPage() {
  return (
    <div>
      <UserActionTester
        friggBaseUrl="http://localhost:3000"
        authToken="your-jwt-token"
      />
      <SystemActionsTester
        friggBaseUrl="http://localhost:3000"
        authToken="your-jwt-token"
      />
    </div>
  );
}
```

## Components

### UserActionTester

The `UserActionTester` component provides a comprehensive interface for testing user-facing actions in your integrations.

#### Features

- **Form Rendering**: Automatic form generation using JSONForms schemas
- **Multiple Display Modes**: JSON, Card, Table, and Form views
- **Real-time Validation**: Form validation with immediate feedback
- **Integration Selection**: Choose from available integrations
- **Action Configuration**: Configure action parameters and inputs

#### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `friggBaseUrl` | string | Yes | Base URL for the Frigg backend |
| `authToken` | string | Yes | JWT token for authentication |
| `testSession` | object | No | Test session data for tracking |
| `onActionExecuted` | function | No | Callback when an action is executed |

#### Example

```jsx
<UserActionTester
  friggBaseUrl="http://localhost:3000"
  authToken="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  onActionExecuted={(action, result) => {
    console.log('Action executed:', action, result);
  }}
/>
```

### SystemActionsTester

The `SystemActionsTester` component allows you to test system-level actions that typically run in the background.

#### Features

- **Webhook Simulation**: Trigger webhook events with custom payloads
- **Polling Control**: Start/stop polling processes
- **Queue Worker Execution**: Execute background queue jobs
- **Lifecycle Events**: Trigger integration lifecycle events
- **Real-time Logging**: View execution logs and results

#### Supported System Actions

1. **Webhook Trigger**
   - Simulate incoming webhook events
   - Configure event type, payload, headers, and query parameters
   - Test webhook handling logic

2. **Polling Process**
   - Start/stop polling for data changes
   - Configure polling intervals and filters
   - Monitor polling status

3. **Queue Worker**
   - Execute background queue jobs
   - Configure job types and priorities
   - Test job processing logic

4. **Lifecycle Events**
   - Trigger integration lifecycle events
   - Test ON_CREATE, ON_UPDATE, ON_DELETE events
   - Configure event data

#### Example

```jsx
<SystemActionsTester
  friggBaseUrl="http://localhost:3000"
  authToken="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  onActionExecuted={(action, result) => {
    console.log('System action executed:', action, result);
  }}
/>
```

### TestingDashboard

The `TestingDashboard` provides a unified interface combining all testing tools with additional features.

#### Features

- **Tabbed Interface**: Organized tabs for different test types
- **Test Session Management**: Track and manage test sessions
- **Data Export/Import**: Export test results and import test configurations
- **Fullscreen Mode**: Full-screen testing interface
- **Quick Actions**: Common operations and shortcuts

#### Tabs

1. **User Actions**: Full UserActionTester interface
2. **System Actions**: Full SystemActionsTester interface
3. **Quick Actions**: Common operations and shortcuts
4. **Mock Data**: Mock data generation and testing

#### Example

```jsx
<TestingDashboard
  friggBaseUrl="http://localhost:3000"
  authToken="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
/>
```

## API Endpoints

The testing system requires several API endpoints to be implemented in your Frigg backend:

### User Actions

- `GET /api/integrations` - List user's integrations
- `POST /api/integrations/{id}/actions` - Get available user actions
- `POST /api/integrations/{id}/actions/{action}/options` - Get action options/form schema
- `POST /api/integrations/{id}/actions/{action}` - Execute user action

### System Actions

- `GET /api/integrations/{id}/system-actions` - Get available system actions
- `POST /api/integrations/{id}/system-actions/{type}` - Execute system action
- `POST /api/integrations/{id}/webhooks/trigger` - Trigger webhook event
- `POST /api/integrations/{id}/polling` - Start/stop polling
- `POST /api/integrations/{id}/queue-worker` - Execute queue worker
- `POST /api/integrations/{id}/lifecycle-events` - Trigger lifecycle event
- `GET /api/integrations/{id}/system-actions/logs` - Get system action logs

### Example Backend Implementation

```javascript
// Express.js example
app.get('/api/integrations/:id/system-actions', async (req, res) => {
  const { id } = req.params;
  
  // Return available system actions for the integration
  res.json({
    actions: [
      {
        id: 'webhook',
        name: 'Webhook Trigger',
        description: 'Simulate incoming webhook events',
        type: 'webhook',
        config: {
          eventType: 'data.updated',
          payload: {},
          headers: {},
          queryParams: {}
        }
      },
      // ... more actions
    ]
  });
});

app.post('/api/integrations/:id/system-actions/:type', async (req, res) => {
  const { id, type } = req.params;
  const config = req.body;
  
  try {
    // Execute the system action based on type
    const result = await executeSystemAction(id, type, config);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Form Integration

The testing system integrates with JSONForms for dynamic form generation. When your integration returns a JSONForms schema, the components will automatically render appropriate form controls.

### JSONForms Schema Example

```json
{
  "jsonSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "title": "Name",
        "minLength": 1
      },
      "email": {
        "type": "string",
        "title": "Email",
        "format": "email"
      },
      "age": {
        "type": "number",
        "title": "Age",
        "minimum": 0,
        "maximum": 120
      }
    },
    "required": ["name", "email"]
  },
  "uiSchema": {
    "name": {
      "ui:placeholder": "Enter your name"
    },
    "email": {
      "ui:widget": "email"
    },
    "age": {
      "ui:widget": "updown"
    }
  }
}
```

## Test Session Management

The testing system includes session management features to help you track and organize your testing activities.

### Starting a Test Session

```jsx
const [testSession, setTestSession] = useState(null);

const startTestSession = () => {
  const session = {
    id: `test-${Date.now()}`,
    startTime: new Date().toISOString(),
    actions: [],
    results: []
  };
  setTestSession(session);
};
```

### Tracking Actions

```jsx
const handleActionExecuted = (action, result) => {
  if (testSession) {
    setTestSession(prev => ({
      ...prev,
      actions: [...prev.actions, { 
        type: 'user-action', 
        action, 
        timestamp: new Date().toISOString() 
      }],
      results: [...prev.results, { 
        type: 'user-action', 
        action, 
        result, 
        timestamp: new Date().toISOString() 
      }]
    }));
  }
};
```

### Exporting Test Data

```jsx
const exportTestSession = () => {
  if (!testSession) return;
  
  const dataStr = JSON.stringify(testSession, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `frigg-test-session-${testSession.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
};
```

## Mock Data Generation

The testing system includes a mock data generator to help you test different scenarios and data structures.

### Available Templates

1. **User Profile**: Generate realistic user profile data
2. **Product Catalog**: Generate product catalog data
3. **API Response**: Generate typical API response structures

### Custom Templates

You can create custom data templates by extending the `dataTemplates` array:

```javascript
const customTemplate = {
  id: 'custom-data',
  name: 'Custom Data',
  description: 'Generate custom data for testing',
  schema: {
    type: 'object',
    properties: {
      // Your custom schema
    }
  }
};
```

## Best Practices

### 1. Use Test Sessions

Always use test sessions when performing multiple tests to track your progress and results.

### 2. Test Different Scenarios

Use the mock data generator to test various data structures and edge cases.

### 3. Monitor System Actions

Use the system actions tester to understand how your integration behaves under different system conditions.

### 4. Export Test Results

Regularly export your test results to document your testing process and share findings with your team.

### 5. Use Form Rendering

When possible, use the form rendering capabilities to test how your integration handles different input types and validation rules.

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure your JWT token is valid and has the necessary permissions.

2. **API Endpoint Not Found**: Verify that your Frigg backend implements the required API endpoints.

3. **Form Not Rendering**: Check that your integration returns a valid JSONForms schema.

4. **System Actions Not Working**: Ensure your integration implements the necessary event handlers.

### Debug Mode

Enable debug mode by adding `?debug=true` to your URL to see additional logging information.

## Contributing

To contribute to the testing system:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

The Frigg UI Library Testing System is licensed under the MIT License. See the LICENSE file for details.