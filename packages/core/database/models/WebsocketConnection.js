/**
 * WebsocketConnection Mongoose Model
 *
 * BREAKING CHANGE (v3): Call WebsocketConnection.setMessageSender() before
 * using getActiveConnections(). For AWS API Gateway, pass
 * `new ApiGatewayMessageSender()` from @friggframework/provider-aws.
 * See docs/architecture-decisions/010-decouple-aws-from-core.md for migration guide.
 */
const { mongoose } = require('../mongoose');
const {
    StaleConnectionError,
} = require('../../websocket/websocket-message-sender-interface');

let _messageSender = null;

const schema = new mongoose.Schema({
    connectionId: { type: mongoose.Schema.Types.String },
});

/**
 * Set the message sender for WebSocket send functionality.
 * Must be called before getActiveConnections().
 * @param {WebSocketMessageSenderInterface} sender
 */
schema.statics.setMessageSender = function (sender) {
    _messageSender = sender;
};

// Add a static method to get active connections
schema.statics.getActiveConnections = async function () {
    try {
        // Return empty array if websockets are not configured
        if (!process.env.WEBSOCKET_API_ENDPOINT) {
            return [];
        }

        if (!_messageSender) {
            throw new Error(
                'WebsocketConnection requires a message sender. Call WebsocketConnection.setMessageSender() first, e.g.:\n' +
                '  const { ApiGatewayMessageSender } = require("@friggframework/provider-aws");\n' +
                '  WebsocketConnection.setMessageSender(new ApiGatewayMessageSender());\n' +
                'See docs/architecture-decisions/010-decouple-aws-from-core.md for migration guide.'
            );
        }

        const sender = _messageSender;
        const connections = await this.find({}, 'connectionId');
        return connections.map((conn) => ({
            connectionId: conn.connectionId,
            send: async (data) => {
                try {
                    await sender.send(
                        conn.connectionId,
                        data,
                        process.env.WEBSOCKET_API_ENDPOINT
                    );
                } catch (error) {
                    if (error instanceof StaleConnectionError) {
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
