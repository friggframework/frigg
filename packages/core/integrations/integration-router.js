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
const {
    DeleteCredentialForUser,
} = require('../credential/use-cases/delete-credential-for-user');
const {
    ReauthorizeCredential,
} = require('../credential/use-cases/reauthorize-credential');
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
const { ExecuteProxyRequest } = require('./use-cases/execute-proxy-request');

function createIntegrationRouter() {
    const { integrations: integrationClasses, userConfig } =
        loadAppDefinition();
    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository();
    const authSessionRepository = createAuthorizationSessionRepository();

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

    // Support both integration classes and direct module definitions (for testing)
    const isModuleDefinitionFormat =
        integrationClasses &&
        integrationClasses[0] &&
        integrationClasses[0].moduleName &&
        integrationClasses[0].definition;

    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions: isModuleDefinitionFormat
            ? integrationClasses
            : getModulesDefinitionFromIntegrationClasses(integrationClasses),
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

    const listCredentialsForUser = new ListCredentialsForUser({
        credentialRepository,
    });

    const deleteCredentialForUser = new DeleteCredentialForUser({
        credentialRepository,
    });

    const reauthorizeCredential = new ReauthorizeCredential({
        credentialRepository,
        moduleRepository,
    });

    const createIntegration = new CreateIntegration({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const moduleDefinitions = isModuleDefinitionFormat
        ? integrationClasses
        : getModulesDefinitionFromIntegrationClasses(integrationClasses);

    const getEntitiesForUser = new GetEntitiesForUser({
        moduleRepository,
        moduleDefinitions,
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
        moduleDefinitions,
    });

    const getEntityOptionsByType = new GetEntityOptionsByType({
        moduleDefinitions,
    });

    const testModuleAuth = new TestModuleAuth({
        moduleRepository,
        moduleDefinitions,
    });

    const getModule = new GetModule({
        moduleRepository,
        moduleDefinitions,
    });

    const getEntityOptionsById = new GetEntityOptionsById({
        moduleRepository,
        moduleDefinitions,
    });

    const refreshEntityOptions = new RefreshEntityOptions({
        moduleRepository,
        moduleDefinitions,
    });

    const getPossibleIntegrations = new GetPossibleIntegrations({
        integrationClasses,
    });

    const processAuthorizationCallback = new ProcessAuthorizationCallback({
        moduleRepository,
        credentialRepository,
        moduleDefinitions,
    });

    const startAuthorizationSession = new StartAuthorizationSessionUseCase({
        authSessionRepository,
    });

    const processAuthorizationStep = new ProcessAuthorizationStepUseCase({
        authSessionRepository,
        moduleDefinitions,
    });

    const getAuthorizationRequirements =
        new GetAuthorizationRequirementsUseCase({
            moduleDefinitions,
        });

    const executeProxyRequest = new ExecuteProxyRequest({
        moduleRepository,
        credentialRepository,
        moduleFactory,
        moduleDefinitions,
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
        moduleDefinitions,
        startAuthorizationSession,
        processAuthorizationStep,
        getAuthorizationRequirements,
        moduleRepository,
        credentialRepository,
        authSessionRepository,
        executeProxyRequest,
    });
    setCredentialRoutes(router, authenticateUser, {
        listCredentialsForUser,
        getCredentialForUser,
        deleteCredentialForUser,
        reauthorizeCredential,
        getAuthorizationRequirements,
        moduleDefinitions,
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

    // =========================================================================
    // v1 API Routes (backwards compatible - legacy format)
    // =========================================================================

    // GET /api/integrations - v1 format: combined response with entities and integrations
    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            // Build visibility context for filtering integrations
            const visibilityContext = { user };

            // v1 returns everything in one call
            const [integrations, options, authorized] = await Promise.all([
                getIntegrationsForUser.execute(userId),
                getPossibleIntegrations.execute(visibilityContext),
                getEntitiesForUser.execute(userId),
            ]);

            res.json({
                entities: {
                    options,
                    authorized,
                },
                integrations,
            });
        })
    );

    // GET /api/integrations/options - Get available integration options (v1 compatible)
    // Attempts authentication for visibility filtering; if unauthenticated, shows all public integrations
    router.route('/api/integrations/options').get(
        catchAsyncError(async (req, res) => {
            let visibilityContext = null;
            try {
                const user = await authenticateUser.execute(req);
                visibilityContext = { user };
            } catch {
                // Unauthenticated - will show only integrations without visibility restrictions
            }
            const options = await getPossibleIntegrations.execute(
                visibilityContext
            );
            res.json({ integrations: options });
        })
    );

    // GET /api/entities - Get user's connected entities/accounts (v1 compatible)
    router.route('/api/entities').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const entities = await getEntitiesForUser.execute(userId);

            res.json({ entities });
        })
    );

    // =========================================================================
    // v2 API Routes (new clean format)
    // =========================================================================

    // GET /api/v2/integrations - v2 format: only integrations
    router.route('/api/v2/integrations').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const integrations = await getIntegrationsForUser.execute(userId);

            res.json({ integrations });
        })
    );

    // GET /api/v2/integrations/options - Get available integration options
    // Attempts authentication for visibility filtering; if unauthenticated, shows all public integrations
    router.route('/api/v2/integrations/options').get(
        catchAsyncError(async (req, res) => {
            let visibilityContext = null;
            try {
                const user = await authenticateUser.execute(req);
                visibilityContext = { user };
            } catch {
                // Unauthenticated - will show only integrations without visibility restrictions
            }
            const options = await getPossibleIntegrations.execute(
                visibilityContext
            );
            res.json({ integrations: options });
        })
    );

    // GET /api/v2/entities - Get user's connected entities/accounts
    router.route('/api/v2/entities').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const entities = await getEntitiesForUser.execute(userId);

            res.json({ entities });
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

    // =========================================================================
    // v2 API Routes - Integration endpoints (can evolve independently from v1)
    // =========================================================================

    // POST /api/v2/integrations - Create integration (v2)
    router.route('/api/v2/integrations').post(
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

    // PATCH /api/v2/integrations/:integrationId - Update integration (v2)
    router.route('/api/v2/integrations/:integrationId').patch(
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

    // DELETE /api/v2/integrations/:integrationId - Delete integration (v2)
    router.route('/api/v2/integrations/:integrationId').delete(
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

    // GET /api/v2/integrations/:integrationId - Get single integration (v2)
    router.route('/api/v2/integrations/:integrationId').get(
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

            res.json({
                id: integration.id,
                entities: integration.entities,
                status: integration.status,
                config: integration.config,
            });
        })
    );

    // GET /api/v2/integrations/:integrationId/config/options - Get config options (v2)
    router.route('/api/v2/integrations/:integrationId/config/options').get(
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

    // POST /api/v2/integrations/:integrationId/config/options/refresh (v2)
    router
        .route('/api/v2/integrations/:integrationId/config/options/refresh')
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

    // ALL /api/v2/integrations/:integrationId/actions - Get user actions (v2)
    router.route('/api/v2/integrations/:integrationId/actions').all(
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

    // ALL /api/v2/integrations/:integrationId/actions/:actionId/options (v2)
    router
        .route('/api/v2/integrations/:integrationId/actions/:actionId/options')
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

    // POST /api/v2/integrations/:integrationId/actions/:actionId/options/refresh (v2)
    router
        .route(
            '/api/v2/integrations/:integrationId/actions/:actionId/options/refresh'
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

    // POST /api/v2/integrations/:integrationId/actions/:actionId - Execute action (v2)
    router.route('/api/v2/integrations/:integrationId/actions/:actionId').post(
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

    // GET /api/v2/integrations/:integrationId/test-auth - Test auth (v2)
    router.route('/api/v2/integrations/:integrationId/test-auth').get(
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
        moduleDefinitions,
        startAuthorizationSession,
        processAuthorizationStep,
        getAuthorizationRequirements,
        moduleRepository,
        credentialRepository,
        authSessionRepository,
        executeProxyRequest,
    } = useCases;

    // GET /api/authorize - Get authorization requirements (supports multi-step)
    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
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
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;
            const isGlobal = req.body.isGlobal || false;

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
                        params.data,
                        isGlobal
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
                        result.authData,
                        isGlobal
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

    router.route('/api/entities').post(
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

    // GET /api/entities/types - List all available entity types
    // NOTE: This route MUST come before /api/entities/:entityId
    router.route('/api/entities/types').get(
        catchAsyncError(async (req, res) => {
            await authenticateUser.execute(req);

            // Map module definitions to entity type format
            const types = moduleDefinitions.map((moduleDef) => {
                const Definition = moduleDef.definition;

                return {
                    type: moduleDef.moduleName,
                    name:
                        typeof Definition.getDisplayName === 'function'
                            ? Definition.getDisplayName()
                            : moduleDef.moduleName,
                    description:
                        typeof Definition.getDescription === 'function'
                            ? Definition.getDescription()
                            : undefined,
                    authType:
                        typeof Definition.getAuthType === 'function'
                            ? Definition.getAuthType()
                            : 'oauth2',
                    isMultiStep:
                        typeof Definition.getAuthStepCount === 'function'
                            ? Definition.getAuthStepCount() > 1
                            : false,
                    stepCount:
                        typeof Definition.getAuthStepCount === 'function'
                            ? Definition.getAuthStepCount()
                            : 1,
                    capabilities:
                        typeof Definition.getCapabilities === 'function'
                            ? Definition.getCapabilities()
                            : undefined,
                };
            });

            // Sort by name
            types.sort((a, b) => a.name.localeCompare(b.name));

            res.json({ types });
        })
    );

    // GET /api/entities/types/:typeName - Get details for specific entity type
    // NOTE: This route MUST come before /api/entities/:entityId
    router.route('/api/entities/types/:typeName').get(
        catchAsyncError(async (req, res) => {
            await authenticateUser.execute(req);
            const { typeName } = req.params;

            // Validate type name format
            if (!/^[a-z0-9-_]+$/i.test(typeName)) {
                throw Boom.badRequest('Invalid type name format');
            }

            // Find module definition
            const moduleDef = moduleDefinitions.find(
                (def) => def.moduleName === typeName
            );

            if (!moduleDef) {
                throw Boom.notFound(`Entity type '${typeName}' not found`);
            }

            const Definition = moduleDef.definition;

            const entityType = {
                type: moduleDef.moduleName,
                name:
                    typeof Definition.getDisplayName === 'function'
                        ? Definition.getDisplayName()
                        : moduleDef.moduleName,
                description:
                    typeof Definition.getDescription === 'function'
                        ? Definition.getDescription()
                        : undefined,
                authType:
                    typeof Definition.getAuthType === 'function'
                        ? Definition.getAuthType()
                        : 'oauth2',
                isMultiStep:
                    typeof Definition.getAuthStepCount === 'function'
                        ? Definition.getAuthStepCount() > 1
                        : false,
                stepCount:
                    typeof Definition.getAuthStepCount === 'function'
                        ? Definition.getAuthStepCount()
                        : 1,
                capabilities:
                    typeof Definition.getCapabilities === 'function'
                        ? Definition.getCapabilities()
                        : undefined,
            };

            res.json(entityType);
        })
    );

    // GET /api/entities/types/:typeName/requirements - Get auth requirements for entity type
    // NOTE: This route MUST come before /api/entities/:entityId
    router.route('/api/entities/types/:typeName/requirements').get(
        catchAsyncError(async (req, res) => {
            await authenticateUser.execute(req);
            const { typeName } = req.params;
            const step = parseInt(req.query.step || '1', 10);
            const sessionId = req.query.sessionId;

            // Validate step
            if (step < 1) {
                throw Boom.badRequest('step must be >= 1');
            }

            // Find module definition
            const moduleDef = moduleDefinitions.find(
                (def) => def.moduleName === typeName
            );

            if (!moduleDef) {
                throw Boom.notFound(`Entity type '${typeName}' not found`);
            }

            const Definition = moduleDef.definition;
            const stepCount =
                typeof Definition.getAuthStepCount === 'function'
                    ? Definition.getAuthStepCount()
                    : 1;

            // Validate step is within range
            if (step > stepCount) {
                throw Boom.badRequest(
                    `step ${step} exceeds total steps (${stepCount})`
                );
            }

            // Validate sessionId for step > 1
            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            // For multi-step, validate sessionId format
            if (step > 1 && sessionId) {
                // Basic validation - sessionId should be a non-empty string
                if (typeof sessionId !== 'string' || sessionId.trim() === '') {
                    throw Boom.badRequest('Invalid sessionId format');
                }
            }

            // Get requirements from module definition
            const requirements = await getAuthorizationRequirements.execute(
                typeName,
                step
            );

            // Add sessionId for multi-step flows
            if (stepCount > 1) {
                if (step === 1) {
                    // Generate new sessionId for step 1
                    const crypto = require('crypto');
                    requirements.sessionId = crypto.randomUUID();
                } else {
                    // Use provided sessionId for subsequent steps
                    requirements.sessionId = sessionId;
                }
            }

            res.json(requirements);
        })
    );

    // GET /api/entities/options/:credentialId - Get entity options for credential
    // NOTE: This route MUST come before /api/entities/:entityId
    router.route('/api/entities/options/:credentialId').get(
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

    // GET /api/entities/:entityId/test-auth - Test authentication for entity
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

    // GET /api/entities/:entityId - Get entity by ID
    router.route('/api/entities/:entityId').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await getModule.execute(params.entityId, user); // Pass User object

            res.json(module);
        })
    );

    // POST /api/entities/:entityId/options - Get entity options by ID
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

    // POST /api/entities/:entityId/options/refresh - Refresh entity options
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

    // POST /api/entities/:id/reauthorize - Reauthorize specific entity
    router.route('/api/entities/:id/reauthorize').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const entityId = req.params.id;

            // Validate data parameter
            const params = checkRequiredParams(req.body, ['data']);
            if (typeof params.data !== 'object' || Array.isArray(params.data)) {
                throw Boom.badRequest('data must be an object');
            }

            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            // Validate step
            if (step < 1) {
                throw Boom.badRequest('step must be >= 1');
            }

            // Get entity
            const entity = await moduleRepository?.findById(entityId);
            if (!entity) {
                throw Boom.notFound('Entity not found');
            }

            // Check ownership
            if (entity.userId.toString() !== userId) {
                throw Boom.forbidden(
                    'User is not authorized to access this entity'
                );
            }

            // Get credential
            const credential = await credentialRepository?.findById(
                entity.credentialId
            );

            // Find module definition
            const moduleDef = moduleDefinitions.find(
                (def) => def.moduleName === entity.type
            );

            if (!moduleDef) {
                throw Boom.badRequest(`Unknown entity type: ${entity.type}`);
            }

            const Definition = moduleDef.definition;
            const stepCount =
                typeof Definition.getAuthStepCount === 'function'
                    ? Definition.getAuthStepCount()
                    : 1;

            // Validate step is within range
            if (step > stepCount) {
                throw Boom.badRequest(
                    `step ${step} exceeds total steps (${stepCount})`
                );
            }

            // Single-step reauthorization
            if (stepCount === 1) {
                try {
                    // Process reauthorization using existing flow
                    const result = await processAuthorizationCallback.execute(
                        userId,
                        entity.type,
                        params.data
                    );

                    // Update entity status
                    const updatedEntity = await moduleRepository?.update({
                        id: entityId,
                        authIsValid: true,
                    });

                    res.json({
                        success: true,
                        credential_id: result.credential_id,
                        entity_id: entityId,
                        authIsValid: true,
                    });
                } catch (error) {
                    throw Boom.badRequest(
                        error.message || 'Reauthorization failed'
                    );
                }
            } else {
                // Multi-step reauthorization
                if (step > 1 && !sessionId) {
                    throw Boom.badRequest('sessionId required for step > 1');
                }

                let session;

                if (step === 1) {
                    // Create new session for step 1
                    session = await startAuthorizationSession.execute(
                        userId,
                        entity.type,
                        stepCount
                    );

                    // Override with client-provided sessionId
                    if (sessionId) {
                        session.sessionId = sessionId;
                        await authSessionRepository?.update(session);
                    }
                }

                // Process this step
                const result = await processAuthorizationStep.execute(
                    sessionId || session?.sessionId,
                    userId,
                    step,
                    params.data
                );

                if (result.completed) {
                    // Final step - update credential and entity
                    try {
                        const authResult =
                            await processAuthorizationCallback.execute(
                                userId,
                                entity.type,
                                result.authData
                            );

                        // Update entity status
                        await moduleRepository?.update({
                            id: entityId,
                            authIsValid: true,
                        });

                        return res.json({
                            success: true,
                            credential_id: authResult.credential_id,
                            entity_id: entityId,
                            authIsValid: true,
                        });
                    } catch (error) {
                        throw Boom.badRequest(
                            error.message || 'Reauthorization failed'
                        );
                    }
                }

                // Return next step requirements
                res.json({
                    step: result.nextStep,
                    totalSteps: result.totalSteps,
                    sessionId: result.sessionId,
                    requirements: result.requirements,
                    message: result.message,
                });
            }
        })
    );

    // POST /api/entities/:id/proxy - Proxy request through entity's API connection
    router.route('/api/entities/:id/proxy').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const entityId = req.params.id;

            try {
                // Execute proxy request via entity
                const proxyResponse =
                    await executeProxyRequest.executeViaEntity(
                        entityId,
                        userId,
                        req.body
                    );

                // Return success response
                res.status(200).json(proxyResponse);
            } catch (error) {
                // Handle Boom errors
                if (Boom.isBoom(error)) {
                    const statusCode = error.output.statusCode;
                    const errorData = error.data || {};

                    // Build error response matching proxyErrorResponse schema
                    const errorResponse = {
                        success: false,
                        status: statusCode,
                        error: {
                            code:
                                errorData.code ||
                                _getErrorCodeFromStatus(statusCode),
                            message:
                                error.output.payload.message || error.message,
                            details: errorData.details || null,
                        },
                    };

                    // Add upstreamStatus if present
                    if (errorData.upstreamStatus) {
                        errorResponse.error.upstreamStatus =
                            errorData.upstreamStatus;
                    }

                    return res.status(statusCode).json(errorResponse);
                }

                // Unknown error - return 500
                res.status(500).json({
                    success: false,
                    status: 500,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'An unexpected error occurred',
                        details: null,
                    },
                });
            }
        })
    );

    // POST /api/credentials/:id/proxy - Proxy request through credential's API connection
    router.route('/api/credentials/:id/proxy').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const credentialId = req.params.id;

            try {
                // Execute proxy request via credential
                const proxyResponse =
                    await executeProxyRequest.executeViaCredential(
                        credentialId,
                        userId,
                        req.body
                    );

                // Return success response
                res.status(200).json(proxyResponse);
            } catch (error) {
                // Handle Boom errors
                if (Boom.isBoom(error)) {
                    const statusCode = error.output.statusCode;
                    const errorData = error.data || {};

                    // Build error response matching proxyErrorResponse schema
                    const errorResponse = {
                        success: false,
                        status: statusCode,
                        error: {
                            code:
                                errorData.code ||
                                _getErrorCodeFromStatus(statusCode),
                            message:
                                error.output.payload.message || error.message,
                            details: errorData.details || null,
                        },
                    };

                    // Add upstreamStatus if present
                    if (errorData.upstreamStatus) {
                        errorResponse.error.upstreamStatus =
                            errorData.upstreamStatus;
                    }

                    return res.status(statusCode).json(errorResponse);
                }

                // Unknown error - return 500
                res.status(500).json({
                    success: false,
                    status: 500,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'An unexpected error occurred',
                        details: null,
                    },
                });
            }
        })
    );

    // =========================================================================
    // v1 Legacy Aliases (backwards compatibility for singular /api/entity)
    // =========================================================================

    // POST /api/entity - v1 legacy alias for POST /api/entities
    router.route('/api/entity').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            checkRequiredParams(req.body.data, ['credential_id']);

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

    // GET /api/entity/options/:credentialId - v1 legacy alias
    router.route('/api/entity/options/:credentialId').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
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

    // =========================================================================
    // v2 API Routes - Entity endpoints (can evolve independently from v1)
    // =========================================================================

    // GET /api/v2/authorize - Get authorization requirements (v2)
    router.route('/api/v2/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.query, ['entityType']);
            const step = parseInt(req.query.step || '1', 10);
            const sessionId = req.query.sessionId;

            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            const requirements = await getAuthorizationRequirements.execute(
                params.entityType,
                step
            );

            if (requirements.isMultiStep && step === 1 && !sessionId) {
                const session = await startAuthorizationSession.execute(
                    userId,
                    params.entityType,
                    {
                        step: 1,
                        totalSteps: requirements.totalSteps,
                    }
                );
                requirements.sessionId = session.id;
            } else if (sessionId) {
                requirements.sessionId = sessionId;
            }

            res.json(requirements);
        })
    );

    // POST /api/v2/authorize - Process authorization callback (v2)
    router.route('/api/v2/authorize').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            const result = await processAuthorizationStep.execute(
                userId,
                params.entityType,
                params.data,
                step,
                sessionId
            );

            if (result.isComplete) {
                res.json({
                    status: 'complete',
                    entity: result.entity,
                    credential: result.credential,
                });
            } else {
                res.json({
                    status: 'pending',
                    step: result.nextStep,
                    totalSteps: result.totalSteps,
                    sessionId: result.sessionId,
                    requirements: result.requirements,
                    message: result.message,
                });
            }
        })
    );

    // POST /api/v2/entities - Create entity (v2)
    router.route('/api/v2/entities').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            checkRequiredParams(req.body.data, ['credential_id']);

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

    // GET /api/v2/entities/types - List available entity types (v2)
    router.route('/api/v2/entities/types').get(
        catchAsyncError(async (req, res) => {
            await authenticateUser.execute(req);

            const types = moduleDefinitions.map((moduleDef) => {
                const Definition = moduleDef.definition;
                return {
                    type: moduleDef.moduleName,
                    name:
                        typeof Definition.getDisplayName === 'function'
                            ? Definition.getDisplayName()
                            : moduleDef.moduleName,
                    description:
                        typeof Definition.getDescription === 'function'
                            ? Definition.getDescription()
                            : undefined,
                    authType:
                        typeof Definition.getAuthType === 'function'
                            ? Definition.getAuthType()
                            : 'oauth2',
                    isMultiStep:
                        typeof Definition.getAuthStepCount === 'function'
                            ? Definition.getAuthStepCount() > 1
                            : false,
                    stepCount:
                        typeof Definition.getAuthStepCount === 'function'
                            ? Definition.getAuthStepCount()
                            : 1,
                    capabilities:
                        typeof Definition.getCapabilities === 'function'
                            ? Definition.getCapabilities()
                            : undefined,
                };
            });

            res.json({ types });
        })
    );

    // GET /api/v2/entities/types/:typeName - Get entity type details (v2)
    router.route('/api/v2/entities/types/:typeName').get(
        catchAsyncError(async (req, res) => {
            await authenticateUser.execute(req);
            const { typeName } = req.params;

            const moduleDef = moduleDefinitions.find(
                (def) => def.moduleName === typeName
            );

            if (!moduleDef) {
                throw Boom.notFound(`Entity type '${typeName}' not found`);
            }

            const Definition = moduleDef.definition;
            res.json({
                type: moduleDef.moduleName,
                name:
                    typeof Definition.getDisplayName === 'function'
                        ? Definition.getDisplayName()
                        : moduleDef.moduleName,
                description:
                    typeof Definition.getDescription === 'function'
                        ? Definition.getDescription()
                        : undefined,
                authType:
                    typeof Definition.getAuthType === 'function'
                        ? Definition.getAuthType()
                        : 'oauth2',
                isMultiStep:
                    typeof Definition.getAuthStepCount === 'function'
                        ? Definition.getAuthStepCount() > 1
                        : false,
                stepCount:
                    typeof Definition.getAuthStepCount === 'function'
                        ? Definition.getAuthStepCount()
                        : 1,
                capabilities:
                    typeof Definition.getCapabilities === 'function'
                        ? Definition.getCapabilities()
                        : undefined,
            });
        })
    );

    // GET /api/v2/entities/types/:typeName/requirements - Get auth requirements (v2)
    router.route('/api/v2/entities/types/:typeName/requirements').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const { typeName } = req.params;
            const step = parseInt(req.query.step || '1', 10);
            const sessionId = req.query.sessionId;

            if (step > 1 && !sessionId) {
                throw Boom.badRequest('sessionId required for step > 1');
            }

            const requirements = await getAuthorizationRequirements.execute(
                typeName,
                step
            );

            if (requirements.isMultiStep && step === 1 && !sessionId) {
                const session = await startAuthorizationSession.execute(
                    userId,
                    typeName,
                    {
                        step: 1,
                        totalSteps: requirements.totalSteps,
                    }
                );
                requirements.sessionId = session.id;
            } else if (sessionId) {
                requirements.sessionId = sessionId;
            }

            res.json(requirements);
        })
    );

    // GET /api/v2/entities/options/:credentialId - Get entity options (v2)
    router.route('/api/v2/entities/options/:credentialId').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
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

    // GET /api/v2/entities/:entityId/test-auth - Test auth (v2)
    router.route('/api/v2/entities/:entityId/test-auth').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const testAuthResponse = await testModuleAuth.execute(
                params.entityId,
                user
            );

            if (!testAuthResponse) {
                res.status(400);
                res.json({
                    errors: [
                        {
                            title: 'Authentication Error',
                            message:
                                'There was an error with your Entity. Please reconnect/re-authenticate, or reach out to Support for assistance.',
                            timestamp: Date.now(),
                        },
                    ],
                });
            } else {
                res.json({ status: 'ok' });
            }
        })
    );

    // GET /api/v2/entities/:entityId - Get entity by ID (v2)
    router.route('/api/v2/entities/:entityId').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const module = await getModule.execute(params.entityId, user);

            res.json(module);
        })
    );

    // POST /api/v2/entities/:entityId/options - Get entity options (v2)
    router.route('/api/v2/entities/:entityId/options').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);

            const entityOptions = await getEntityOptionsById.execute(
                params.entityId,
                user
            );

            res.json(entityOptions);
        })
    );

    // POST /api/v2/entities/:entityId/options/refresh - Refresh entity options (v2)
    router.route('/api/v2/entities/:entityId/options/refresh').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params, ['entityId']);
            const updatedOptions = await refreshEntityOptions.execute(
                params.entityId,
                user,
                req.body
            );

            res.json(updatedOptions);
        })
    );

    // POST /api/v2/entities/:id/reauthorize - Reauthorize entity (v2)
    router.route('/api/v2/entities/:id/reauthorize').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const entityId = req.params.id;

            const params = checkRequiredParams(req.body, ['data']);
            if (typeof params.data !== 'object' || Array.isArray(params.data)) {
                throw Boom.badRequest('data must be an object');
            }

            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId;

            const entity = await moduleRepository.findEntityById(entityId);
            if (!entity) {
                throw Boom.notFound('Entity not found');
            }

            const credential = await credentialRepository.findCredentialById(
                entity.credentialId
            );
            if (!credential || credential.userId.toString() !== userId) {
                throw Boom.forbidden('Access denied');
            }

            const result = await processAuthorizationStep.execute(
                userId,
                entity.type,
                params.data,
                step,
                sessionId
            );

            if (result.isComplete) {
                if (result.credential) {
                    try {
                        await credentialRepository.updateCredential(
                            credential.id,
                            {
                                data: result.credential.data,
                                authIsValid: true,
                            }
                        );
                        await moduleRepository.updateEntity(entityId, {
                            authIsValid: true,
                        });
                    } catch (error) {
                        throw Boom.badRequest(
                            error.message || 'Reauthorization failed'
                        );
                    }
                }

                res.json({
                    step: result.nextStep,
                    totalSteps: result.totalSteps,
                    sessionId: result.sessionId,
                    requirements: result.requirements,
                    message: result.message,
                });
            }
        })
    );

    // POST /api/v2/entities/:id/proxy - Proxy request (v2)
    router.route('/api/v2/entities/:id/proxy').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const entityId = req.params.id;

            try {
                const proxyResponse =
                    await executeProxyRequest.executeViaEntity(
                        entityId,
                        userId,
                        req.body
                    );

                res.status(200).json(proxyResponse);
            } catch (error) {
                if (Boom.isBoom(error)) {
                    const statusCode = error.output.statusCode;
                    const errorData = error.data || {};

                    const errorResponse = {
                        success: false,
                        status: statusCode,
                        error: {
                            code:
                                errorData.code ||
                                _getErrorCodeFromStatus(statusCode),
                            message:
                                error.output.payload.message || error.message,
                            details: errorData.details || null,
                        },
                    };

                    if (errorData.upstreamStatus) {
                        errorResponse.error.upstreamStatus =
                            errorData.upstreamStatus;
                    }

                    return res.status(statusCode).json(errorResponse);
                }

                res.status(500).json({
                    success: false,
                    status: 500,
                    error: {
                        code: 'INTERNAL_ERROR',
                        message: 'An unexpected error occurred',
                        details: null,
                    },
                });
            }
        })
    );
}

/**
 * Sets up credential-related routes for the integration router
 * @param {Object} router - Express router instance
 * @param {import('../user/use-cases/authenticate-user').AuthenticateUser} authenticateUser - Authentication use case
 * @param {Object} useCases - Credential use cases
 */
function setCredentialRoutes(router, authenticateUser, useCases) {
    const {
        listCredentialsForUser,
        getCredentialForUser,
        deleteCredentialForUser,
        reauthorizeCredential,
        getAuthorizationRequirements,
        moduleDefinitions,
    } = useCases;

    /**
     * Sanitize credential object by removing sensitive data
     * @param {Object} credential - Credential object
     * @returns {Object} Sanitized credential
     */
    function sanitizeCredential(credential) {
        const { data, ...safe } = credential;
        return safe;
    }

    // GET /api/credentials - List user's credentials
    router.route('/api/credentials').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            const credentials = await listCredentialsForUser.execute(userId);
            const sanitized = credentials.map(sanitizeCredential);

            res.json({ credentials: sanitized });
        })
    );

    // GET /api/credentials/:id - Get single credential
    router.route('/api/credentials/:id').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            const credential = await getCredentialForUser.execute(
                req.params.id,
                userId
            );

            res.json(sanitizeCredential(credential));
        })
    );

    // DELETE /api/credentials/:id - Delete credential
    router.route('/api/credentials/:id').delete(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            await deleteCredentialForUser.execute(req.params.id, userId);

            res.json({ success: true });
        })
    );

    // GET /api/credentials/:id/reauthorize - Get reauth requirements
    router.route('/api/credentials/:id/reauthorize').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            // Verify ownership
            const credential = await getCredentialForUser.execute(
                req.params.id,
                userId
            );

            // Get authorization requirements for this credential's type
            const step = parseInt(req.query.step || '1', 10);
            const requirements = await getAuthorizationRequirements.execute(
                credential.type,
                step
            );

            res.json(requirements);
        })
    );

    // POST /api/credentials/:id/reauthorize - Submit reauth data
    router.route('/api/credentials/:id/reauthorize').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            const params = checkRequiredParams(req.body, ['data']);
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId || null;

            const result = await reauthorizeCredential.execute(
                req.params.id,
                userId,
                params.data,
                step,
                sessionId
            );

            res.json(result);
        })
    );

    // ========================================
    // V2 CREDENTIAL ROUTES
    // ========================================
    // These v2 routes are separate from v1 so v2 can evolve independently
    // while v1 remains frozen for backwards compatibility.

    // GET /api/v2/credentials - v2: List user's credentials
    router.route('/api/v2/credentials').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            const credentials = await listCredentialsForUser.execute(userId);
            const sanitized = credentials.map(sanitizeCredential);

            res.json({ credentials: sanitized });
        })
    );

    // GET /api/v2/credentials/:id - v2: Get single credential
    router.route('/api/v2/credentials/:id').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            const credential = await getCredentialForUser.execute(
                req.params.id,
                userId
            );

            res.json(sanitizeCredential(credential));
        })
    );

    // DELETE /api/v2/credentials/:id - v2: Delete credential
    router.route('/api/v2/credentials/:id').delete(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            await deleteCredentialForUser.execute(req.params.id, userId);

            res.json({ success: true });
        })
    );

    // GET /api/v2/credentials/:id/reauthorize - v2: Get reauth requirements
    router.route('/api/v2/credentials/:id/reauthorize').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            // Verify ownership
            const credential = await getCredentialForUser.execute(
                req.params.id,
                userId
            );

            // Get authorization requirements for this credential's type
            const step = parseInt(req.query.step || '1', 10);
            const requirements = await getAuthorizationRequirements.execute(
                credential.type,
                step
            );

            res.json(requirements);
        })
    );

    // POST /api/v2/credentials/:id/reauthorize - v2: Submit reauth data
    router.route('/api/v2/credentials/:id/reauthorize').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();

            const params = checkRequiredParams(req.body, ['data']);
            const step = parseInt(req.body.step || '1', 10);
            const sessionId = req.body.sessionId || null;

            const result = await reauthorizeCredential.execute(
                req.params.id,
                userId,
                params.data,
                step,
                sessionId
            );

            res.json(result);
        })
    );
}

/**
 * Helper function to map HTTP status codes to error codes
 * @private
 * @param {number} statusCode - HTTP status code
 * @returns {string} Error code
 */
function _getErrorCodeFromStatus(statusCode) {
    const statusMap = {
        400: 'INVALID_REQUEST',
        401: 'INVALID_AUTH',
        403: 'PERMISSION_DENIED',
        404: 'NOT_FOUND',
        429: 'RATE_LIMITED',
        500: 'INTERNAL_ERROR',
        502: 'NETWORK_ERROR',
        503: 'SERVICE_UNAVAILABLE',
        504: 'TIMEOUT',
    };

    return statusMap[statusCode] || 'UNKNOWN_ERROR';
}

module.exports = { createIntegrationRouter, checkRequiredParams };
