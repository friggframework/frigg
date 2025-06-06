const express = require('express');
const { get } = require('../assertions');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const { debug } = require('../logs');


// todo: dont send moduleFactory, integrationFactory, and IntegrationHelper as a factory object, instead send them as separate
// params and import IntegrationHelper where needed.
// todo: this could be a use case class
/**
 * Creates an Express router with integration and entity routes configured
 * @param {Object} params - Configuration parameters for the router
 * @param {express.Router} [params.router] - Optional Express router instance, creates new one if not provided
 * @param {Object} params.factory - Factory object containing moduleFactory, integrationFactory, and IntegrationHelper
 * @param {Object} params.factory.moduleFactory - Factory for creating and managing API modules
 * @param {Object} params.factory.integrationFactory - Factory for creating and managing integrations
 * @param {Object} params.factory.IntegrationHelper - Helper utilities for integration operations
 * @param {import('../user/use-cases/get-user-from-bearer-token').GetUserFromBearerToken} params.getUserFromBearerToken - Use case for retrieving a user from a bearer token
 * @returns {express.Router} Configured Express router with integration and entity routes
 */
function createIntegrationRouter(params) {
    const router = get(params, 'router', express());
    const factory = get(params, 'factory');
    const getUserFromBearerToken = get(params, 'getUserFromBearerToken');

    setIntegrationRoutes(router, factory, getUserFromBearerToken);
    setEntityRoutes(router, factory, getUserFromBearerToken);
    return router;
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
            `Missing Parameter${missingKeys.length === 1 ? '' : 's'
            }: ${missingKeys.join(', ')} ${missingKeys.length === 1 ? 'is' : 'are'
            } required.`
        );
    }
    return returnDict;
}

/**
 * Sets up integration-related routes on the provided Express router
 * @param {express.Router} router - Express router instance to add routes to
 * @param {Object} factory - Factory object containing moduleFactory, integrationFactory, and IntegrationHelper
 * @param {Object} factory.moduleFactory - Factory for creating and managing API modules
 * @param {Object} factory.integrationFactory - Factory for creating and managing integrations
 * @param {Object} factory.IntegrationHelper - Helper utilities for integration operations
 * @param {import('../user/use-cases/get-user-from-bearer-token').GetUserFromBearerToken} getUserFromBearerToken - Use case for retrieving a user from a bearer token
 */
function setIntegrationRoutes(router, factory, getUserFromBearerToken) {
    const { moduleFactory, integrationFactory, IntegrationHelper } = factory;
    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const results = await integrationFactory.getIntegrationOptions();
            results.entities.authorized =
                await moduleFactory.getEntitiesForUser(userId);
            results.integrations =
                await IntegrationHelper.getIntegrationsForUserId(userId);

            for (const integrationRecord of results.integrations) {
                const integration =
                    await integrationFactory.getInstanceFromIntegrationId({
                        integrationId: integrationRecord.id,
                        userId,
                    });
                integrationRecord.userActions = integration.userActions;
            }
            res.json(results);
        })
    );

    router.route('/api/integrations').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entities',
                'config',
            ]);
            // throw if not value
            get(params.config, 'type');

            // create integration
            const integration = await integrationFactory.createIntegration(
                params.entities,
                userId,
                params.config
            );

            // post integration initialization
            debug(
                `Calling onCreate on the ${integration?.constructor?.Config?.name} Integration with no arguments`
            );
            await integration.send('ON_CREATE', {});

            res.status(201).json(
                await IntegrationHelper.getFormattedIntegration(
                    integration.record
                )
            );
        })
    );

    router.route('/api/integrations/:integrationId').patch(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.body, ['config']);

            const integration =
                await integrationFactory.getInstanceFromIntegrationId({
                    integrationId: req.params.integrationId,
                    userId,
                });

            debug(
                `Calling onUpdate on the ${integration?.constructor?.Config?.name} Integration arguments: `,
                params
            );
            await integration.send('ON_UPDATE', params);

            res.json(
                await IntegrationHelper.getFormattedIntegration(
                    integration.record
                )
            );
        })
    );

    router.route('/api/integrations/:integrationId').delete(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['integrationId']);
            const integration =
                await integrationFactory.getInstanceFromIntegrationId({
                    userId,
                    integrationId: params.integrationId,
                });

            debug(
                `Calling onUpdate on the ${integration?.constructor?.Definition?.name} Integration with no arguments`
            );
            await integration.send('ON_DELETE');
            await IntegrationHelper.deleteIntegrationForUserById(
                userId,
                params.integrationId
            );

            res.status(201).json({});
        })
    );

    router.route('/api/integrations/:integrationId/config/options').get(
        catchAsyncError(async (req, res) => {
            await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const params = checkRequiredParams(req.params, ['integrationId']);
            const integration =
                await integrationFactory.getInstanceFromIntegrationId(params);
            res.json(await integration.send('GET_CONFIG_OPTIONS'));
        })
    );

    router
        .route('/api/integrations/:integrationId/config/options/refresh')
        .post(
            catchAsyncError(async (req, res) => {
                await getUserFromBearerToken.execute(
                    req.headers.authorization
                );
                const params = checkRequiredParams(req.params, [
                    'integrationId',
                ]);
                const integration =
                    await integrationFactory.getInstanceFromIntegrationId(
                        params
                    );

                res.json(
                    await integration.send('REFRESH_CONFIG_OPTIONS', req.body)
                );
            })
        );
    router.route('/api/integrations/:integrationId/actions').all(
        catchAsyncError(async (req, res) => {
            await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const params = checkRequiredParams(req.params, ['integrationId']);
            const integration =
                await integrationFactory.getInstanceFromIntegrationId(params);
            res.json(await integration.send('GET_USER_ACTIONS', req.body));
        })
    );

    router
        .route('/api/integrations/:integrationId/actions/:actionId/options')
        .all(
            catchAsyncError(async (req, res) => {
                await getUserFromBearerToken.execute(
                    req.headers.authorization
                );
                const params = checkRequiredParams(req.params, [
                    'integrationId',
                    'actionId',
                ]);
                const integration =
                    await integrationFactory.getInstanceFromIntegrationId(
                        params
                    );

                res.json(
                    await integration.send('GET_USER_ACTION_OPTIONS', {
                        actionId: params.actionId,
                        data: req.body,
                    })
                );
            })
        );

    router
        .route(
            '/api/integrations/:integrationId/actions/:actionId/options/refresh'
        )
        .post(
            catchAsyncError(async (req, res) => {
                await getUserFromBearerToken.execute(
                    req.headers.authorization
                );
                const params = checkRequiredParams(req.params, [
                    'integrationId',
                    'actionId',
                ]);
                const integration =
                    await integrationFactory.getInstanceFromIntegrationId(
                        params
                    );

                res.json(
                    await integration.send('REFRESH_USER_ACTION_OPTIONS', {
                        actionId: params.actionId,
                        data: req.body,
                    })
                );
            })
        );

    router.route('/api/integrations/:integrationId/actions/:actionId').post(
        catchAsyncError(async (req, res) => {
            await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const params = checkRequiredParams(req.params, [
                'integrationId',
                'actionId',
            ]);
            const integration =
                await integrationFactory.getInstanceFromIntegrationId(params);

            res.json(await integration.send(params.actionId, req.body));
        })
    );

    router.route('/api/integrations/:integrationId').get(
        catchAsyncError(async (req, res) => {
            await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const params = checkRequiredParams(req.params, ['integrationId']);
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['integrationId']);
            const instance =
                await integrationFactory.getInstanceFromIntegrationId({
                    userId,
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


/**
 * Sets up entity-related routes for the integration router
 * @param {Object} router - Express router instance
 * @param {Object} factory - Factory object containing moduleFactory and IntegrationHelper
 * @param {import('../user/use-cases/get-user-from-bearer-token').GetUserFromBearerToken} getUserFromBearerToken - Use case for retrieving a user from a bearer token
 */
function setEntityRoutes(router, factory, getUserFromBearerToken) {
    const { moduleFactory, IntegrationHelper } = factory;
    const getModuleInstance = async (userId, entityType) => {
        if (!moduleFactory.checkIsValidType(entityType)) {
            throw Boom.badRequest(
                `Error: Invalid entity type of ${entityType}, options are ${moduleFactory.moduleTypes.join(
                    ', '
                )}`
            );
        }
        return await moduleFactory.getInstanceFromTypeName(
            entityType,
            userId
        );
    };

    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.query, ['entityType']);
            const module = await getModuleInstance(userId, params.entityType);
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            const module = await getModuleInstance(userId, params.entityType);

            res.json(
                await module.processAuthorizationCallback({
                    userId,
                    data: params.data,
                })
            );
        })
    );

    router.route('/api/entity').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
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

            const module = await getModuleInstance(userId, params.entityType);
            const entityDetails = await module.getEntityDetails(
                module.api,
                null,
                null,
                userId
            );

            res.json(await module.findOrCreateEntity(entityDetails));
        })
    );

    router.route('/api/entity/options/:credentialId').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            // TODO May want to pass along the user ID as well so credential ID's can't be fished???
            // TODO **flagging this for review** -MW
            const credential = await IntegrationHelper.getCredentialById(
                req.params.credentialId
            );
            if (credential.user._id.toString() !== userId) {
                throw Boom.forbidden('Credential does not belong to user');
            }

            const params = checkRequiredParams(req.query, ['entityType']);
            const module = await getModuleInstance(userId, params.entityType);

            res.json(await module.getEntityOptions());
        })
    );

    router.route('/api/entities/:entityId/test-auth').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                userId
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
                            message: `There was an error with your ${module.getName()} Entity.  Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                            timestamp: Date.now(),
                        },
                    ],
                });
            } else {
                res.json({ status: 'ok' });
            }
        })
    );

    router.route('/api/entities/:entityId').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                userId
            );

            if (!module) {
                throw Boom.notFound();
            }

            res.json(module.entity);
        })
    );

    router.route('/api/entities/:entityId/options').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, [
                'entityId',
            ]);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                userId
            );

            if (!module) {
                throw Boom.notFound();
            }

            res.json(await module.getEntityOptions());
        })
    );

    router.route('/api/entities/:entityId/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, [
                'entityId',
            ]);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                userId
            );

            if (!module) {
                throw Boom.notFound();
            }

            res.json(await module.refreshEntityOptions(req.body));
        })
    );
}

module.exports = { createIntegrationRouter, checkRequiredParams };
