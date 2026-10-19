const { listIntegrationClasses } = require('../integration-types');

/**
 * Use case for retrieving all possible integration types that can be created.
 * @class GetPossibleIntegrations
 */
class GetPossibleIntegrations {
    /**
     * Creates a new GetPossibleIntegrations instance.
     * @param {Object} params - Configuration parameters.
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes.
     */
    constructor({ integrationClasses }) {
        this.integrationClasses = integrationClasses;
    }

    /**
     * Executes the retrieval of all possible integration types.
     * @async
     * @returns {Promise<Object[]>} Array of integration option details for all available integration types.
     */
    async execute() {
        // Registered classes and the types providers offer (published definitions), one list.
        const classes = await listIntegrationClasses(this.integrationClasses);
        return classes.map((integrationClass) =>
            integrationClass.getOptionDetails()
        );
    }
}

module.exports = { GetPossibleIntegrations };