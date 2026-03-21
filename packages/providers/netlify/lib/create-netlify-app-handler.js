/**
 * Netlify App Handler Helper
 *
 * Creates Express apps wrapped for Netlify Functions via serverless-http.
 * Equivalent of packages/core/handlers/app-handler-helpers.js but using
 * createNetlifyHandler instead of Lambda's createHandler.
 */
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Boom = require('@hapi/boom');
const serverlessHttp = require('serverless-http');
const { flushDebugLog } = require('@friggframework/core/logs');
const { createNetlifyHandler } = require('./create-netlify-handler');

const createNetlifyApp = (applyMiddleware) => {
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

    // Error handler
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

function createNetlifyAppHandler(
    eventName,
    router,
    shouldUseDatabase = true,
    basePath = null
) {
    const app = createNetlifyApp((app) => {
        if (basePath) {
            app.use(basePath, router);
        } else {
            app.use(router);
        }
    });

    return createNetlifyHandler({
        eventName,
        method: serverlessHttp(app),
        shouldUseDatabase,
    });
}

module.exports = {
    createNetlifyApp,
    createNetlifyAppHandler,
};
