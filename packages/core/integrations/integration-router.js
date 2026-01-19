const express = require('express');
const { get } = require('../assertions');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const {
    createIntegrationRepository,
} = require('./repositories/integration-repository-factory');
const {
    DeleteIntegrationForUser,
} = require('./use-cases/delete-integration-for-user');
const {
    GetIntegrationsForUser,
} = require('./use-cases/get-integrations-for-user');
const {
    createCredentialRepository,
} = require('../credential/repositories/credential-repository-factory');
const {
    GetCredentialForUser,
} = require('../credential/use-cases/get-credential-for-user');
const { CreateIntegration } = require('./use-cases/create-integration');
const { ModuleFactory } = require('../modules/module-factory');
const {
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');
const {
    GetEntitiesForUser,
} = require('../modules/use-cases/get-entities-for-user');
const { loadAppDefinition } = require('../handlers/app-definition-loader');
const {
    GetIntegrationInstance,
} = require('./use-cases/get-integration-instance');
const { UpdateIntegration } = require('./use-cases/update-integration');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('./utils/map-integration-dto');
const {
    GetModuleInstanceFromType,
} = require('../modules/use-cases/get-module-instance-from-type');
const {
    GetEntityOptionsByType,
} = require('../modules/use-cases/get-entity-options-by-type');
const { TestModuleAuth } = require('../modules/use-cases/test-module-auth');
const { GetModule } = require('../modules/use-cases/get-module');
const {
    GetEntityOptionsById,
} = require('../modules/use-cases/get-entity-options-by-id');
const {
    RefreshEntityOptions,
} = require('../modules/use-cases/refresh-entity-options');
const {
    GetPossibleIntegrations,
} = require('./use-cases/get-possible-integrations');
const {
    createUserRepository,
} = require('../user/repositories/user-repository-factory');
const {
    GetUserFromBearerToken,
} = require('../user/use-cases/get-user-from-bearer-token');
const {
    GetUserFromXFriggHeaders,
} = require('../user/use-cases/get-user-from-x-frigg-headers');
const {
    GetUserFromAdopterJwt,
} = require('../user/use-cases/get-user-from-adopter-jwt');
const {
    AuthenticateWithSharedSecret,
} = require('../user/use-cases/authenticate-with-shared-secret');
const { AuthenticateUser } = require('../user/use-cases/authenticate-user');
const {
    ProcessAuthorizationCallback,
} = require('../modules/use-cases/process-authorization-callback');

function createIntegrationRouter() {
    const { integrations: integrationClasses, userConfig } =
        loadAppDefinition();
    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository();

    const getUserFromBearerToken = new GetUserFromBearerToken({
        userRepository,
        userConfig,
    });

    const getUserFromXFriggHeaders = new GetUserFromXFriggHeaders({
        userRepository,
        userConfig,
    });

    const getUserFromAdopterJwt = new GetUserFromAdopterJwt({
        userRepository,
        userConfig,
    });

    const authenticateWithSharedSecret = new AuthenticateWithSharedSecret();

    const authenticateUser = new AuthenticateUser({
        getUserFromBearerToken,
        getUserFromXFriggHeaders,
        getUserFromAdopterJwt,
        authenticateWithSharedSecret,
        userConfig,
    });

    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });
    const deleteIntegrationForUser = new DeleteIntegrationForUser({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const getIntegrationsForUser = new GetIntegrationsForUser({
        integrationRepository,
        integrationClasses,
        moduleFactory,
        moduleRepository,
    });

    const getCredentialForUser = new GetCredentialForUser({
        credentialRepository,
    });

    const createIntegration = new CreateIntegration({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const getEntitiesForUser = new GetEntitiesForUser({
        moduleRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const updateIntegration = new UpdateIntegration({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const getModuleInstanceFromType = new GetModuleInstanceFromType({
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getEntityOptionsByType = new GetEntityOptionsByType({
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const testModuleAuth = new TestModuleAuth({
        moduleRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getModule = new GetModule({
        moduleRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getEntityOptionsById = new GetEntityOptionsById({
        moduleRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const refreshEntityOptions = new RefreshEntityOptions({
        moduleRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getPossibleIntegrations = new GetPossibleIntegrations({
        integrationClasses,
    });

    const processAuthorizationCallback = new ProcessAuthorizationCallback({
        moduleRepository,
        credentialRepository,
        moduleDefinitions:
            getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const router = express();

    setIntegrationRoutes(router, authenticateUser, {
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    });
    setEntityRoutes(router, authenticateUser, {
        getCredentialForUser,
        getModuleInstanceFromType,
        getEntityOptionsByType,
        testModuleAuth,
        getModule,
        getEntityOptionsById,
        refreshEntityOptions,
        processAuthorizationCallback,
    });
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

/**
 * Sets up integration-related routes on the provided Express router
 * @param {express.Router} router - Express router instance to add routes to
 * @param {import('../user/use-cases/authenticate-user').AuthenticateUser} authenticateUser - Use case for multi-mode user authentication
 * @param {Object} useCases - use cases for integration management
 */
function setIntegrationRoutes(router, authenticateUser, useCases) {
    const {
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    } = useCases;
    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const integrations = await getIntegrationsForUser.execute(userId);
            const results = {
                entities: {
                    options: await getPossibleIntegrations.execute(),
                    authorized: await getEntitiesForUser.execute(userId),
                },
                integrations: integrations,
            };

            res.json(results);
        })
    );

    router.route('/api/integrations').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entities',
                'config',
            ]);

            get(params.config, 'type');

            const integration = await createIntegration.execute(
                params.entities,
                userId,
                params.config
            );

            res.status(201).json(integration);
        })
    );

    router.route('/api/integrations/:integrationId').patch(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, ['config']);

            const integration = await updateIntegration.execute(
                req.params.integrationId,
                userId,
                params.config
            );
            res.json(integration);
        })
    );

    router.route('/api/integrations/:integrationId').delete(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['integrationId']);
            await deleteIntegrationForUser.execute(
                params.integrationId,
                user.getId()
            );
            res.status(204).json({});
        })
    );

    router.route('/api/integrations/:integrationId/config/options').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            );
            res.json(await integration.send('GET_CONFIG_OPTIONS'));
        })
    );

    router
        .route('/api/integrations/:integrationId/config/options/refresh')
        .post(
            catchAsyncError(async (req, res) => {
                const user = await authenticateUser.execute(req);
                const params = checkRequiredParams(req.params, [
                    'integrationId',
                ]);
                const integration = await getIntegrationInstance.execute(
                    params.integrationId,
                    user.getId()
                );

                res.json(
                    await integration.send('REFRESH_CONFIG_OPTIONS', req.body)
                );
            })
        );
    router.route('/api/integrations/:integrationId/actions').all(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            );
            res.json(await integration.send('GET_USER_ACTIONS', req.body));
        })
    );

    router
        .route('/api/integrations/:integrationId/actions/:actionId/options')
        .all(
            catchAsyncError(async (req, res) => {
                const user = await authenticateUser.execute(req);
                const params = checkRequiredParams(req.params, [
                    'integrationId',
                    'actionId',
                ]);
                const integration = await getIntegrationInstance.execute(
                    params.integrationId,
                    user.getId()
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
                const user = await authenticateUser.execute(req);
                const params = checkRequiredParams(req.params, [
                    'integrationId',
                    'actionId',
                ]);
                const integration = await getIntegrationInstance.execute(
                    params.integrationId,
                    user.getId()
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
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, [
                'integrationId',
                'actionId',
            ]);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            );
            res.json(await integration.send(params.actionId, req.body));
        })
    );

    router.route('/api/integrations/:integrationId').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);

            if (!user) {
                throw Boom.forbidden('User not found');
            }

            const params = checkRequiredParams(req.params, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
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
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['integrationId']);
            const instance = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            );

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
 * @param {import('../user/use-cases/authenticate-user').AuthenticateUser} authenticateUser - Use case for multi-mode user authentication
 */
function setEntityRoutes(router, authenticateUser, useCases) {
    const {
        getCredentialForUser,
        getModuleInstanceFromType,
        getEntityOptionsByType,
        testModuleAuth,
        getModule,
        getEntityOptionsById,
        refreshEntityOptions,
        processAuthorizationCallback,
    } = useCases;

    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.query, ['entityType']);
            const module = await getModuleInstanceFromType.execute(
                userId,
                params.entityType
            );
            const areRequirementsValid =
                module.validateAuthorizationRequirements();
            if (!areRequirementsValid) {
                throw new Error(
                    `Error: Entity of type ${params.entityType} requires a valid url`
                );
            }

            res.json(module.getAuthorizationRequirements());
        })
    );

    router.route('/api/authorize').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);

            console.log('[Auth] /api/authorize POST', {
                entityType: params.entityType,
                dataKeys: params.data ? Object.keys(params.data) : [],
                userId,
                hasHeaders: !!req.headers,
                requestId:
                    req.headers?.['x-amzn-trace-id'] ||
                    req.headers?.['x-request-id'] ||
                    req.headers?.['x-amz-cf-id'] ||
                    null,
            });

            const entityDetails = await processAuthorizationCallback.execute(
                userId,
                params.entityType,
                params.data
            );

            res.json(entityDetails);
        })
    );

    router.route('/api/entity').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            checkRequiredParams(req.body.data, ['credential_id']);

            // May want to pass along the user ID as well so credential ID's can't be fished???
            const credential = await getCredentialForUser.execute(
                params.data.credential_id,
                userId
            );

            if (!credential) {
                throw Boom.badRequest('Invalid credential ID');
            }

            const module = await getModuleInstanceFromType.execute(
                userId,
                params.entityType
            );
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
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            // TODO May want to pass along the user ID as well so credential ID's can't be fished???
            // TODO **flagging this for review** -MW
            const credential = await getCredentialForUser.execute(
                req.params.credentialId,
                userId
            );
            if (credential.userId.toString() !== userId) {
                throw Boom.forbidden('Credential does not belong to user');
            }

            const params = checkRequiredParams(req.query, ['entityType']);
            const entityOptions = await getEntityOptionsByType.execute(
                userId,
                params.entityType
            );

            res.json(entityOptions);
        })
    );

    router.route('/api/entities/:entityId/test-auth').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const testAuthResponse = await testModuleAuth.execute(
                params.entityId,
                user // Pass User object for proper validation
            );

            if (!testAuthResponse) {
                res.status(400);
                res.json({
                    errors: [
                        {
                            title: 'Authentication Error',
                            message: `There was an error with your Entity. Please reconnect/re-authenticate, or reach out to Support for assistance.`,
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
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await getModule.execute(params.entityId, user); // Pass User object

            res.json(module);
        })
    );

    router.route('/api/entities/:entityId/options').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);

            const entityOptions = await getEntityOptionsById.execute(
                params.entityId,
                user // Pass User object
            );

            res.json(entityOptions);
        })
    );

    router.route('/api/entities/:entityId/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const updatedOptions = await refreshEntityOptions.execute(
                params.entityId,
                user, // Pass User object
                req.body
            );

            res.json(updatedOptions);
        })
    );
}

module.exports = { createIntegrationRouter, checkRequiredParams };
