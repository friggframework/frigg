/**
 * Database Migration Router Lambda Handler
 *
 * Minimal Lambda wrapper that avoids loading core/index.js
 * (which would try to load user/** modules excluded from migration packages)
 * 
 * This handler is intentionally simpler than health.handler.js to avoid dependencies.
 */

const serverlessHttp = require('serverless-http');
const express = require('express');
const cors = require('cors');
const dbMigrationRouter = require('./db-migration');

// Create minimal Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(dbMigrationRouter);

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

// Export serverless-http wrapped handler
module.exports = serverlessHttp(app);

