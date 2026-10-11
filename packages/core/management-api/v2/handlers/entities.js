const { toEntityDto } = require('../dto');
const { objectBody, parseStep } = require('../request');

/** Management API v2 entity and entity-type handlers, keyed by operationId. */
function createEntityHandlers(useCases) {
    const {
        listEntitiesForUser,
        getEntityForUser,
        deleteEntityForUser,
        testEntityAuthForUser,
        getEntityOptionsForUser,
        refreshEntityOptionsForUser,
        listEntityTypes,
        getEntityType,
        getAuthorizationRequirements,
    } = useCases;

    return {
        async listEntities(_req, res, user) {
            const entities = await listEntitiesForUser.execute(user);
            res.json({ entities: entities.map(toEntityDto) });
        },

        async listEntityTypes(_req, res) {
            res.json({ types: await listEntityTypes.execute() });
        },

        async getEntityType(req, res) {
            res.json(await getEntityType.execute(req.params.entityType));
        },

        // Describes a step's requirements without starting an authorization
        // session; GET /api/v2/authorize starts one.
        async getEntityTypeRequirements(req, res, user) {
            res.json(
                await getAuthorizationRequirements.execute({
                    entityType: req.params.entityType,
                    step: parseStep(req.query.step),
                    userId: user.getId(),
                })
            );
        },

        async getEntity(req, res, user) {
            res.json(toEntityDto(await getEntityForUser.execute(req.params.entityId, user)));
        },

        async deleteEntity(req, res, user) {
            await deleteEntityForUser.execute(req.params.entityId, user);
            res.status(204).end();
        },

        async testEntityAuth(req, res, user) {
            const ok = await testEntityAuthForUser.execute(req.params.entityId, user);
            res.json({ status: ok ? 'ok' : 'failed' });
        },

        async getEntityOptions(req, res, user) {
            res.json(await getEntityOptionsForUser.execute(req.params.entityId, user));
        },

        async refreshEntityOptions(req, res, user) {
            res.json(
                await refreshEntityOptionsForUser.execute(
                    req.params.entityId,
                    user,
                    objectBody(req)
                )
            );
        },
    };
}

module.exports = { createEntityHandlers };
