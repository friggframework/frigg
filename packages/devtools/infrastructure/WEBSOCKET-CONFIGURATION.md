# WebSocket Configuration for Frigg Applications

## Overview

WebSockets in Frigg applications are now **disabled by default** and can be enabled through the AppDefinition configuration. This allows applications that don't need real-time communication to avoid deploying unnecessary WebSocket infrastructure.

## Enabling WebSockets

To enable WebSocket support in your Frigg application, add the `websockets` configuration to your AppDefinition:

```javascript
// backend/index.js
const appDefinition = {
    integrations: [YourIntegration],
    websockets: {
        enable: true  // Enable WebSocket support
    },
    // ... other configuration
};

module.exports = {
    Definition: appDefinition,
};
```

## What Happens When WebSockets Are Enabled

When you set `websockets.enable: true`, the following resources are deployed:

1. **WebSocket API Gateway** - AWS API Gateway WebSocket endpoint
2. **Lambda Functions** - Handlers for `$connect`, `$disconnect`, and `$default` routes
3. **Database Collection** - MongoDB collection to store active WebSocket connections
4. **Environment Variable** - `WEBSOCKET_API_ENDPOINT` is automatically configured

## Using WebSockets in Your Application

Once enabled, you can use the `WebsocketConnection` model to send messages to connected clients:

```javascript
const { WebsocketConnection } = require('@friggframework/core');

// Get all active connections and send a message
const connections = await WebsocketConnection.getActiveConnections();
for (const connection of connections) {
    await connection.send({
        type: 'update',
        data: { message: 'Hello from server!' }
    });
}
```

## Default Behavior (WebSockets Disabled)

When websockets are disabled (the default):
- No WebSocket infrastructure is deployed
- `WebsocketConnection.getActiveConnections()` returns an empty array
- No `WEBSOCKET_API_ENDPOINT` environment variable is set
- No additional Lambda functions or API Gateway resources are created

## Use Cases for WebSockets

Enable WebSockets when you need:
- Real-time updates for integration sync status
- Live streaming of data processing progress
- Push notifications to connected clients
- Real-time collaboration features

## Cost Considerations

Disabling WebSockets by default helps reduce costs by:
- Avoiding API Gateway WebSocket charges when not needed
- Reducing Lambda function invocations
- Eliminating unnecessary database operations for connection management

## Migration Guide

If you have an existing Frigg application that uses WebSockets:

1. Add the websockets configuration to your AppDefinition:
   ```javascript
   websockets: {
       enable: true
   }
   ```

2. Redeploy your application:
   ```bash
   npx frigg deploy
   ```

Your WebSocket functionality will continue to work as before.

## Troubleshooting

### WebSocket Connection Errors
If you see errors related to WebSocket connections, ensure:
1. WebSockets are enabled in your AppDefinition
2. The application has been redeployed after enabling WebSockets
3. The `WEBSOCKET_API_ENDPOINT` environment variable is set (automatically done during deployment)

### WebsocketConnection.getActiveConnections() Returns Empty Array
This is expected behavior when:
- WebSockets are disabled (default)
- No clients are currently connected
- The `WEBSOCKET_API_ENDPOINT` environment variable is not set