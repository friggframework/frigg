const { createHandler } = require('@friggframework/core');
const { getLogger } = require('../logs');
const { summarizeExpressRequest } = require('../logs/summarize-event');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Boom = require('@hapi/boom');
const serverlessHttp = require('serverless-http');
const {
    API_VERSION_HEADER,
    isVersionedManagementApiPath,
    toBoom,
    toV2ErrorBody,
} = require('../management-api/error-response');

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
    // A Boom error keeps its status; other errors keep theirs only when they
    // mark a 4xx safe to expose (body-parser's 400/413 via http-errors), so a
    // malformed body is a 400, not a 500.
    app.use((err, req, res, next) => {
        const boomError = toBoom(err);
        const {
            output: { statusCode = 500 },
        } = boomError;
        const versioned = isVersionedManagementApiPath(req.path);

        if (statusCode >= 500) {
            log.error('Request failed', {
                eventName: 'frigg.http.request_failed',
                statusCode,
                invocation: summarizeExpressRequest(req),
                error: boomError,
            });
        } else {
            // A client error needs no stack; the logger scrubs the reason.
            log.warn('Request rejected', {
                eventName: 'frigg.http.request_rejected',
                statusCode,
                reason: boomError.message,
            });
        }

        if (versioned) {
            // Management API v2 / meta: { error: { code, message, details? } }.
            if (req.path.startsWith('/api/v2')) {
                res.set(API_VERSION_HEADER, '2');
            }
            return res.status(statusCode).json(toV2ErrorBody(boomError));
        }

        // v1 and other routes keep their historical body.
        if (statusCode >= 500) {
            return res.status(statusCode).json({ error: 'Internal Server Error' });
        }
        return res.status(statusCode).json({ error: err.message });
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
