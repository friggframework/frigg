const express = require('express');
const { get } = require('@friggframework/assertions');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const { debug } = require('@friggframework/logs');

function createIntegrationRouter(params) {
    const router = get(params, 'router', express());
    const factory = get(params, 'factory');
    const getUserId = get(params, 'getUserId', (req) => null);
    const requireLoggedInUser = get(params, 'requireLoggedInUser', (req, res, next) => next());

    router.all('/api/entities*', requireLoggedInUser);
    router.all('/api/authorize', requireLoggedInUser);
    router.all('/api/integrations*', requireLoggedInUser);

    setIntegrationRoutes(router, factory, getUserId);
    setEntityRoutes(router, factory, getUserId);
    return router;
}

function setIntegrationRoutes(router, factory, getUserId) {
    const {ModuleFactory, IntegrationFactory, IntegrationHelper} = factory;
    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const results = await IntegrationFactory.getIntegrationOptions();

            // get the list of entities
            const entities = await ModuleFactory.getEntitiesForUser(
                getUserId(req)
            );
            results.entities.authorized = entities;

            // get the list of integrations
            results.integrations =
                await IntegrationHelper.getIntegrationsForUserId(
                    getUserId(req)
                );

            for (const integrationRecord of results.integrations) {
                // Load integration instance and get userActions
                const integration = await IntegrationFactory.getInstanceFromIntegrationId({
                    integrationId: integrationRecord.id,
                    userId: getUserId(req),
                });
                integrationRecord.userActions = await integration.getUserActions();
            }

            res.json(results);
        })
    );

    router.route('/api/integrations').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.body, [
                'entities',
                'config',
            ]);
            // throw if not value
            get(params.config, 'type');

            // create integration
            const integration =
                await IntegrationFactory.createIntegration(
                    params.entities,
                    getUserId(req),
                    params.config,
                    ModuleFactory
                );

            // post integration initialization
            debug(
                `Calling processCreate on the ${integration?.constructor?.Config?.name} Integration with no arguments`
            );
            await integration.processCreate();

            // filtered set for results
            const response = await IntegrationHelper.getFormattedIntegration(
                integration.record
            );
            res.status(201);
            res.json(response);
        })
    );

    router.route('/api/integrations/:integrationId').patch(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.body, ['config']);

            const integration =
                await IntegrationFactory.getInstanceFromIntegrationId({
                    integrationId: req.params.integrationId,
                    userId: getUserId(req),
                });

            debug(
                `Calling processUpdate on the ${integration?.constructor?.Config?.name} Integration arguments: `,
                params
            );
            await integration.processUpdate(params);

            const response = await IntegrationHelper.getFormattedIntegration(
                integration.record
            );

            res.json(response);
        })
    );

    router.route('/api/integrations/:integrationId').delete(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
            ]);
            const integration =
                await IntegrationFactory.getInstanceFromIntegrationId({
                    userId: getUserId(req),
                    integrationId: params.integrationId,
                });

            debug(
                `Calling processUpdate on the ${integration?.constructor?.Config?.name} Integration with no arguments`
            );
            await integration.processDelete();
            await IntegrationHelper.deleteIntegrationForUserById(
                getUserId(req),
                params.integrationId
            );

            res.status(201);
            res.json({});
        })
    );

    router.route('/api/integrations/:integrationId/config/options').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
            ]);
            const integration =
                await IntegrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.getConfigOptions();
            // We could perhaps augment router with dynamic options? Haven't decided yet, but here may be the place
            res.json(results);
        })
    );

    router.route('/api/integrations/:integrationId/actions/:actionId/options').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
                'actionId'
            ]);
            const integration =
                await IntegrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.getActionOptions(
                params.actionId
            );
            // We could perhaps augment router with dynamic options? Haven't decided yet, but here may be the place
            res.json(results);
        })
    );

    router.route('/api/integrations/:integrationId/actions/:actionId').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
                'actionId'
            ]);
            const integration =
                await IntegrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.notify(
                params.actionId,
                req.body
            );
            // We could perhaps augment router with dynamic options? Haven't decided yet, but here may be the place
            res.json(results);
        })
    )

    router.route('/api/integrations/:integrationId').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
            ]);
            const integration = await IntegrationHelper.getIntegrationById(
                params.integrationId
            );
            // We could perhaps augment router with dynamic options? Haven't decided yet, but here may be the place

            res.json({
                id: integration.id,
                entities: integration.entities,
                status: integration.status,
                config: integration.config,
            });
        })
    );

    router.route('/api/integrations/:integrationId/test-auth').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
            ]);
            const instance = await IntegrationFactory.getInstanceFromIntegrationId({
                userId: getUserId(req),
                integrationId: params.integrationId,
            });

            if (!instance) {
                throw Boom.notFound();
            }

            const start = Date.now();
            await instance.testAuth();
            const errors = instance.record.messages?.errors?.filter(
                ({ timestamp }) => timestamp >= start
            );

            if (errors?.length) {
                res.status(400);
                res.json({ errors });
            } else {
                res.json({ status: 'ok' });
            }
        })
    );
}

function checkRequiredParams(params, requiredKeys) {
    const missingKeys = [];
    const returnDict = {};
    for (const key of requiredKeys) {
        const val = get(params, key, null);
        if (val) {
            returnDict[key] = val;
        } else {
            missingKeys.push(key);
        }
    }

    if (missingKeys.length > 0) {
        throw Boom.badRequest(
            `Missing Parameter${
                missingKeys.length === 1 ? '' : 's'
            }: ${missingKeys.join(', ')} ${
                missingKeys.length === 1 ? 'is' : 'are'
            } required.`
        );
    }
    return returnDict;
}
function setEntityRoutes(router, factory, getUserId) {
    const {ModuleFactory, IntegrationHelper} = factory;
    const getModuleInstance = async (req, entityType) => {
        if (!ModuleFactory.checkIsValidType(entityType)) {
            throw Boom.badRequest(
                `Error: Invalid entity type of ${entityType}, options are ${ModuleFactory.moduleTypes.join(
                    ', '
                )}`
            );
        }
        return await ModuleFactory.getInstanceFromTypeName(entityType, getUserId(req));
    };

    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.query, [
                'entityType',
            ]);
            const module = await getModuleInstance(req, params.entityType);
            const areRequirementsValid =
                module.validateAuthorizationRequirements();
            if (!areRequirementsValid) {
                throw new Error(
                    `Error: EntityManager of type ${params.entityType} requires a valid url`
                );
            }
            res.json(await module.getAuthorizationRequirements());
        })
    );

    router.route('/api/authorize').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            const module = await getModuleInstance(req, params.entityType);
            const results = await module.processAuthorizationCallback({
                userId: getUserId(req),
                data: params.data,
            });

            res.json(results);
        })
    );

    router.route('/api/entity/options/:credentialId').get(
        catchAsyncError(async (req, res) => {
            // TODO May want to pass along the user ID as well so credential ID's can't be fished???
            // TODO **flagging this for review** -MW
            const credential = await IntegrationHelper.getCredentialById(
                req.params.credentialId
            );
            if (credential.user._id.toString() !== getUserId(req)) {
                throw Boom.forbidden('Credential does not belong to user');
            }

            const params = checkRequiredParams(req.query, [
                'entityType',
            ]);
            const module = await getModuleInstance(req, params.entityType);

            res.json(await module.getEntityOptions());
        })
    );

    router.route('/api/entity').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            checkRequiredParams(req.body.data, ['credential_id']);

            // May want to pass along the user ID as well so credential ID's can't be fished???
            const credential = await IntegrationHelper.getCredentialById(
                params.data.credential_id
            );

            if (!credential) {
                throw Boom.badRequest('Invalid credential ID');
            }

            const module = await getModuleInstance(req, params.entityType);
            res.json(await module.findOrCreateEntity(params.data));
        })
    );

    router.route('/api/entities/:entityId/test-auth').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await ModuleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                getUserId(req)
            );

            if (!module) {
                throw Boom.notFound();
            }

            const testAuthResponse = await module.testAuth();

            if (!testAuthResponse) {
                res.status(400);
                res.json({
                    errors: [
                        {
                            title: 'Authentication Error',
                            message: `There was an error with your ${module.constructor.getName()} Entity.  Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                            timestamp: Date.now(),
                        },
                    ],
                });
            } else {
                res.json({status: 'ok'});
            }
        })
    );
}

module.exports = { createIntegrationRouter };
