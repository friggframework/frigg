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
const {
    ListCredentialsForUser,
} = require('../credential/use-cases/list-credentials-for-user');
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
const {
    CreateOAuth2SessionUseCase,
} = require('../modules/use-cases/create-oauth2-session');
const { ReauthorizeEntity } = require('../modules/use-cases/reauthorize-entity');

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

    const listCredentialsForUser = new ListCredentialsForUser({
        credentialRepository,
        moduleRepository,
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

    const createOAuth2Session = new CreateOAuth2SessionUseCase({
        authSessionRepository,
    });

    const getAuthorizationRequirements = new GetAuthorizationRequirementsUseCase({
        moduleDefinitions,
        createOAuth2Session,
    });

    const reauthorizeEntity = new ReauthorizeEntity({
        moduleRepository,
        credentialRepository,
        authSessionRepository,
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
        listCredentialsForUser,
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
        reauthorizeEntity,
        credentialRepository,
        moduleRepository,
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
        listCredentialsForUser,
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
        reauthorizeEntity,
        credentialRepository,
        moduleRepository,
    } = useCases;

    // ========================================
    // LEGACY ROUTES (Deprecated - use /api/modules/:moduleType/authorization instead)
    // These routes are kept temporarily for backwards compatibility
    // TODO: Remove these routes in next major version
    // ========================================

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

    // ========================================
    // CREDENTIAL MANAGEMENT ROUTES (API v2)
    // ========================================

    // GET /api/credentials - List user's credentials with filters
    router.route('/api/credentials').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();

            const filters = {
                status: req.query.status,
                moduleType: req.query.moduleType,
            };

            const credentials = await listCredentialsForUser.execute(userId, filters);

            res.json({ credentials });
        })
    );

    // GET /api/credentials/:credentialId - Get credential details
    router.route('/api/credentials/:credentialId').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['credentialId']);

            const credential = await credentialRepository.findCredentialById(
                params.credentialId
            );

            if (!credential) {
                throw Boom.notFound('Credential not found');
            }

            if (credential.userId !== userId) {
                throw Boom.forbidden('Credential does not belong to user');
            }

            // Get entities using this credential
            const entities = await moduleRepository.findEntities({
                user: userId,
                credential: params.credentialId
            });

            // Sanitize credential (remove secrets)
            res.json({
                id: credential.id,
                userId: credential.userId,
                externalId: credential.externalId,
                authIsValid: credential.auth_is_valid,
                subType: credential.subType,
                hasEntity: entities.length > 0,
                entities: entities.map(e => ({
                    id: e.id,
                    moduleName: e.moduleName,
                    name: e.name
                }))
                // NOTE: NO access_token, refresh_token, or secrets
            });
        })
    );

    // DELETE /api/credentials/:credentialId - Delete credential
    router.route('/api/credentials/:credentialId').delete(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['credentialId']);

            const credential = await credentialRepository.findCredentialById(
                params.credentialId
            );

            if (!credential) {
                throw Boom.notFound('Credential not found');
            }

            if (credential.userId !== userId) {
                throw Boom.forbidden('Credential does not belong to user');
            }

            // Check for dependent entities
            const entities = await moduleRepository.findEntities({
                user: userId,
                credential: params.credentialId
            });

            if (entities.length > 0 && req.query.cascade !== 'true') {
                throw Boom.badRequest(
                    `Cannot delete credential. ${entities.length} entities depend on it. Use ?cascade=true to delete entities.`,
                    {
                        entities: entities.map(e => ({
                            id: e.id,
                            name: e.name
                        }))
                    }
                );
            }

            // Delete dependent entities if cascade
            if (req.query.cascade === 'true') {
                for (const entity of entities) {
                    await moduleRepository.deleteEntity(entity.id);
                }
            }

            // Delete credential
            await credentialRepository.deleteCredentialById(params.credentialId);

            res.status(204).send();
        })
    );

    // ========================================
    // ENTITY RE-AUTHENTICATION ROUTES (API v2)
    // ========================================

    // POST /api/entities/:entityId/reauthorize - Initiate re-authorization
    router.route('/api/entities/:entityId/reauthorize').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);

            const result = await reauthorizeEntity.initiateReauthorization(
                params.entityId,
                userId
            );

            res.json(result);
        })
    );

    // POST /api/entities/:entityId/reauthorize/complete - Complete re-authorization
    router.route('/api/entities/:entityId/reauthorize/complete').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['entityId']);
            const bodyParams = checkRequiredParams(req.body, ['sessionId', 'data']);

            const entity = await reauthorizeEntity.completeReauthorization(
                params.entityId,
                userId,
                bodyParams.sessionId,
                bodyParams.data
            );

            res.json({
                completed: true,
                entity
            });
        })
    );

    // ========================================
    // MISSING CREDENTIAL ROUTES (Use Cases Not Yet Implemented)
    // ========================================
    // TODO: Implement these routes when use cases are created:
    //
    // GET /api/credentials/:credentialId/test
    //   - Test credential validity
    //   - Use case: TestCredentialUseCase (not yet implemented)
    //
    // POST /api/credentials/:credentialId/resume
    //   - Resume authorization from existing credential
    //   - Use case: ResumeAuthorizationFromCredentialUseCase (not yet implemented)
    //
    // GET /api/credentials/:credentialId/options
    //   - Get entity options using credential (e.g., workspaces, orgs)
    //   - Use case: GetEntityOptionsByCredentialUseCase (not yet implemented)
    // ========================================

    // ========================================
    // MODULE-LEVEL AUTHORIZATION ROUTES (API v2 RESTful)
    // ========================================

    // GET /api/modules - List available modules
    router.route('/api/modules').get(
        catchAsyncError(async (req, res) => {
            const modules = moduleDefinitions.map(def => {
                const ModuleDefinition = def.definition;

                // Determine step count safely (default to single-step if method doesn't exist)
                let stepCount = 1;
                if (ModuleDefinition.getAuthStepCount && typeof ModuleDefinition.getAuthStepCount === 'function') {
                    try {
                        stepCount = ModuleDefinition.getAuthStepCount();
                    } catch (error) {
                        console.warn(`Error calling getAuthStepCount for ${def.moduleName}:`, error.message);
                        stepCount = 1; // Fallback to single-step
                    }
                } else if (def.apiClass && def.apiClass.getAuthStepCount && typeof def.apiClass.getAuthStepCount === 'function') {
                    try {
                        stepCount = def.apiClass.getAuthStepCount();
                    } catch (error) {
                        console.warn(`Error calling getAuthStepCount on API class for ${def.moduleName}:`, error.message);
                        stepCount = 1; // Fallback to single-step
                    }
                }

                return {
                    moduleType: def.moduleName,
                    name: ModuleDefinition.getName ? ModuleDefinition.getName() : def.moduleName,
                    isMultiStep: stepCount > 1,
                    stepCount: stepCount,
                    // Add more metadata as needed from module definition
                };
            });

            res.json({ modules });
        })
    );

    // GET /api/modules/:moduleType/authorization - Get authorization requirements
    router.route('/api/modules/:moduleType/authorization').get(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['moduleType']);
            const step = parseInt(req.query.step || '1', 10);
            const sessionId = req.query.sessionId;

            // Validate session if step > 1
            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            // Extract redirect context from query parameters
            const redirectContext = req.query.source ? {
                source: req.query.source, // 'management-ui' | 'frigg-ui-library'
                returnUrl: req.query.returnUrl || '/',
                frontendBaseUrl: req.query.frontendBaseUrl || null, // Frontend origin for OAuth redirects
                userId: userId
            } : null;

            const requirements = await getAuthorizationRequirements.execute(
                params.moduleType,
                step,
                redirectContext
            );

            // Generate session ID for multi-step flows on step 1
            if (requirements.isMultiStep && step === 1) {
                const crypto = require('crypto');
                requirements.sessionId = crypto.randomUUID();
            } else if (sessionId) {
                requirements.sessionId = sessionId;
            }

            res.json(requirements);
        })
    );

    // POST /api/modules/:moduleType/authorization - Submit authorization
    router.route('/api/modules/:moduleType/authorization').post(
        catchAsyncError(async (req, res) => {
            const user = await getUserFromBearerToken.execute(
                req.headers.authorization
            );
            const userId = user.getId();
            const params = checkRequiredParams(req.params, ['moduleType']);
            const bodyParams = checkRequiredParams(req.body, ['data']);
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            // Find module definition to check step count
            const moduleDefinition = moduleDefinitions.find(
                (def) => def.moduleName === params.moduleType
            );

            if (!moduleDefinition) {
                throw Boom.badRequest(
                    `Unknown module type: ${params.moduleType}`
                );
            }

            const ModuleDefinition = moduleDefinition.definition;

            // Determine step count safely (default to single-step if method doesn't exist)
            let stepCount = 1;
            if (ModuleDefinition.getAuthStepCount && typeof ModuleDefinition.getAuthStepCount === 'function') {
                try {
                    stepCount = ModuleDefinition.getAuthStepCount();
                } catch (error) {
                    console.warn(`Error calling getAuthStepCount for ${params.moduleType}:`, error.message);
                    stepCount = 1; // Fallback to single-step
                }
            } else if (ModuleDefinition.API && ModuleDefinition.API.getAuthStepCount && typeof ModuleDefinition.API.getAuthStepCount === 'function') {
                try {
                    stepCount = ModuleDefinition.API.getAuthStepCount();
                } catch (error) {
                    console.warn(`Error calling getAuthStepCount on API class for ${params.moduleType}:`, error.message);
                    stepCount = 1; // Fallback to single-step
                }
            }

            // Single-step flow
            if (stepCount === 1) {
                // Pass the full bodyParams - let the API module decide what structure it expects
                const entityDetails = await processAuthorizationCallback.execute(
                    userId,
                    params.moduleType,
                    bodyParams
                );

                return res.json({
                    completed: true,
                    entity: {
                        id: entityDetails.entity_id,
                        moduleType: params.moduleType,
                        credentialId: entityDetails.credential_id,
                        type: entityDetails.type
                    }
                });
            }

            // Multi-step flow
            if (!sessionId) {
                throw Boom.badRequest(
                    'sessionId required for multi-step authorization'
                );
            }

            let session;
            if (step === 1) {
                session = await startAuthorizationSession.execute(
                    userId,
                    params.moduleType,
                    stepCount
                );
                session.sessionId = sessionId;
                await useCases.authSessionRepository?.update(session);
            }

            // Pass the full bodyParams - let the API module decide what structure it expects
            const result = await processAuthorizationStep.execute(
                sessionId,
                userId,
                step,
                bodyParams
            );

            if (result.completed) {
                const entityDetails = await processAuthorizationCallback.execute(
                    userId,
                    params.moduleType,
                    result.authData
                );

                return res.json({
                    completed: true,
                    entity: {
                        id: entityDetails.entity_id,
                        moduleType: params.moduleType,
                        credentialId: entityDetails.credential_id,
                        type: entityDetails.type
                    }
                });
            }

            res.json({
                completed: false,
                step: result.nextStep,
                totalSteps: result.totalSteps,
                sessionId: result.sessionId,
                requirements: result.requirements,
                message: result.message,
            });
        })
    );

}

module.exports = { createIntegrationRouter, checkRequiredParams };
