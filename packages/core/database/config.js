/**
 * Database Configuration
 * Manages configuration for Prisma ORM operations
 */

/**
 * Database type selection
 * Currently only 'mongodb' is supported, but this will enable multi-database support
 * @type {'mongodb'|'postgresql'|'mysql'}
 */
const DB_TYPE = process.env.DB_TYPE || 'mongodb';

/**
 * Enable Prisma debug logging
 * Set PRISMA_LOG_LEVEL to comma-separated list: query,info,warn,error
 * @type {string}
 */
const PRISMA_LOG_LEVEL = process.env.PRISMA_LOG_LEVEL || 'error,warn';

/**
 * Enable Prisma query logging for performance monitoring
 * @type {boolean}
 */
const PRISMA_QUERY_LOGGING = process.env.PRISMA_QUERY_LOGGING === 'true';

module.exports = {
    DB_TYPE,
    PRISMA_LOG_LEVEL,
    PRISMA_QUERY_LOGGING,
};