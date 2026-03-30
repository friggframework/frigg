const { mongoose } = require('../mongoose');
const {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
} = require('@aws-sdk/client-apigatewaymanagementapi');

const schema = new mongoose.Schema({
    connectionId: { type: mongoose.Schema.Types.String },
});

// Add a static method to get active connections
schema.statics.getActiveConnections = async function () {
    try {
        // Return empty array if websockets are not configured
        if (!process.env.WEBSOCKET_API_ENDPOINT) {
            return [];
        }

        const connections = await this.find({}, 'connectionId');
        return connections.map((conn) => ({
            connectionId: conn.connectionId,
            send: async (data) => {
                const apigwManagementApi = new ApiGatewayManagementApiClient({
                    endpoint: process.env.WEBSOCKET_API_ENDPOINT,
                });

                try {
                    const command = new PostToConnectionCommand({
                        ConnectionId: conn.connectionId,
                        Data: JSON.stringify(data),
                    });
                    await apigwManagementApi.send(command);
                } catch (error) {
                    if (
                        error.statusCode === 410 ||
                        error.$metadata?.httpStatusCode === 410
                    ) {
                        console.log(`Stale connection ${conn.connectionId}`);
                        await this.deleteOne({
                            connectionId: conn.connectionId,
                        });
                    } else {
                        throw error;
                    }
                }
            },
        }));
    } catch (error) {
        console.error('Error getting active connections:', error);
        throw error;
    }
};

const WebsocketConnection =
    mongoose.models.WebsocketConnection ||
    mongoose.model('WebsocketConnection', schema);

module.exports = { WebsocketConnection };
