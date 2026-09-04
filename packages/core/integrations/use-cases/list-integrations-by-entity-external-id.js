/**
 * List all integration IDs whose module entities match an externalId.
 *
 * Use this instead of {@link FindIntegrationByEntityExternalIdUseCase} when a
 * single externalId is *expected* to map to multiple integrations (intentional
 * fan-out: one upstream account broadcasting to several Frigg integration
 * records, possibly across tenants).
 *
 * Does not throw on ambiguous resolution — that's the whole point.
 */
class ListIntegrationsByEntityExternalIdUseCase {
    constructor({ integrationRepository, moduleRepository } = {}) {
        if (!integrationRepository) {
            throw new Error('integrationRepository is required');
        }
        if (!moduleRepository) {
            throw new Error('moduleRepository is required');
        }
        this.integrationRepository = integrationRepository;
        this.moduleRepository = moduleRepository;
    }

    async execute({ externalId, moduleName } = {}) {
        if (!externalId) return [];

        const filter = { externalId: String(externalId) };
        if (moduleName) filter.moduleName = moduleName;

        const entities = await this.moduleRepository.findEntities(filter);
        if (!entities || entities.length === 0) return [];

        const integrationIds = new Set();
        for (const entity of entities) {
            const owners =
                await this.integrationRepository.findIntegrationsByEntityId(
                    entity.id
                );
            for (const integration of owners || []) {
                integrationIds.add(integration.id);
            }
        }
        return Array.from(integrationIds);
    }
}

module.exports = { ListIntegrationsByEntityExternalIdUseCase };
