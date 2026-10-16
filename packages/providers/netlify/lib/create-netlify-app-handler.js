/**
 * Netlify App Handler Helper
 *
 * Wraps an Express router for a Netlify Function. The Express app is core's
 * createApp (body parsing, CORS, and the error boundary that answers
 * /api/v2 and /api/meta errors in the Management API's v2 envelope with
 * the API-version header), and the handler is core's createHandler via
 * createNetlifyHandler — the same two pieces as core's createAppHandler, so
 * a router behaves identically on AWS Lambda and on Netlify.
 * (friggframework/frigg#545 used a copy of an older createApp, which lost
 * the v2 error envelope.)
 */
const serverlessHttp = require('serverless-http');
const { createApp } = require('@friggframework/core/handlers/app-handler-helpers');
const { createNetlifyHandler } = require('./create-netlify-handler');

/**
 * @param {Function} [applyMiddleware] - (app) => void
 * @returns {import('express').Express}
 */
const createNetlifyApp = (applyMiddleware) => createApp(applyMiddleware);

/**
 * @param {string} eventName
 * @param {import('express').Router} router
 * @param {boolean} [shouldUseDatabase=true]
 * @param {string|null} [basePath=null] - mount the router under this path
 */
function createNetlifyAppHandler(
    eventName,
    router,
    shouldUseDatabase = true,
    basePath = null
) {
    const app = createNetlifyApp((expressApp) => {
        if (basePath) {
            expressApp.use(basePath, router);
        } else {
            expressApp.use(router);
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
