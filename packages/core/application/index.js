const {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
} = require('./commands/integration-commands');
const { createUserCommands } = require('./commands/user-commands');
const { createEntityCommands } = require('./commands/entity-commands');
const {
    createCredentialCommands,
} = require('./commands/credential-commands');

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
function createFriggCommands({ integrationClass } = {}) {
    // All commands use Frigg's default repositories and use cases
    const integrationCommands = createIntegrationCommands({ integrationClass });

    const userCommands = createUserCommands();

    const entityCommands = createEntityCommands();

    const credentialCommands = createCredentialCommands();

    return {
        // Integration commands
        ...integrationCommands,

        // User commands
        ...userCommands,

        // Entity commands
        ...entityCommands,

        // Credential commands
        ...credentialCommands,
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

    // Legacy standalone function
    findIntegrationContextByExternalEntityId,

    // Deprecated - use createFriggCommands instead
    integrationCommands: {
        create: createIntegrationCommands,
        findIntegrationContextByExternalEntityId,
    },
};
