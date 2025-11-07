/**
 * Prisma DocumentDB Compatibility Wrapper
 * 
 * Automatically applies DocumentDB compatibility fixes to all Prisma operations.
 * Prevents $$REMOVE operator errors by cleaning data before passing to Prisma.
 * 
 * Usage:
 * ```javascript
 * const { wrapPrismaForDocumentDB } = require('./prisma-documentdb-wrapper');
 * 
 * class MyRepository {
 *   constructor({ prismaClient }) {
 *     this.prisma = wrapPrismaForDocumentDB(prismaClient);
 *   }
 * }
 * ```
 */

const { removeUndefinedValues, isDocumentDB } = require('./documentdb-compatibility');

/**
 * Wrap Prisma client to automatically clean data for DocumentDB compatibility
 * 
 * @param {Object} prismaClient - Original Prisma client
 * @returns {Proxy} Wrapped Prisma client with DocumentDB compatibility
 */
function wrapPrismaForDocumentDB(prismaClient) {
    // Only wrap if using DocumentDB
    if (!isDocumentDB()) {
        return prismaClient;
    }

    return new Proxy(prismaClient, {
        get(target, modelName) {
            const model = target[modelName];
            
            // Skip non-model properties
            if (!model || typeof model !== 'object') {
                return model;
            }

            // Wrap model methods
            return new Proxy(model, {
                get(modelTarget, methodName) {
                    const method = modelTarget[methodName];
                    
                    // Skip non-function properties
                    if (typeof method !== 'function') {
                        return method;
                    }

                    // Wrap create, update, upsert methods
                    if (['create', 'createMany', 'update', 'updateMany', 'upsert'].includes(methodName)) {
                        return function wrappedMethod(args) {
                            // Clean the data object
                            if (args && args.data) {
                                args.data = removeUndefinedValues(args.data);
                            }
                            
                            // For createMany, clean each item in the array
                            if (methodName === 'createMany' && args && Array.isArray(args.data)) {
                                args.data = args.data.map(item => removeUndefinedValues(item));
                            }

                            // For upsert, clean both create and update data
                            if (methodName === 'upsert' && args) {
                                if (args.create) {
                                    args.create = removeUndefinedValues(args.create);
                                }
                                if (args.update) {
                                    args.update = removeUndefinedValues(args.update);
                                }
                            }

                            return method.call(modelTarget, args);
                        };
                    }

                    // Return original method for other operations
                    return method.bind(modelTarget);
                }
            });
        }
    });
}

/**
 * Manually clean data for DocumentDB compatibility
 * Use this when you need explicit control over data cleaning
 * 
 * @param {Object} data - Data object to clean
 * @returns {Object} Cleaned data
 */
function cleanForDocumentDB(data) {
    if (!isDocumentDB()) {
        return data;
    }
    return removeUndefinedValues(data);
}

module.exports = {
    wrapPrismaForDocumentDB,
    cleanForDocumentDB,
};

