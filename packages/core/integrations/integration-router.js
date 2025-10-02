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
    ProcessAuthorizationCallback,
} = require('../modules/use-cases/process-authorization-callback');
const {
    createAuthorizationSessionRepository,
} = require('../modules/repositories/authorization-session-repository-factory');
const {
    StartAuthorizationSessionUseCase,
} = require('../modules/use-cases/start-authorization-session');
const {
    ProcessAuthorizationStepUseCase,
} = require('../modules/use-cases/process-authorization-step');
const {
    GetAuthorizationRequirementsUseCase,
} = require('../modules/use-cases/get-authorization-requirements');

function createIntegrationRouter() {
    const { integrations: integrationClasses, userConfig } =
        loadAppDefinition();
    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository({ userConfig });
    const authSessionRepository = createAuthorizationSessionRepository();

    const getUserFromBearerToken = new GetUserFromBearerToken({
        userRepository,
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

    const moduleDefinitions =
        getModulesDefinitionFromIntegrationClasses(integrationClasses);

    const startAuthorizationSession = new StartAuthorizationSessionUseCase({
        authSessionRepository,
    });

    const processAuthorizationStep = new ProcessAuthorizationStepUseCase({
        authSessionRepository,
        moduleDefinitions,
    });

    const getAuthorizationRequirements = new GetAuthorizationRequirementsUseCase({
        moduleDefinitions,
    });

    const router = express();

    setIntegrationRoutes(router, getUserFromBearerToken, {
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    });
    setEntityRoutes(router, getUserFromBearerToken, {
        getCredentialForUser,
        getModuleInstanceFromType,
        getEntityOptionsByType,
        testModuleAuth,
        getModule,
        getEntityOptionsById,
        refreshEntityOptions,
        processAuthorizationCallback,
        moduleDefinitions,
        startAuthorizationSession,
        processAuthorizationStep,
        getAuthorizationRequirements,
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
 * @param {import('../user/use-cases/get-user-from-bearer-token').GetUserFromBearerToken} getUserFromBearerToken - Use case for retrieving a user from a bearer token
 * @param {Object} useCases - use cases for integration management
 */
function setIntegrationRoutes(router, getUserFromBearerToken, useCases) {
    const {
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    } = useCases;
    // GET /api/integrations - Get user's installed integrations
    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const integrations = await getIntegrationsForUser.execute(userId);

            res.json({ integrations });
        })
    );

    // GET /api/integrations/options - Get available integration options with module requirements
    router.route('/api/integrations/options').get(
        catchAsyncError(async (req, res) => {
            const options = await getPossibleIntegrations.execute();
            res.json({ integrations: options });
        })
    );

    // GET /api/entities - Get user's connected entities/accounts
    router.route('/api/entities').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const entities = await getEntitiesForUser.execute(userId);

            res.json({ entities });
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
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
                const user = await getUserFromBearerToken.execute(
                    req.headers.authorization
                );
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
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
                const user = await getUserFromBearerToken.execute(
                    req.headers.authorization
                );
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
                const user = await getUserFromBearerToken.execute(
                    req.headers.authorization
                );
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );

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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
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
 * @param {import('../user/use-cases/get-user-from-bearer-token').GetUserFromBearerToken} getUserFromBearerToken - Use case for retrieving a user from a bearer token
 */
function setEntityRoutes(router, getUserFromBearerToken, useCases) {
    const {
        getCredentialForUser,
        getModuleInstanceFromType,
        getEntityOptionsByType,
        testModuleAuth,
        getModule,
        getEntityOptionsById,
        refreshEntityOptions,
        processAuthorizationCallback,
        moduleDefinitions,
        startAuthorizationSession,
        processAuthorizationStep,
        getAuthorizationRequirements,
    } = useCases;

    // GET /api/authorize - Get authorization requirements (supports multi-step)
    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.query, ['entityType']);
            const step = parseInt(req.query.step || '1', 10);
            const sessionId = req.query.sessionId;

            // Validate session if step > 1
            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            // Check if module supports multi-step auth
            const requirements = await getAuthorizationRequirements.execute(
                params.entityType,
                step
            );

            // Generate session ID for multi-step flows on step 1
            if (requirements.isMultiStep && step === 1) {
                const crypto = require('crypto');
                requirements.sessionId = crypto.randomUUID();
            } else if (sessionId) {
                requirements.sessionId = sessionId;
            }

            // Validate requirements for backward compatibility
            if (!requirements.isMultiStep) {
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
            }

            res.json(requirements);
        })
    );

    // POST /api/authorize - Process authorization (supports multi-step)
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
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            // Find module definition to check step count
            const moduleDefinition = moduleDefinitions.find(
                (def) => def.moduleName === params.entityType
            );

            if (!moduleDefinition) {
                throw Boom.badRequest(
                    `Unknown entity type: ${params.entityType}`
                );
            }

            const ModuleDefinition = moduleDefinition.definition;
            const stepCount = ModuleDefinition.getAuthStepCount
                ? ModuleDefinition.getAuthStepCount()
                : 1;

            // Single-step flow - use existing ProcessAuthorizationCallback
            if (stepCount === 1) {
                const entityDetails =
                    await processAuthorizationCallback.execute(
                        userId,
                        params.entityType,
                        params.data
                    );

                return res.json(entityDetails);
            }

            // Multi-step flow
            if (!sessionId) {
                throw Boom.badRequest(
                    'sessionId required for multi-step authorization'
                );
            }

            let session;

            if (step === 1) {
                // Create new session for step 1
                session = await startAuthorizationSession.execute(
                    userId,
                    params.entityType,
                    stepCount
                );

                // Override with client-provided sessionId
                session.sessionId = sessionId;
                await useCases.authSessionRepository?.update(session);
            }

            // Process this step
            const result = await processAuthorizationStep.execute(
                sessionId,
                userId,
                step,
                params.data
            );

            if (result.completed) {
                // Final step - create entity using standard flow
                const entityDetails =
                    await processAuthorizationCallback.execute(
                        userId,
                        params.entityType,
                        result.authData
                    );

                return res.json(entityDetails);
            }

            // Return next step requirements
            res.json({
                step: result.nextStep,
                totalSteps: result.totalSteps,
                sessionId: result.sessionId,
                requirements: result.requirements,
                message: result.message,
            });
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            // TODO May want to pass along the user ID as well so credential ID's can't be fished???
            // TODO **flagging this for review** -MW
            const credential = await getCredentialForUser.execute(
                req.params.credentialId,
                userId
            );
            if (credential.user._id.toString() !== userId) {
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
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);
            const testAuthResponse = await testModuleAuth.execute(
                params.entityId,
                userId
            );

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
            const module = await getModule.execute(params.entityId, userId);

            res.json(module);
        })
    );

    router.route('/api/entities/:entityId/options').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);

            const entityOptions = await getEntityOptionsById.execute(
                params.entityId,
                userId
            );

            res.json(entityOptions);
        })
    );

    router.route('/api/entities/:entityId/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);
            const updatedOptions = await refreshEntityOptions.execute(
                params.entityId,
                userId,
                req.body
            );

            res.json(updatedOptions);
        })
    );
}

module.exports = { createIntegrationRouter, checkRequiredParams };
