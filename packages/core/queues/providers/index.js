const { NetlifyBackgroundProvider } = require('./netlify-background-provider');
const { QStashQueueProvider } = require('./qstash-queue-provider');

module.exports = {
    NetlifyBackgroundProvider,
    QStashQueueProvider,
    // Lazy: requiring the barrel must not construct anything AWS-specific.
    get SqsQueueProvider() {
        return require('./sqs-queue-provider').SqsQueueProvider;
    },
};
