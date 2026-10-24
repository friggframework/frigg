const { Module } = require('../module');

class GetModuleInstanceFromType {
    /**
     * @param {Object} params
     * @param {} params.moduleDefinitions
     */
    constructor({ moduleDefinitions }) {
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Retrieve a Module instance for a given user and entity/module type.
     * @param {string} userId
     * @param {string} type – human-readable module/entity type (e.g. "Hubspot")
     * @param {Object} [options]
     * @param {string} [options.state] – optional OAuth state value to be forwarded to the API client (round-trips through the OAuth provider).
     */
    async execute(userId, type, options = {}) {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.getName() === type
        );
        if (!moduleDefinition) {
            throw new Error(`Module definition not found for type: ${type}`);
        }
        return new Module({
            userId,
            definition: moduleDefinition,
            state: options.state,
        });
    }
}

module.exports = { GetModuleInstanceFromType };
