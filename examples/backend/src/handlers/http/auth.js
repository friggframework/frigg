const { createHandler } = require('../createHandler');

const serverlessHttp = require('serverless-http');
const { createApp } = require('../../../app');
const authMiddleware = require('../../routers/auth');
const userMiddleware = require('../../routers/user');

const authApp = createApp((app) => {
    app.use(authMiddleware);
    app.use(userMiddleware);
});

module.exports.handler = createHandler({
    eventName: 'HTTP Event: Auth',
    method: serverlessHttp(authApp),
});
