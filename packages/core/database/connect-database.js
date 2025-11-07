/**
 * Database Connection Orchestrator
 * Handles connection for both Prisma and native MongoDB driver
 */

const { isDocumentDB } = require('./utils/documentdb-compatibility');
const { logger } = require('../logs');

async function connectDatabase() {
    if (isDocumentDB()) {
        logger.info('Connecting to DocumentDB using native MongoDB driver...');
        const { getNativeMongoClient } = require('./mongodb-native-client');
        const nativeClient = getNativeMongoClient();
        await nativeClient.connect();
        logger.info('✓ Native MongoDB client connected');
        
        const { initializeMongoDBSchema } = require('./utils/mongodb-schema-init');
        await initializeMongoDBSchema();
        logger.info('✓ MongoDB schema initialized');
    } else {
        logger.info('Connecting using Prisma...');
        const { connectPrisma } = require('./prisma');
        await connectPrisma();
        logger.info('✓ Prisma client connected');
    }
}

module.exports = { connectDatabase };

