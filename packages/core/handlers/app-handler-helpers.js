const { createHandler, flushDebugLog } = require('@friggframework/core');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Boom = require('@hapi/boom');
const loadUserManager = require('./routers/middleware/loadUser');
const serverlessHttp = require('serverless-http');

const createApp = (applyMiddleware) => {
    const app = express();

    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(
        cors({
            origin: '*',
            allowedHeaders: '*',
            methods: '*',
            credentials: true,
        })
    );

    app.use(loadUserManager);

    if (applyMiddleware) applyMiddleware(app);

    // Handle sending error response and logging server errors to console
    app.use((err, req, res, next) => {
        const boomError = err.isBoom ? err : Boom.boomify(err);
        const {
            output: { statusCode = 500 },
        } = boomError;

        if (statusCode >= 500) {
            flushDebugLog(boomError);
            res.status(statusCode).json({ error: 'Internal Server Error' });
        } else {
            res.status(statusCode).json({ error: err.message });
        }
    });

    return app;
};

function createAppHandler(eventName, router, shouldUseDatabase = true, basePath = null) {
    const app = createApp((app) => {
        if (basePath) {
            app.use(basePath, router);
        } else {
            app.use(router);
        }
    });
    return createHandler({
        eventName,
        method: serverlessHttp(app),
        shouldUseDatabase,
    });
}

module.exports = {
    createApp,
    createAppHandler,
};
