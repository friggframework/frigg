const { createHandler } = require('@friggframework/core');
const { createWebsocketConnectionRepository } = require('../../database/websocket-connection-repository-factory');
const { getLogger } = require('../../logs');

const log = getLogger('frigg.websocket');

const websocketConnectionRepository = createWebsocketConnectionRepository();

const handleWebSocketConnection = async (event, context) => {
    // Handle different WebSocket events
    switch (event.requestContext.eventType) {
        case 'CONNECT':
            // Handle new connection
            try {
                const connectionId = event.requestContext.connectionId;
                await websocketConnectionRepository.createConnection(connectionId);
                log.info('Stored new connection', {
                    eventName: 'frigg.websocket.connected',
                    connectionId,
                });
                return { statusCode: 200, body: 'Connected.' };
            } catch (error) {
                log.error('Error storing connection', {
                    eventName: 'frigg.websocket.connect_failed',
                    error,
                });
                return { statusCode: 500, body: 'Error connecting.' };
            }

        case 'DISCONNECT':
            // Handle disconnection
            try {
                const connectionId = event.requestContext.connectionId;
                await websocketConnectionRepository.deleteConnection(connectionId);
                log.info('Removed connection', {
                    eventName: 'frigg.websocket.disconnected',
                    connectionId,
                });
                return { statusCode: 200, body: 'Disconnected.' };
            } catch (error) {
                log.error('Error removing connection', {
                    eventName: 'frigg.websocket.disconnect_failed',
                    error,
                });
                return { statusCode: 500, body: 'Error disconnecting.' };
            }

        case 'MESSAGE':
            // Handle incoming message
            // Parsed only to keep the old failure on a body that is not JSON.
            JSON.parse(event.body);
            log.info('Received message', {
                eventName: 'frigg.websocket.message_received',
                connectionId: event.requestContext.connectionId,
                bodyLength: event.body?.length ?? 0,
            });

            // Process the message and send a response
            const responseMessage = { message: 'Message received' };
            return {
                statusCode: 200,
                body: JSON.stringify(responseMessage),
            };

        default:
            return { statusCode: 400, body: 'Unhandled event type.' };
    }
};

const handler = createHandler({
    eventName: 'WebSocket Event',
    method: handleWebSocketConnection,
    shouldUseDatabase: true, // Set to true as we're using the database
    isUserFacingResponse: true, // This is a server-to-server response
});

module.exports = { handler };
