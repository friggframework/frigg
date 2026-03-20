import { createHandler } from '../../core/create-handler';
import type { LambdaEvent, LambdaContext, LambdaResponse } from '../../core/create-handler';

// JS module not yet converted
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createWebsocketConnectionRepository } = require('../../database/websocket-connection-repository-factory');

const websocketConnectionRepository = createWebsocketConnectionRepository();

interface WebSocketEvent extends LambdaEvent {
    requestContext: {
        eventType: 'CONNECT' | 'DISCONNECT' | 'MESSAGE';
        connectionId: string;
    };
    body?: string;
}

const handleWebSocketConnection = async (
    event: WebSocketEvent,
    _context: LambdaContext
): Promise<LambdaResponse> => {
    // Handle different WebSocket events
    switch (event.requestContext.eventType) {
        case 'CONNECT':
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
            try {
                const connectionId = event.requestContext.connectionId;
                await websocketConnectionRepository.deleteConnection(connectionId);
                console.log(`Removed connection: ${connectionId}`);
                return { statusCode: 200, body: 'Disconnected.' };
            } catch (error) {
                console.error('Error removing connection:', error);
                return { statusCode: 500, body: 'Error disconnecting.' };
            }

        case 'MESSAGE': {
            const message = JSON.parse(event.body || '{}');
            console.log('Received message:', message);

            const responseMessage = { message: 'Message received' };
            return {
                statusCode: 200,
                body: JSON.stringify(responseMessage),
            };
        }

        default:
            return { statusCode: 400, body: 'Unhandled event type.' };
    }
};

const handler = createHandler({
    eventName: 'WebSocket Event',
    method: handleWebSocketConnection as any,
});

export { handler };

