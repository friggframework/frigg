const express = require('express');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const {
    createCredentialRepository,
} = require('./repositories/credential-repository-factory');
const {
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');
const {
    ListCredentialsForUser,
} = require('./use-cases/list-credentials-for-user');
const { GetCredentialForUser } = require('./use-cases/get-credential-for-user');
const {
    DeleteCredentialForUser,
} = require('./use-cases/delete-credential-for-user');
const { ReauthorizeCredential } = require('./use-cases/reauthorize-credential');

/**
 * Boom Error Handler Middleware
 * Handles Boom errors and converts them to appropriate HTTP responses
 * @param {Error} err - Error object
 * @param {Request} req - Express request
 * @param {Response} res - Express response
 * @param {Function} next - Express next function
 */
function boomErrorHandler(err, req, res, next) {
    // Handle Boom errors
    if (err.isBoom) {
        return res.status(err.output.statusCode).json({
            error: err.output.payload.message,
            statusCode: err.output.statusCode,
        });
    }

    // Handle generic errors (500)
    console.error('Unexpected error:', err);
    return res.status(500).json({
        error: 'Internal server error',
        statusCode: 500,
    });
}

/**
 * Create Credential Router
 * Factory function that creates an Express router with credential management endpoints
 *
 * Endpoints:
 * - GET /api/credentials - List all credentials for authenticated user
 * - GET /api/credentials/:id - Get a single credential
 * - DELETE /api/credentials/:id - Delete a credential
 * - POST /api/credentials/:id/reauthorize - Reauthorize a credential
 *
 * Security:
 * - All endpoints require authentication (via authenticateUser middleware)
 * - Credentials are filtered to only belong to the authenticated user
 * - Sensitive data (tokens) are filtered from responses
 *
 * @returns {express.Router} Configured Express router
 */
function createCredentialRouter() {
    const router = express.Router();

    // Load configuration and create repositories
    const credentialRepository = createCredentialRepository();
    const moduleRepository = createModuleRepository();

    // Create credential use cases
    const listCredentialsForUser = new ListCredentialsForUser({
        credentialRepository,
    });

    const getCredentialForUser = new GetCredentialForUser({
        credentialRepository,
    });

    const deleteCredentialForUser = new DeleteCredentialForUser({
        credentialRepository,
    });

    const reauthorizeCredential = new ReauthorizeCredential({
        credentialRepository,
        moduleRepository,
    });

    /**
     * Filter sensitive data from credential objects
     * Removes tokens and other sensitive fields from credentials before sending to client
     *
     * @param {Object|Array} credentials - Credential(s) to filter
     * @returns {Object|Array} Filtered credential(s)
     */
    function filterSensitiveData(credentials) {
        const filter = (cred) => {
            if (!cred) return cred;

            // Create a copy without sensitive fields
            const {
                data,
                access_token,
                refresh_token,
                id_token,
                domain,
                ...safeCredential
            } = cred;

            // Ensure we have timestamps in ISO format
            if (
                safeCredential.createdAt &&
                !(safeCredential.createdAt instanceof Date)
            ) {
                safeCredential.createdAt = new Date(
                    safeCredential.createdAt
                ).toISOString();
            }
            if (
                safeCredential.updatedAt &&
                !(safeCredential.updatedAt instanceof Date)
            ) {
                safeCredential.updatedAt = new Date(
                    safeCredential.updatedAt
                ).toISOString();
            }

            return safeCredential;
        };

        return Array.isArray(credentials)
            ? credentials.map(filter)
            : filter(credentials);
    }

    // GET /api/credentials - List all credentials for authenticated user
    router.get(
        '/',
        catchAsyncError(async (req, res) => {
            // Expect authentication middleware to have set req.user
            if (!req.user) {
                throw Boom.unauthorized('Authentication required');
            }
            const userId =
                typeof req.user.getId === 'function'
                    ? req.user.getId()
                    : req.user.id;

            const credentials = await listCredentialsForUser.execute(userId);

            // Filter out sensitive data before responding
            const safeCredentials = filterSensitiveData(credentials);

            res.json({ credentials: safeCredentials });
        })
    );

    // GET /api/credentials/:id - Get a single credential
    router.get(
        '/:id',
        catchAsyncError(async (req, res) => {
            if (!req.user) {
                throw Boom.unauthorized('Authentication required');
            }
            const userId =
                typeof req.user.getId === 'function'
                    ? req.user.getId()
                    : req.user.id;
            const credentialId = req.params.id;

            const credential = await getCredentialForUser.execute(
                credentialId,
                userId
            );

            // Filter out sensitive data before responding
            const safeCredential = filterSensitiveData(credential);

            res.json(safeCredential);
        })
    );

    // DELETE /api/credentials/:id - Delete a credential
    router.delete(
        '/:id',
        catchAsyncError(async (req, res) => {
            if (!req.user) {
                throw Boom.unauthorized('Authentication required');
            }
            const userId =
                typeof req.user.getId === 'function'
                    ? req.user.getId()
                    : req.user.id;
            const credentialId = req.params.id;

            const result = await deleteCredentialForUser.execute(
                credentialId,
                userId
            );

            // Check if deletion was successful
            if (result.deletedCount === 0) {
                throw Boom.internal('Failed to delete credential');
            }

            res.json({
                success: true,
                message: `Credential ${credentialId} deleted successfully`,
            });
        })
    );

    // POST /api/credentials/:id/reauthorize - Reauthorize a credential
    router.post(
        '/:id/reauthorize',
        catchAsyncError(async (req, res) => {
            if (!req.user) {
                throw Boom.unauthorized('Authentication required');
            }
            const userId =
                typeof req.user.getId === 'function'
                    ? req.user.getId()
                    : req.user.id;
            const credentialId = req.params.id;

            // Validate request body
            if (!req.body.data) {
                throw Boom.badRequest('data is required in request body');
            }

            // Get step and sessionId from request
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            // Validate step is a positive integer
            if (step < 1 || !Number.isInteger(step)) {
                throw Boom.badRequest('step must be a positive integer');
            }

            // Validate sessionId is present for steps > 1
            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId is required for step > 1');
            }

            // Execute the reauthorization
            const result = await reauthorizeCredential.execute(
                credentialId,
                userId,
                req.body.data,
                step,
                sessionId
            );

            res.json(result);
        })
    );

    // Boom error handler middleware
    // Must be added after all routes to catch errors from handlers
    router.use(boomErrorHandler);

    return router;
}

module.exports = { createCredentialRouter, boomErrorHandler };
