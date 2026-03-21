/**
 * @friggframework/extension-db-credentials
 *
 * Frigg extension that stores OAuth app credentials (client_id, client_secret)
 * in the database, managed via an admin API.
 *
 * Usage in your app definition:
 *
 *   const dbCredentials = require('@friggframework/extension-db-credentials');
 *
 *   const appDefinition = {
 *       name: 'my-app',
 *       integrations: [...],
 *       extensions: [dbCredentials],
 *   };
 *
 * What it provides:
 * - A Prisma model `OAuthAppCredential` for storing client_id/client_secret per module
 * - A bootstrap hook that replaces static `definition.env` with DB-backed lookups
 * - Admin API routes at `/api/admin/oauth-credentials` for CRUD operations
 * - Encryption for the `clientSecret` field via Frigg's field-level encryption
 */

const path = require('path');
const bootstrap = require('./bootstrap');
const createRouter = require('./routes');

module.exports = {
    name: 'db-credentials',

    schema: path.join(__dirname, 'prisma', 'schema.prisma'),

    encryption: {
        OAuthAppCredential: {
            fields: ['clientSecret'],
        },
    },

    routes: {
        path: '/api/admin/oauth-credentials',
        handler: createRouter,
    },

    bootstrap,
};
