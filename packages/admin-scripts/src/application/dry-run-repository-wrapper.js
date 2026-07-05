/**
 * Dry-Run Repository Wrapper
 *
 * Wraps any repository to intercept write operations.
 * - READ operations pass through unchanged
 * - WRITE operations are logged but not executed
 *
 * Uses Proxy pattern for dynamic method interception
 */

/**
 * Create a dry-run wrapper for any repository
 *
 * @param {Object} repository - The real repository to wrap
 * @param {Array} operationLog - Array to append logged operations
 * @param {string} modelName - Name of the model (for logging)
 * @returns {Proxy} Wrapped repository that logs write operations
 */
function createDryRunWrapper(repository, operationLog, modelName) {
    return new Proxy(repository, {
        get(target, prop) {
            const value = target[prop];

            // Return non-function properties as-is
            if (typeof value !== 'function') {
                return value;
            }

            // Identify write operations by name pattern
            const writePatterns = /^(create|update|delete|upsert|append|remove|insert|save)/i;
            const isWrite = writePatterns.test(prop);

            // Pass through read operations
            if (!isWrite) {
                return value.bind(target);
            }

            // Wrap write operation
            return async (...args) => {
                // Log the operation that WOULD have been performed
                operationLog.push({
                    operation: prop.toUpperCase(),
                    model: modelName,
                    method: prop,
                    args: sanitizeArgs(args),
                    timestamp: new Date().toISOString(),
                    wouldExecute: `${modelName}.${prop}()`,
                });

                // For write operations, try to return existing data or mock data
                // This helps scripts continue executing without errors

                // For updates, try to return existing data
                if (prop.includes('update') || prop.includes('upsert')) {
                    // Try to extract ID from first argument
                    const possibleId = args[0];
                    let existing = null;

                    if (possibleId && typeof possibleId === 'string') {
                        // Try to find existing record
                        const findMethod = getFindMethod(target, prop);
                        if (findMethod) {
                            try {
                                existing = await findMethod.call(target, possibleId);
                            } catch (err) {
                                // Ignore errors, continue to mock
                            }
                        }
                    }

                    // Return merged data
                    if (existing) {
                        // Merge update data with existing
                        return { ...existing, ...args[1], _dryRun: true };
                    }

                    // No existing data, return mock
                    if (args[1]) {
                        return { id: possibleId, ...args[1], _dryRun: true };
                    }

                    return { id: possibleId, _dryRun: true };
                }

                // For creates, return mock object with the data
                if (prop.includes('create') || prop.includes('insert')) {
                    const data = args[0] || {};
                    return {
                        id: `dry-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        ...data,
                        _dryRun: true,
                        createdAt: new Date().toISOString(),
                    };
                }

                // For deletes, return success indication
                if (prop.includes('delete') || prop.includes('remove')) {
                    return { deletedCount: 1, _dryRun: true };
                }

                // Default: return mock success
                return { success: true, _dryRun: true };
            };
        },
    });
}

/**
 * Try to find a corresponding find method for an update operation
 * @param {Object} target - Repository target
 * @param {string} updateMethod - Update method name
 * @returns {Function|null} Find method or null
 */
function getFindMethod(target, updateMethod) {
    // Common patterns: updateIntegration -> findIntegrationById
    const patterns = [
        () => {
            const match = updateMethod.match(/update(\w+)/i);
            return match ? `find${match[1]}ById` : null;
        },
        () => {
            const match = updateMethod.match(/update(\w+)/i);
            return match ? `get${match[1]}ById` : null;
        },
        () => 'findById',
        () => 'getById',
    ];

    for (const pattern of patterns) {
        const methodName = pattern();
        if (methodName && typeof target[methodName] === 'function') {
            return target[methodName];
        }
    }

    return null;
}

/**
 * Sanitize arguments for logging (remove sensitive data)
 * @param {Array} args - Function arguments
 * @returns {Array} Sanitized arguments
 */
function sanitizeArgs(args) {
    return args.map((arg) => {
        if (arg === null || arg === undefined) {
            return arg;
        }

        if (typeof arg !== 'object') {
            return arg;
        }

        if (Array.isArray(arg)) {
            return arg.map((item) => sanitizeArgs([item])[0]);
        }

        // Sanitize object - remove sensitive fields
        const sanitized = {};
        for (const [key, value] of Object.entries(arg)) {
            const lowerKey = key.toLowerCase();

            // Skip sensitive fields
            if (
                lowerKey.includes('password') ||
                lowerKey.includes('token') ||
                lowerKey.includes('secret') ||
                lowerKey.includes('key') ||
                lowerKey.includes('auth')
            ) {
                sanitized[key] = '[REDACTED]';
                continue;
            }

            // Recursively sanitize nested objects
            if (typeof value === 'object' && value !== null) {
                sanitized[key] = sanitizeArgs([value])[0];
            } else {
                sanitized[key] = value;
            }
        }

        return sanitized;
    });
}

/**
 * Wrap AdminFriggCommands for dry-run mode
 *
 * @param {Object} realCommands - Real AdminFriggCommands instance
 * @param {Array} operationLog - Array to append logged operations
 * @returns {Object} Wrapped commands with dry-run repository wrappers
 */
function wrapAdminFriggCommandsForDryRun(realCommands, operationLog) {
    return new Proxy(realCommands, {
        get(target, prop) {
            const value = target[prop];

            // Pass through non-functions
            if (typeof value !== 'function') {
                // For lazy-loaded repositories, wrap them
                if (prop.endsWith('Repository') && value && typeof value === 'object') {
                    const modelName = prop.replace('Repository', '');
                    return createDryRunWrapper(
                        value,
                        operationLog,
                        modelName.charAt(0).toUpperCase() + modelName.slice(1)
                    );
                }
                return value;
            }

            // Identify write operations on the commands themselves
            const writePatterns = /^(update|create|delete|append)/i;
            const isWrite = writePatterns.test(prop);

            if (!isWrite) {
                // Read operations pass through
                return value.bind(target);
            }

            // Wrap write operations
            return async (...args) => {
                operationLog.push({
                    operation: prop.toUpperCase(),
                    source: 'AdminFriggCommands',
                    method: prop,
                    args: sanitizeArgs(args),
                    timestamp: new Date().toISOString(),
                });

                // For specific known methods, try to return sensible mocks
                if (prop === 'updateIntegrationConfig') {
                    const [integrationId] = args;
                    const existing = await target.findIntegrationById(integrationId);
                    return existing;
                }

                if (prop === 'updateIntegrationStatus') {
                    const [integrationId] = args;
                    const existing = await target.findIntegrationById(integrationId);
                    return existing;
                }

                if (prop === 'updateCredential') {
                    const [credentialId, updates] = args;
                    return { id: credentialId, ...updates, _dryRun: true };
                }

                // Default mock
                return { success: true, _dryRun: true };
            };
        },
    });
}

module.exports = {
    createDryRunWrapper,
    wrapAdminFriggCommandsForDryRun,
    sanitizeArgs,
};
