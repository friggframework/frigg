const {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
} = require('./commands/integration-commands');
const { createUserCommands } = require('./commands/user-commands');
const { createEntityCommands } = require('./commands/entity-commands');
const { createCredentialCommands } = require('./commands/credential-commands');
const { createProcessCommands } = require('./commands/process-commands');
const { createSchedulerCommands } = require('./commands/scheduler-commands');
const { createUsageCommands } = require('./commands/usage-commands');
const { loadAppDefinition } = require('../handlers/app-definition-loader');

/**
 * Resolve the adopter's North Star config from the app definition so
 * `frigg.usage.northStar(...)` can read it (ADR-011 Decision 5). Guarded: a
 * missing/unloadable app definition (e.g. in unit tests) must never break the
 * command factory — usage reads simply have no North Star.
 */
function resolveNorthStarConfig() {
    try {
        return loadAppDefinition().telemetry?.northStar ?? null;
    } catch (_) {
        return null;
    }
}

/**
 * Create a unified command factory with all CRUD operations
 *
 * This is the main entry point for integration developers to access all
 * database operations without directly touching Mongoose models.
 *
 * @param {Object} params
 * @param {Object} params.integrationClass - Integration class (required)
 * @returns {Object} Unified commands object with all CRUD operations
 *
 * @example
 * const commands = createFriggCommands({ integrationClass: MyIntegration });
 * const user = await commands.createUser({ username: 'user@example.com' });
 * const credential = await commands.createCredential({ userId: user.id, ... });
 */
function createFriggCommands({ integrationClass }) {
    // All commands use Frigg's default repositories and use cases
    const integrationCommands = createIntegrationCommands({ integrationClass });

    const userCommands = createUserCommands();

    const entityCommands = createEntityCommands();

    const credentialCommands = createCredentialCommands();

    const processCommands = createProcessCommands();

    return {
        // Integration commands
        ...integrationCommands,

        // User commands
        ...userCommands,

        // Entity commands
        ...entityCommands,

        // Credential commands
        ...credentialCommands,

        // Process commands
        ...processCommands,

        // Usage read/write (ADR-011) — nested to match `frigg.usage.*`
        usage: createUsageCommands({ northStar: resolveNorthStarConfig() }),
    };
}

module.exports = {
    // Unified factory
    createFriggCommands,

    // Individual factories
    createIntegrationCommands,
    createUserCommands,
    createEntityCommands,
    createCredentialCommands,
    createProcessCommands,
    createSchedulerCommands,
    createUsageCommands,

    // Legacy standalone function
    findIntegrationContextByExternalEntityId,

    // Deprecated - use createFriggCommands instead
    integrationCommands: {
        create: createIntegrationCommands,
        findIntegrationContextByExternalEntityId,
    },
};
