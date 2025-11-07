/**
 * Database Module Index
 * 
 * Exports Prisma client and repositories following hexagonal architecture.
 * Use repositories for data access - never access Prisma directly from domain layer.
 */

const { prisma, connectPrisma, disconnectPrisma } = require('./prisma');
const { mongoose } = require('./mongoose');

module.exports = {
    prisma,
    connectPrisma,
    disconnectPrisma,
    mongoose, // Still used for legacy ping operations in some health checks
};
