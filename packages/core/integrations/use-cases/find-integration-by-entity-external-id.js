/**
 * Reverse-lookup use case: resolve an externalId (e.g. HubSpot portalId,
 * Slack team_id, Asana workspace_id) to a single integration ID.
 *
 * Refuses to pick on ambiguous resolution at either layer:
 *   - more than one matching Entity row for the (externalId, moduleName) tuple
 *   - more than one Integration owning the matched entity
 *
 * A silent first-match in either case is a cross-tenant routing risk.
 * Callers that expect a one-to-many fan-out should use
 * {@link ListIntegrationsByEntityExternalIdUseCase} instead.
 */
class FindIntegrationByEntityExternalIdUseCase {
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
        if (!externalId) return null;

        const filter = { externalId: String(externalId) };
        if (moduleName) filter.moduleName = moduleName;

        const entities = await this.moduleRepository.findEntities(filter);
        if (!entities || entities.length === 0) {
            console.log(
                `[Frigg] findIntegrationByEntityExternalId: no entity for externalId=${externalId}${
                    moduleName ? ` moduleName=${moduleName}` : ''
                }`
            );
            return null;
        }
        if (entities.length > 1) {
            const ids = entities.map((e) => e.id).join(', ');
            throw new Error(
                `findIntegrationByEntityExternalId: ambiguous resolution — externalId=${externalId}` +
                    `${moduleName ? ` moduleName=${moduleName}` : ''} matches ${entities.length} entities [${ids}]. ` +
                    `Refusing to pick one to avoid cross-tenant routing. ` +
                    `Pass a moduleName, or use listIntegrationsByEntityExternalId if multiple integrations are expected.`
            );
        }

        const entity = entities[0];
        const integrations =
            await this.integrationRepository.findIntegrationsByEntityId(
                entity.id
            );
        if (!integrations || integrations.length === 0) {
            console.log(
                `[Frigg] findIntegrationByEntityExternalId: entity ${entity.id} has no owning integrations (orphan)`
            );
            return null;
        }
        if (integrations.length > 1) {
            const ids = integrations.map((i) => i.id).join(', ');
            throw new Error(
                `findIntegrationByEntityExternalId: ambiguous resolution — externalId=${externalId}` +
                    `${moduleName ? ` moduleName=${moduleName}` : ''} maps to ${integrations.length} integrations [${ids}]. ` +
                    `Refusing to pick one to avoid cross-tenant routing. ` +
                    `Use listIntegrationsByEntityExternalId if a one-to-many fan-out is intended.`
            );
        }
        return integrations[0].id;
    }
}

module.exports = { FindIntegrationByEntityExternalIdUseCase };
