/**
 * Database Connection Orchestrator
 * Handles connection for both Prisma and native MongoDB driver
 */

const { isDocumentDB } = require('./utils/documentdb-compatibility');

async function connectDatabase() {
    if (isDocumentDB()) {
        console.log('Connecting to DocumentDB using native MongoDB driver...');
        const { getNativeMongoClient } = require('./mongodb-native-client');
        const nativeClient = getNativeMongoClient();
        await nativeClient.connect();
        console.log('✓ Native MongoDB client connected');
        
        const { initializeMongoDBSchema } = require('./utils/mongodb-schema-init');
        await initializeMongoDBSchema();
        console.log('✓ MongoDB schema initialized');
    } else {
        console.log('Connecting using Prisma...');
        const { connectPrisma } = require('./prisma');
        await connectPrisma();
        console.log('✓ Prisma client connected');
    }
}

module.exports = { connectDatabase };

