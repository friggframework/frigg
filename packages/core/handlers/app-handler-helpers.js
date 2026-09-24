const { createHandler } = require('@friggframework/core');
const { getLogger } = require('../logs');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Boom = require('@hapi/boom');
const serverlessHttp = require('serverless-http');

const log = getLogger('frigg.http');

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

    if (applyMiddleware) applyMiddleware(app);

    // The express boundary: send the error response and log it one time.
    app.use((err, req, res, next) => {
        const boomError = err.isBoom ? err : Boom.boomify(err);
        const {
            output: { statusCode = 500 },
        } = boomError;

        if (statusCode >= 500) {
            log.error('Request failed', {
                eventName: 'frigg.http.request_failed',
                statusCode,
                error: boomError,
            });
            res.status(statusCode).json({ error: 'Internal Server Error' });
        } else {
            // A client error needs no stack; the logger scrubs the reason.
            log.warn('Request rejected', {
                eventName: 'frigg.http.request_rejected',
                statusCode,
                reason: boomError.message,
            });
            res.status(statusCode).json({ error: err.message });
        }
    });

    return app;
};

function createAppHandler(eventName, router, shouldUseDatabase = true) {
    const app = createApp((app) => {
        app.use(router);
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
