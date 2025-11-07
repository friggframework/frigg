const { initDebugLog, flushDebugLog } = require('../logs');
const { secretsToEnv } = require('./secrets-to-env');

let databaseInitializer = null;
let databaseInitialized = false;
let databaseInitPromise = null;

function setDatabaseInitializer(initializer) {
    databaseInitializer = initializer;
}

function getDefaultDatabaseInitializer() {
    if (!databaseInitializer) {
        const { connectDatabase } = require('../database/connect-database');
        databaseInitializer = connectDatabase;
    }
    return databaseInitializer;
}

async function ensureDatabaseInitialized() {
    if (databaseInitialized) {
        return;
    }
    
    if (!databaseInitPromise) {
        databaseInitPromise = (async () => {
            try {
                const initializer = getDefaultDatabaseInitializer();
                await initializer();
                databaseInitialized = true;
                console.log('✓ Database initialized successfully');
            } catch (error) {
                console.error('Failed to initialize database:', error.message);
                databaseInitPromise = null;
                throw error;
            }
        })();
    }
    
    return databaseInitPromise;
}

/**
 * Creates a Lambda handler with database initialization.
 * 
 * Follows hexagonal architecture: database initialization is a port that can be injected.
 * Default adapter uses Prisma's connectPrisma(), which handles both PostgreSQL and MongoDB.
 * 
 * @param {Object} options
 * @param {string} options.eventName - Event name for logging
 * @param {boolean} options.isUserFacingResponse - Whether to hide error details (default: true)
 * @param {Function} options.method - The handler method to execute
 * @param {boolean} options.shouldUseDatabase - Whether to initialize database (default: true)
 * @param {Function} options.databaseInitializer - Optional custom database initializer
 * @returns {Function} Lambda handler
 */
const createHandler = (optionByName = {}) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
        shouldUseDatabase = true,
        databaseInitializer: customInitializer = null,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    if (customInitializer) {
        setDatabaseInitializer(customInitializer);
    }

    return async (event, context) => {
        try {
            initDebugLog(eventName, event);

            const requestMethod = event.httpMethod;
            const requestPath = event.path;
            if (requestMethod && requestPath) {
                console.info(`${requestMethod} ${requestPath}`);
            }

            await secretsToEnv();

            if (shouldUseDatabase) {
                await ensureDatabaseInitialized();
            }

            context.callbackWaitsForEmptyEventLoop = false;

            return await method(event, context);
        } catch (error) {
            flushDebugLog(error);

            if (isUserFacingResponse) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'An Internal Error Occurred',
                    }),
                };
            }

            if (error.isHaltError === true) {
                return;
            }

            throw error;
        }
    };
};

module.exports = { createHandler };
