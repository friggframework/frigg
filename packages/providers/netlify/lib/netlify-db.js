/**
 * Netlify DB (Neon PostgreSQL) Support
 *
 * Frigg already supports PostgreSQL via Prisma ORM. Netlify DB is powered by
 * Neon serverless PostgreSQL, which is fully compatible.
 *
 * Configuration:
 *   1. Enable Netlify DB in your Netlify project settings
 *   2. Netlify automatically sets DATABASE_URL in your function environment
 *   3. Set database.postgres.enable = true in your Frigg app definition
 *
 * The Prisma client will automatically use the DATABASE_URL to connect.
 *
 * App definition example for Netlify DB:
 *
 *   const appDefinition = {
 *       name: 'my-frigg-app',
 *       database: {
 *           postgres: {
 *               enable: true,
 *               // Netlify DB sets DATABASE_URL automatically
 *               // No additional config needed
 *           },
 *       },
 *       // Use AES encryption (no AWS KMS on Netlify)
 *       encryption: {
 *           fieldLevelEncryptionMethod: 'aes',
 *       },
 *       // Queue provider for Netlify
 *       queue: {
 *           provider: 'netlify-background', // or 'qstash'
 *       },
 *   };
 *
 * Alternatively, for MongoDB Atlas (also works on Netlify):
 *
 *   const appDefinition = {
 *       database: {
 *           mongoDB: { enable: true },
 *       },
 *   };
 *   // Set DATABASE_URL to your MongoDB Atlas connection string in Netlify env vars
 *
 * Neon-specific considerations:
 *   - Uses serverless driver for connection pooling (handled by Prisma)
 *   - Supports branching for preview deployments
 *   - Auto-scales to zero when idle
 *   - Connection string format: postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
 */

/**
 * Validate that the database configuration is compatible with Netlify deployment.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @returns {{ valid: boolean, warnings: string[], errors: string[] }}
 */
function validateNetlifyDbConfig(appDefinition) {
    const warnings = [];
    const errors = [];

    const db = appDefinition.database;

    if (!db) {
        errors.push(
            'No database configuration found. Add database.postgres or database.mongoDB to your app definition.'
        );
        return { valid: false, warnings, errors };
    }

    // Check for DocumentDB (AWS-specific, won't work on Netlify)
    if (db.documentDB?.enable) {
        errors.push(
            'DocumentDB is AWS-specific and cannot be used with Netlify. ' +
                'Use database.mongoDB (MongoDB Atlas) or database.postgres (Netlify DB / Neon) instead.'
        );
    }

    // Check for Aurora (AWS-specific)
    if (db.postgres?.enable && appDefinition.vpc?.enable) {
        warnings.push(
            'VPC configuration is ignored on Netlify. ' +
                'Ensure your database allows connections from Netlify IP ranges.'
        );
    }

    // Check encryption config
    const encryption = appDefinition.encryption;
    if (encryption?.fieldLevelEncryptionMethod === 'kms') {
        warnings.push(
            'KMS encryption is AWS-specific. On Netlify, use fieldLevelEncryptionMethod: "aes" ' +
                'and set AES_KEY_ID and AES_KEY environment variables.'
        );
    }

    const valid = errors.length === 0;
    return { valid, warnings, errors };
}

module.exports = { validateNetlifyDbConfig };
