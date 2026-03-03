const { NetlifyBackgroundProvider } = require('./netlify-background-provider');
const { QStashQueueProvider } = require('./qstash-queue-provider');

module.exports = {
    // SQS adapter is lazy-loaded from provider-aws to avoid pulling in
    // @aws-sdk/client-sqs on non-AWS platforms.
    get SqsQueueProvider() {
        return require('@friggframework/provider-aws').SqsQueueProvider;
    },
    NetlifyBackgroundProvider,
    QStashQueueProvider,
};
