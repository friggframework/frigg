/**
 * Prisma Client Singleton with Multi-Database Support
 * Conditionally loads MongoDB or PostgreSQL client based on DB_TYPE
 *
 * Usage:
 *   const { prisma } = require('./database/prisma');
 *   await prisma.user.findUnique({ where: { id } });
 *
 * Supported DB_TYPE values: 'mongodb' (default), 'postgresql'
 */

const DB_TYPE = process.env.DB_TYPE || 'mongodb';

const prismaClientSingleton = () => {
    let PrismaClient;

    if (DB_TYPE === 'mongodb') {
        PrismaClient = require('@prisma-mongo/client').PrismaClient;
    } else if (DB_TYPE === 'postgresql') {
        PrismaClient = require('@prisma-postgres/client').PrismaClient;
    } else {
        throw new Error(
            `Unsupported DB_TYPE: ${DB_TYPE}. Supported values: 'mongodb', 'postgresql'`
        );
    }

    const client = new PrismaClient({
        log: process.env.PRISMA_LOG_LEVEL
            ? process.env.PRISMA_LOG_LEVEL.split(',')
            : ['error', 'warn'],
        errorFormat: 'pretty',
    });

    return client;
};

// Global singleton to prevent multiple instances
const globalForPrisma = global;

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// In development, store on global to preserve across hot reloads
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

/**
 * Disconnect Prisma Client
 * Useful for tests and graceful shutdown
 */
async function disconnectPrisma() {
    await prisma.$disconnect();
}

/**
 * Connect Prisma Client explicitly
 * Usually not needed (connects automatically on first query)
 * Useful for health checks
 */
async function connectPrisma() {
    await prisma.$connect();
    return prisma;
}

module.exports = {
    prisma,
    connectPrisma,
    disconnectPrisma,
};