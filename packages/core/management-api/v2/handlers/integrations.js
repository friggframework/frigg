const { toIntegrationDto } = require('../dto');
const { objectBody, optionalString } = require('../request');

/**
 * Management API v2 integration handlers, keyed by registry operationId.
 * Each takes (req, res, user) after authentication and only calls use cases.
 */
function createIntegrationHandlers(useCases) {
    const {
        getIntegrationsForUser,
        getPossibleIntegrations,
        createIntegrationForUser,
        getIntegrationInstanceForUser,
        updateIntegrationForUser,
        removeIntegrationForUser,
        sendIntegrationEventForUser,
        runIntegrationActionForUser,
        testIntegrationAuthForUser,
    } = useCases;

    const send = (req, user, event, payload) =>
        sendIntegrationEventForUser.execute(
            req.params.integrationId,
            user,
            event,
            payload
        );

    return {
        async listIntegrations(_req, res, user) {
            const integrations = await getIntegrationsForUser.execute(user.getId());
            res.json({ integrations: integrations.map(toIntegrationDto) });
        },

        async listIntegrationOptions(_req, res) {
            res.json({ integrations: await getPossibleIntegrations.execute() });
        },

        async createIntegration(req, res, user) {
            const { entities, config } = objectBody(req);
            const integration = await createIntegrationForUser.execute(
                { entities, config },
                user
            );
            res.status(201).json(toIntegrationDto(integration));
        },

        async getIntegration(req, res, user) {
            const instance = await getIntegrationInstanceForUser.execute(
                req.params.integrationId,
                user
            );
            res.json(toIntegrationDto(instance));
        },

        async updateIntegration(req, res, user) {
            const { config } = objectBody(req);
            const integration = await updateIntegrationForUser.execute(
                req.params.integrationId,
                user,
                config
            );
            res.json(toIntegrationDto(integration));
        },

        async deleteIntegration(req, res, user) {
            await removeIntegrationForUser.execute(req.params.integrationId, user);
            res.status(204).end();
        },

        async getIntegrationConfigOptions(req, res, user) {
            res.json(await send(req, user, 'GET_CONFIG_OPTIONS'));
        },

        async refreshIntegrationConfigOptions(req, res, user) {
            res.json(await send(req, user, 'REFRESH_CONFIG_OPTIONS', objectBody(req)));
        },

        async listIntegrationActions(req, res, user) {
            const actionType = optionalString(req.query.actionType, 'actionType');
            res.json(
                await send(req, user, 'GET_USER_ACTIONS', actionType ? { actionType } : {})
            );
        },

        async getIntegrationActionOptions(req, res, user) {
            res.json(
                await send(req, user, 'GET_USER_ACTION_OPTIONS', {
                    actionId: req.params.actionId,
                    data: objectBody(req),
                })
            );
        },

        async refreshIntegrationActionOptions(req, res, user) {
            res.json(
                await send(req, user, 'REFRESH_USER_ACTION_OPTIONS', {
                    actionId: req.params.actionId,
                    data: objectBody(req),
                })
            );
        },

        async runIntegrationAction(req, res, user) {
            res.json(
                await runIntegrationActionForUser.execute(
                    req.params.integrationId,
                    user,
                    req.params.actionId,
                    objectBody(req)
                )
            );
        },

        async testIntegrationAuth(req, res, user) {
            const { ok, errors } = await testIntegrationAuthForUser.execute(
                req.params.integrationId,
                user
            );
            res.json(ok ? { status: 'ok' } : { status: 'failed', errors });
        },
    };
}

module.exports = { createIntegrationHandlers };
