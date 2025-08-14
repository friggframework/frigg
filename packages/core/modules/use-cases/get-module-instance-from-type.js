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
     */
    async execute(userId, type) {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.getName() === type
        );
        if (!moduleDefinition) {
            throw new Error(`Module definition not found for type: ${type}`);
        }
        return new Module({
            userId,
            definition: moduleDefinition,
        });
    }
}

module.exports = { GetModuleInstanceFromType };
