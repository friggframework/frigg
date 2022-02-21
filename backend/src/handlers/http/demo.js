const { createHandler } = require('../createHandler');

const serverlessHttp = require('serverless-http');
const { createApp } = require('../../../app');
const demoMiddleware = require('../../routers/demo');

const demoApp = createApp((app) => app.use(demoMiddleware));

module.exports.handler = createHandler({
    eventName: 'HTTP Event: Demo',
    method: serverlessHttp(demoApp),
});
