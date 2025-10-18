/**
 * Database Migration Router Lambda Handler
 *
 * Wraps the Express router with Lambda infrastructure:
 * - Express app with middleware (CORS, body-parser, error handling)
 * - serverless-http for Lambda compatibility
 * - createHandler for DB pooling + secrets management
 *
 * This matches the pattern used by health.handler.js and user.handler.js
 */

const { createAppHandler } = require('../app-handler-helpers');
const dbMigrationRouter = require('./db-migration');

module.exports.handler = createAppHandler(
    'db-migration-router',
    dbMigrationRouter,
    true // shouldUseDatabase - need DB for Process repository
);

