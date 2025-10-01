/**
 * IAppDefinitionRepository Port (Interface)
 *
 * Defines the contract for AppDefinition persistence
 * Concrete implementations will be in the infrastructure layer
 */
class IAppDefinitionRepository {
    /**
     * Load the app definition from project
     * @returns {Promise<AppDefinition|null>}
     */
    async load() {
        throw new Error('Not implemented');
    }

    /**
     * Save the app definition to project
     * @param {AppDefinition} appDefinition
     * @returns {Promise<AppDefinition>}
     */
    async save(appDefinition) {
        throw new Error('Not implemented');
    }

    /**
     * Check if app definition exists
     * @returns {Promise<boolean>}
     */
    async exists() {
        throw new Error('Not implemented');
    }

    /**
     * Create a new app definition
     * @param {object} props - Initial properties
     * @returns {Promise<AppDefinition>}
     */
    async create(props) {
        throw new Error('Not implemented');
    }
}

module.exports = {IAppDefinitionRepository};
