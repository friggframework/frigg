const express = require('express');
const { get } = require('../assertions');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const { debug } = require('../logs');
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

function setIntegrationRoutes(router, factory, getUserId) {
    const {moduleFactory, integrationFactory, IntegrationHelper} = factory;
    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const results = await integrationFactory.getIntegrationOptions();
            results.entities.authorized = await moduleFactory.getEntitiesForUser(
                getUserId(req)
            );
            results.integrations = await IntegrationHelper.getIntegrationsForUserId(
                getUserId(req)
            );

            for (const integrationRecord of results.integrations) {
                const integration = await integrationFactory.getInstanceFromIntegrationId({
                    integrationId: integrationRecord.id,
                    userId: getUserId(req),
                });
                integrationRecord.userActions = integration.userActions;
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
                await integrationFactory.createIntegration(
                    params.entities,
                    getUserId(req),
                    params.config,
                    moduleFactory
                );

            // post integration initialization
            debug(
                `Calling onCreate on the ${integration?.constructor?.Config?.name} Integration with no arguments`
            );
            await integration.onCreate();

            // filtered set for results
            const response = await IntegrationHelper.getFormattedIntegration(
                integration.record
            );

            res.status(201).json(
                await IntegrationHelper.getFormattedIntegration(integration.record)
            );
        })
    );

    router.route('/api/integrations/:integrationId').patch(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.body, ['config']);

            const integration =
                await integrationFactory.getInstanceFromIntegrationId({
                    integrationId: req.params.integrationId,
                    userId: getUserId(req),
                });

            debug(
                `Calling onUpdate on the ${integration?.constructor?.Config?.name} Integration arguments: `,
                params
            );
            await integration.onUpdate(params);

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
                await integrationFactory.getInstanceFromIntegrationId({
                    userId: getUserId(req),
                    integrationId: params.integrationId,
                });

            debug(
                `Calling onUpdate on the ${integration?.constructor?.Config?.name} Integration with no arguments`
            );
            await integration.onDelete();
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
                await integrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.getConfigOptions();
            res.json(results);
        })
    );

    router.route('/api/integrations/:integrationId/config/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
            ]);
            const integration =
                await integrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.refreshConfigOptions(
                req.body
            );
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
                await integrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.getActionOptions(
                params.actionId
            );
            // We could perhaps augment router with dynamic options? Haven't decided yet, but here may be the place
            res.json(results);
        })
    );

    router.route('/api/integrations/:integrationId/actions/:actionId/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'integrationId',
                'actionId'
            ]);
            const integration =
                await integrationFactory.getInstanceFromIntegrationId(params);
            const results = await integration.refreshActionOptions(
                params.actionId,
                req.body
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
                await integrationFactory.getInstanceFromIntegrationId(params);
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
            const instance = await integrationFactory.getInstanceFromIntegrationId({
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

function setEntityRoutes(router, factory, getUserId) {
    const {moduleFactory, IntegrationHelper} = factory;
    const getModuleInstance = async (req, entityType) => {
        if (!moduleFactory.checkIsValidType(entityType)) {
            throw Boom.badRequest(
                `Error: Invalid entity type of ${entityType}, options are ${moduleFactory.moduleTypes.join(
                    ', '
                )}`
            );
        }
        return await moduleFactory.getInstanceFromTypeName(entityType, getUserId(req));
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
            console.log('post authorize', params);
            const module = await getModuleInstance(req, params.entityType);
            console.log('post authorize module', module);
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

    router.route('/api/entities/:entityId/test-auth').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
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
                            message: `There was an error with your ${module.getName()} Entity.  Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                            timestamp: Date.now(),
                        },
                    ],
                });
            } else {
                res.json({status: 'ok'});
            }
        })
    );

    router.route('/api/entities/:entityId').get(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                getUserId(req)
            );

            if (!module) {
                throw Boom.notFound();
            }
            res.json(module.entity);
        })
    );

    router.route('/api/entities/:entityId/options').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'entityId',
                getUserId(req)
            ]);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                getUserId(req)
            );

            if (!module) {
                throw Boom.notFound();
            }

            res.json(await module.getEntityOptions());
        })
    );

    router.route('/api/entities/:entityId/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const params = checkRequiredParams(req.params, [
                'entityId',
                getUserId(req)
            ]);
            const module = await moduleFactory.getModuleInstanceFromEntityId(
                params.entityId,
                getUserId(req)
            );

            if (!module) {
                throw Boom.notFound();
            }

            res.json(await module.refreshEntityOptions(req.body));
        })
    );
}

module.exports = { createIntegrationRouter, checkRequiredParams };
