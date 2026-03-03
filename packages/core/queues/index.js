const { QueuerUtil } = require('./queuer-util');
const { QueueProvider } = require('./queue-provider');
const { QueueClientInterface } = require('./queue-client-interface');
const {
    createQueueProvider,
    determineProvider,
    QUEUE_PROVIDERS,
} = require('./queue-provider-factory');
const {
    NetlifyBackgroundProvider,
    QStashQueueProvider,
} = require('./providers');

module.exports = {
    QueuerUtil,
    QueueProvider,
    QueueClientInterface,
    createQueueProvider,
    determineProvider,
    QUEUE_PROVIDERS,
    // SqsQueueProvider is lazy — avoids eagerly loading @aws-sdk/client-sqs
    get SqsQueueProvider() {
        return require('@friggframework/provider-aws').SqsQueueProvider;
    },
    NetlifyBackgroundProvider,
    QStashQueueProvider,
};
