/**
 * Base MongoDB Repository
 * 
 * Provides DocumentDB-compatible Prisma client for MongoDB repositories.
 * Follows Hexagonal Architecture - infrastructure adapter for MongoDB/DocumentDB.
 * 
 * All MongoDB repositories should extend this class to ensure DocumentDB compatibility.
 */

const { wrapPrismaForDocumentDB } = require('../utils/prisma-documentdb-wrapper');

class BaseRepositoryMongoDB {
    /**
     * @param {Object} params
     * @param {Object} params.prismaClient - Prisma client instance
     */
    constructor({ prismaClient }) {
        // Wrap Prisma client for DocumentDB compatibility
        // Only activates for DocumentDB connections (zero overhead for MongoDB)
        this.prisma = wrapPrismaForDocumentDB(prismaClient);
    }
}

module.exports = { BaseRepositoryMongoDB };

