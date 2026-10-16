const express = require('express');
const { get } = require('../assertions');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const { getLogger } = require('../logs');
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
    AuthenticateWithSharedSecret,
} = require('../user/use-cases/authenticate-with-shared-secret');
const { AuthenticateUser } = require('../user/use-cases/authenticate-user');
const {
    buildUserAuthentication,
} = require('../user/create-user-authentication');
const {
    ProcessAuthorizationCallback,
} = require('../modules/use-cases/process-authorization-callback');
const { createScopePolicy } = require('../modules/scope-policy');
const {
    AuthorizeEntityForUser,
} = require('../modules/use-cases/authorize-entity-for-user');
const {
    ResolveIntegrationOwnership,
} = require('./use-cases/resolve-integration-ownership');
const { GetOwnedIntegrationRecord } = require('./use-cases/integration-operations-for-user');

const log = getLogger('frigg.integrations');

function createIntegrationRouter() {
    // moduleDefinitions is the app registry's definitions (ADR-059), so
    // /api/authorize and friends accept a type no integration binds.
    const {
        integrations: integrationClasses,
        userConfig,
        moduleDefinitions,
        ownership,
        entityTypeRegistry,
    } = loadAppDefinition();
    // Ownership by scope (ADR-056 §3): one object every use case asks.
    const scopePolicy = createScopePolicy({ ownership, entityTypeRegistry });
    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository();
    const {
        getUserFromBearerToken,
        getUserFromXFriggHeaders,
        getUserFromAdopterJwt,
    } = buildUserAuthentication({ userConfig, userRepository });

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
        moduleDefinitions,
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
        scopePolicy,
    });

    // Decides who owns a new integration and which entities the caller may bind
    // (the v1 create used to check neither), and who may reach an existing one.
    const resolveIntegrationOwnership = new ResolveIntegrationOwnership({
        moduleRepository,
        integrationClasses,
        scopePolicy,
    });
    const getOwnedIntegrationRecord = new GetOwnedIntegrationRecord({
        integrationRepository,
        scopePolicy,
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
        moduleDefinitions,
        scopePolicy,
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
        scopePolicy,
    });

    const getModule = new GetModule({
        moduleRepository,
        moduleDefinitions,
        scopePolicy,
    });

    const getEntityOptionsById = new GetEntityOptionsById({
        moduleRepository,
        moduleDefinitions,
        scopePolicy,
    });

    const refreshEntityOptions = new RefreshEntityOptions({
        moduleRepository,
        moduleDefinitions,
        scopePolicy,
    });

    const getPossibleIntegrations = new GetPossibleIntegrations({
        integrationClasses,
    });

    // The owner of what an authorization creates follows its scope (ADR-056 §3.2).
    const authorizeEntityForUser = new AuthorizeEntityForUser({
        scopePolicy,
        processAuthorizationCallback: new ProcessAuthorizationCallback({
            moduleRepository,
            credentialRepository,
            integrationRepository,
            moduleDefinitions,
        }),
    });

    const router = express();

    setIntegrationRoutes(router, authenticateUser, {
        resolveIntegrationOwnership,
        getOwnedIntegrationRecord,
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
        authorizeEntityForUser,
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
        resolveIntegrationOwnership,
        getOwnedIntegrationRecord,
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    } = useCases;

    // The owner of an integration the caller may reach (404 otherwise), which is
    // what the id-and-owner use cases below expect. `manage: true` is for
    // changing or deleting: an organization's integration needs an admin (403).
    const ownerOf = async (integrationId, user, options) =>
        (await getOwnedIntegrationRecord.execute(integrationId, user, options))
            .userId;

    router.route('/api/integrations').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const integrations = await getIntegrationsForUser.execute(user);
            const results = {
                entities: {
                    options: await getPossibleIntegrations.execute(),
                    authorized: await getEntitiesForUser.execute(user),
                },
                integrations: integrations,
            };

            res.json(results);
        })
    );

    router.route('/api/integrations').post(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.body, [
                'entities',
                'config',
            ]);

            get(params.config, 'type');

            const { ownerId, organizationId, adoptUnscoped } =
                await resolveIntegrationOwnership.execute({
                    entityIds: params.entities,
                    config: params.config,
                    user,
                });
            const integration = await createIntegration.execute(
                params.entities,
                ownerId,
                params.config,
                { organizationId, adoptUnscoped }
            );

            res.status(201).json(integration);
        })
    );

    router.route('/api/integrations/:integrationId').patch(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.body, ['config']);

            const integration = await updateIntegration.execute(
                req.params.integrationId,
                await ownerOf(req.params.integrationId, user, { manage: true }),
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
                await ownerOf(params.integrationId, user, { manage: true })
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
                await ownerOf(params.integrationId, user)
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
                    await ownerOf(params.integrationId, user)
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
                await ownerOf(params.integrationId, user)
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
                    await ownerOf(params.integrationId, user)
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
                    await ownerOf(params.integrationId, user)
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
                await ownerOf(params.integrationId, user)
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
                await ownerOf(params.integrationId, user)
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
                await ownerOf(params.integrationId, user)
            );

            if (!instance) {
                throw Boom.notFound();
            }

            const start = Date.now();
            const authPassed = await instance.testAuth();
            await instance.reconcileAuthStatus(authPassed);
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
        authorizeEntityForUser,
    } = useCases;

    router.route('/api/authorize').get(
        catchAsyncError(async (req, res) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.query, ['entityType']);
            // The owner POST stores under, so GET and POST describe one connection.
            const { ownerId } = authorizeEntityForUser.resolveOwnership({
                user,
                entityType: params.entityType,
            });
            const module = await getModuleInstanceFromType.execute(
                ownerId,
                params.entityType,
                { state: req.query.state }
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
            const params = checkRequiredParams(req.body, [
                'entityType',
                'data',
            ]);
            const ownership = authorizeEntityForUser.resolveOwnership({
                user,
                entityType: params.entityType,
            });
            const userId = ownership.ownerId;

            const dataKeys =
                params.data && typeof params.data === 'object'
                    ? Object.keys(params.data)
                    : [];
            log.debug('Authorize requested', {
                userId,
                entityType: params.entityType,
                dataKeys,
            });

            const { result: entityDetails } =
                await authorizeEntityForUser.execute({
                    user,
                    entityType: params.entityType,
                    data: params.data,
                    ownership,
                });

            log.info('Entity authorized', {
                eventName: 'frigg.integrations.authorized',
                userId,
                entityType: params.entityType,
                credentialId: entityDetails?.credential_id,
                entityId: entityDetails?.entity_id,
            });

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
