const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Boom = require('@hapi/boom');
const loadUserManager = require('./src/routers/middleware/loadUserManager');
const { flushDebugLog } = require('./src/utils/logger');

const createApp = (applyMiddleware) => {
    const app = express();

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded());
    app.use(
        cors({
            origin: '*',
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

module.exports = { createApp };
