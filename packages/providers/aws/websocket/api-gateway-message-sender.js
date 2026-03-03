/**
 * API Gateway WebSocket Message Sender (Adapter)
 *
 * AWS API Gateway Management API implementation of WebSocketMessageSenderInterface.
 * Sends messages to active WebSocket connections via API Gateway.
 */

const {
    WebSocketMessageSenderInterface,
    StaleConnectionError,
} = require('@friggframework/core/websocket/websocket-message-sender-interface');

// Cache clients per endpoint to avoid recreating on every send()
const _clientCache = new Map();

function getApiGatewayClient(endpoint) {
    if (!_clientCache.has(endpoint)) {
        const {
            ApiGatewayManagementApiClient,
        } = require('@aws-sdk/client-apigatewaymanagementapi');
        _clientCache.set(
            endpoint,
            new ApiGatewayManagementApiClient({ endpoint })
        );
    }
    return _clientCache.get(endpoint);
}

class ApiGatewayMessageSender extends WebSocketMessageSenderInterface {
    /**
     * Send data to a WebSocket connection via API Gateway Management API
     *
     * @param {string} connectionId - The WebSocket connection ID
     * @param {*} data - Data to send (will be JSON-serialized)
     * @param {string} endpoint - The WebSocket API endpoint URL
     * @returns {Promise<void>}
     * @throws {StaleConnectionError} If connection returns 410 Gone
     */
    async send(connectionId, data, endpoint) {
        const {
            PostToConnectionCommand,
        } = require('@aws-sdk/client-apigatewaymanagementapi');

        const client = getApiGatewayClient(endpoint);

        try {
            const command = new PostToConnectionCommand({
                ConnectionId: connectionId,
                Data: JSON.stringify(data),
            });
            await client.send(command);
        } catch (error) {
            if (
                error.statusCode === 410 ||
                error.$metadata?.httpStatusCode === 410
            ) {
                throw new StaleConnectionError(connectionId);
            }
            throw error;
        }
    }
}

module.exports = { ApiGatewayMessageSender };
