const { createHandler } = require('@friggframework/core');
const { createWebsocketConnectionRepository } = require('../../database/websocket-connection-repository-factory');

const websocketConnectionRepository = createWebsocketConnectionRepository();

const handleWebSocketConnection = async (event, context) => {
    // Handle different WebSocket events
    switch (event.requestContext.eventType) {
        case 'CONNECT':
            // Handle new connection
            try {
                const connectionId = event.requestContext.connectionId;
                await websocketConnectionRepository.createConnection(connectionId);
                console.log(`Stored new connection: ${connectionId}`);
                return { statusCode: 200, body: 'Connected.' };
            } catch (error) {
                console.error('Error storing connection:', error);
                return { statusCode: 500, body: 'Error connecting.' };
            }

        case 'DISCONNECT':
            // Handle disconnection
            try {
                const connectionId = event.requestContext.connectionId;
                await websocketConnectionRepository.deleteConnection(connectionId);
                console.log(`Removed connection: ${connectionId}`);
                return { statusCode: 200, body: 'Disconnected.' };
            } catch (error) {
                console.error('Error removing connection:', error);
                return { statusCode: 500, body: 'Error disconnecting.' };
            }

        case 'MESSAGE':
            // Handle incoming message
            const message = JSON.parse(event.body);
            console.log('Received message:', message);

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
