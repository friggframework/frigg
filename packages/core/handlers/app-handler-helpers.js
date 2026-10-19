const { createHandler } = require('@friggframework/core');
const { getLogger } = require('../logs');
const { summarizeExpressRequest } = require('../logs/summarize-event');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Boom = require('@hapi/boom');
const serverlessHttp = require('serverless-http');

const log = getLogger('frigg.http');

const createApp = (applyMiddleware) => {
    const app = express();

    // Keep the bytes as received: webhook signatures (HubSpot, Slack, Stripe, Linear…) are computed over the exact
    // raw body, which re-serialising the parsed body does not reproduce. A reference to the buffer, not a copy.
    const keepRaw = (req, res, buf) => { req.rawBody = buf; };
    app.use(bodyParser.json({ limit: '10mb', verify: keepRaw }));
    app.use(bodyParser.urlencoded({ extended: true, verify: keepRaw }));
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
                invocation: summarizeExpressRequest(req),
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
