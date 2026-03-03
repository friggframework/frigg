const { mongoose } = require('../mongoose');
const {
    StaleConnectionError,
} = require('../../websocket/websocket-message-sender-interface');

// Default message sender lazy-loaded to avoid pulling in AWS SDK on non-AWS platforms.
let _defaultMessageSender = null;
function getDefaultMessageSender() {
    if (!_defaultMessageSender) {
        const { ApiGatewayMessageSender } =
            require('@friggframework/provider-aws');
        _defaultMessageSender = new ApiGatewayMessageSender();
    }
    return _defaultMessageSender;
}

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

        const sender = getDefaultMessageSender();
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
