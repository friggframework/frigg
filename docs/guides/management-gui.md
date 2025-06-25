# Frigg Management GUI Guide

## Overview

The Frigg Management GUI is a web-based interface for developing, testing, and managing your Frigg integrations locally. Launch it with `frigg ui` to access powerful visual tools that complement the CLI.

## Getting Started

### Launching the GUI

```bash
frigg ui
```

This will:
1. Start the management server on port 3001
2. Open your default browser
3. Connect to your local Frigg instance

### First Time Setup

On first launch, the GUI will guide you through:
- Detecting your Frigg project
- Loading existing integrations
- Setting up test users
- Configuring environment variables

## Interface Overview

### Dashboard

The main dashboard provides:

```
┌─────────────────────────────────────────────────────────────┐
│ Frigg Management UI                     Environment: Local   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ Active      │ │ Test Users  │ │ API Calls   │            │
│ │ Integrations│ │     3       │ │   1,234     │            │
│ │     5       │ └─────────────┘ └─────────────┘            │
│ └─────────────┘                                             │
│                                                             │
│ Quick Actions:                                              │
│ [+ Add Integration] [👤 Manage Users] [⚙️ Settings]        │
└─────────────────────────────────────────────────────────────┘
```

### Navigation Menu

- **Dashboard** - Overview and quick stats
- **Integrations** - Manage installed integrations
- **Connections** - Test and manage connections
- **Test Users** - Create and manage test identities
- **Environment** - Configure environment variables
- **Monitoring** - View logs and metrics
- **Code Gen** - Generate code from visual configs

## Core Features

### 1. Integration Management

#### Discovery & Installation

Browse and install available integrations:

```
┌─────────────────────────────────────────────────────────────┐
│ Integration Browser                                         │
├─────────────────────────────────────────────────────────────┤
│ 🔍 Search integrations...                                   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│ │ HubSpot        │ │ Salesforce     │ │ Slack          ││
│ │ CRM & Marketing│ │ CRM Platform   │ │ Communication  ││
│ │ [Install]      │ │ [Installed ✓]  │ │ [Install]      ││
│ └─────────────────┘ └─────────────────┘ └─────────────────┘│
│                                                             │
│ Categories: [All] [CRM] [Marketing] [Communication]         │
└─────────────────────────────────────────────────────────────┘
```

#### Configuration

Configure installed integrations visually:

```
┌─────────────────────────────────────────────────────────────┐
│ Configure: HubSpot                                          │
├─────────────────────────────────────────────────────────────┤
│ Authentication:                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Client ID:     [________________________]              ││
│ │ Client Secret: [________________________]              ││
│ │ Redirect URI:  http://localhost:3000/redirect/hubspot   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Options:                                                    │
│ ☑ Enable webhooks                                          │
│ ☑ Auto-refresh tokens                                      │
│ ☐ Debug mode                                               │
│                                                             │
│ [Test Connection] [Save Configuration]                      │
└─────────────────────────────────────────────────────────────┘
```

### 2. Test User Management

Create dummy users for testing integrations:

```
┌─────────────────────────────────────────────────────────────┐
│ Test Users                                                  │
├─────────────────────────────────────────────────────────────┤
│ [+ Create Test User]                                        │
├─────────────────────────────────────────────────────────────┤
│ 👤 John Doe (john@test.com)                                │
│    Connections: HubSpot ✓, Salesforce ✓                    │
│    [Manage] [Delete]                                        │
│                                                             │
│ 👤 Jane Smith (jane@test.com)                              │
│    Connections: Slack ✓                                     │
│    [Manage] [Delete]                                        │
└─────────────────────────────────────────────────────────────┘
```

#### Creating Test Connections

1. Select a test user
2. Choose integration to connect
3. Use test credentials or OAuth flow
4. Verify connection status

### 3. Connection Testing

Test API connections interactively:

```
┌─────────────────────────────────────────────────────────────┐
│ Connection Tester: HubSpot - John Doe                       │
├─────────────────────────────────────────────────────────────┤
│ Available Methods:                                          │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ ▼ Contacts                                              ││
│ │   • listContacts()                                      ││
│ │   • getContact(id)                                      ││
│ │   • createContact(data)                                 ││
│ │ ▼ Companies                                             ││
│ │   • listCompanies()                                     ││
│ │   • getCompany(id)                                      ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Test Panel:                                                 │
│ Method: listContacts()                                      │
│ Parameters: { limit: 10 }                                   │
│ [Run Test]                                                  │
│                                                             │
│ Response:                                                   │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ {                                                       ││
│ │   "results": [                                          ││
│ │     { "id": "123", "email": "contact@example.com" }    ││
│ │   ],                                                    ││
│ │   "total": 1                                            ││
│ │ }                                                       ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 4. Environment Variables

Visual environment variable editor:

```
┌─────────────────────────────────────────────────────────────┐
│ Environment Variables                                       │
├─────────────────────────────────────────────────────────────┤
│ Environment: [Local ▼] [Staging] [Production]              │
├─────────────────────────────────────────────────────────────┤
│ [+ Add Variable] [Import .env] [Export]                     │
├─────────────────────────────────────────────────────────────┤
│ HUBSPOT_CLIENT_ID      = abc123... [Edit] [Delete]         │
│ HUBSPOT_CLIENT_SECRET  = ••••••••• [Edit] [Delete]         │
│ SALESFORCE_INSTANCE    = na1       [Edit] [Delete]         │
│ API_BASE_URL          = /api/v1    [Edit] [Delete]         │
│                                                             │
│ [Save Changes] [Discard]                                    │
└─────────────────────────────────────────────────────────────┘
```

Features:
- Masked sensitive values
- Import/export .env files
- Multi-environment support
- AWS SSM sync for production

### 5. Code Generation

Generate code from visual configurations:

```
┌─────────────────────────────────────────────────────────────┐
│ Code Generator                                              │
├─────────────────────────────────────────────────────────────┤
│ What would you like to generate?                           │
│                                                             │
│ ○ Integration Scaffold                                      │
│ ● API Endpoint                                             │
│ ○ Webhook Handler                                          │
│ ○ Test Suite                                               │
├─────────────────────────────────────────────────────────────┤
│ Configure API Endpoint:                                     │
│                                                             │
│ Integration: [HubSpot ▼]                                    │
│ Operation:   [List Contacts ▼]                              │
│ Path:        /api/hubspot/contacts                          │
│ Method:      [GET ▼]                                        │
│                                                             │
│ Options:                                                    │
│ ☑ Include authentication                                    │
│ ☑ Add error handling                                        │
│ ☑ Include pagination                                        │
│                                                             │
│ [Generate Code]                                             │
└─────────────────────────────────────────────────────────────┘
```

Generated code preview:
```javascript
// Generated by Frigg Management UI
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/api/hubspot/contacts', requireAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const integration = await req.user.getIntegration('hubspot');
    
    const contacts = await integration.listContacts({
      offset: (page - 1) * limit,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: contacts.results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: contacts.total
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
```

### 6. Monitoring Dashboard

Real-time monitoring of your local instance:

```
┌─────────────────────────────────────────────────────────────┐
│ Monitoring - Local Development                              │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┐ ┌─────────────────────────────┐│
│ │ API Calls (Last Hour)   │ │ Response Times             ││
│ │ ▁▃▅▇▅▃▁▃▅▇█▇▅▃         │ │ Avg: 45ms                  ││
│ │ Total: 1,234            │ │ P95: 120ms                 ││
│ └─────────────────────────┘ └─────────────────────────────┘│
│                                                             │
│ Recent Activity:                                            │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 12:34:56 GET /api/hubspot/contacts         200  35ms   ││
│ │ 12:34:45 POST /api/salesforce/lead         201  89ms   ││
│ │ 12:34:12 GET /api/slack/channels           200  23ms   ││
│ │ 12:33:58 PUT /api/hubspot/contact/123      200  67ms   ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ [Clear Logs] [Export] [Settings]                            │
└─────────────────────────────────────────────────────────────┘
```

## Advanced Features

### Workflow Builder

Create multi-step integration workflows visually:

1. Drag and drop integration actions
2. Connect data flow between steps
3. Add conditions and transformations
4. Generate workflow code

### API Explorer

Interactive API documentation and testing:

- Browse all available endpoints
- Test with real data
- View request/response examples
- Generate client code

### Performance Profiler

Analyze integration performance:

- Identify slow API calls
- Monitor memory usage
- Track rate limits
- Optimize bottlenecks

## Keyboard Shortcuts

- `Ctrl/Cmd + K` - Quick command palette
- `Ctrl/Cmd + S` - Save current configuration
- `Ctrl/Cmd + T` - New test user
- `Ctrl/Cmd + E` - Environment variables
- `Ctrl/Cmd + /` - Toggle help

## Settings

### UI Preferences

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                                    │
├─────────────────────────────────────────────────────────────┤
│ Appearance:                                                 │
│ Theme: [Auto ▼] Light | Dark                                │
│                                                             │
│ Developer:                                                  │
│ ☑ Show advanced options                                     │
│ ☑ Enable debug console                                      │
│ ☐ Auto-save configurations                                  │
│                                                             │
│ Performance:                                                │
│ ☑ Cache API responses                                       │
│ ☐ Disable animations                                        │
│                                                             │
│ [Save Settings]                                             │
└─────────────────────────────────────────────────────────────┘
```

## Tips & Best Practices

### Development Workflow

1. **Start with the GUI** to explore and test
2. **Use test users** for safe experimentation
3. **Generate code** for common patterns
4. **Monitor performance** during development
5. **Export configurations** for team sharing

### Testing Strategy

1. Create dedicated test users per scenario
2. Use the connection tester before coding
3. Monitor API calls for debugging
4. Export test data for unit tests

### Team Collaboration

Share configurations with your team:

```bash
# Export current setup
frigg manage export --output team-config.json

# Import on another machine
frigg manage import team-config.json
```

## Troubleshooting

### GUI Won't Start

```bash
# Check if port is in use
lsof -i :3001

# Use different port
frigg ui --port 3002
```

### Connection Issues

1. Verify Frigg backend is running
2. Check browser console for errors
3. Ensure environment variables are set
4. Test with `frigg start` first

### Performance Issues

1. Clear browser cache
2. Disable unnecessary monitoring
3. Reduce API call logging
4. Check system resources

## Integration with CLI

The GUI complements CLI commands:

```bash
# Changes made in GUI are reflected in CLI
frigg env list  # Shows variables set in GUI
frigg manage list  # Shows integrations added via GUI
```

## Next Steps

- Watch [Video Tutorial: GUI Walkthrough](/docs/tutorials/gui-walkthrough.md)
- Read [API Testing Guide](/docs/guides/api-testing.md)
- Learn [Workflow Automation](/docs/guides/workflow-automation.md)
- Join [Community Forum](https://community.frigg.io)