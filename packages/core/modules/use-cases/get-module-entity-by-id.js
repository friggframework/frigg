/**
 * GetModuleEntityById Use Case
 * Retrieves a module entity by its ID
 */
class GetModuleEntityById {
    constructor({ moduleRepository }) {
        this.moduleRepository = moduleRepository;
    }

    async execute(entityId) {
        const entity = await this.moduleRepository.findEntityById(entityId);
        return entity;
    }
}

module.exports = { GetModuleEntityById };
