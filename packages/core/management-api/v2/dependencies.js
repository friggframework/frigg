/**
 * Wires the repositories and use cases behind Management API v2. Kept apart
 * from the router so tests can hand the router doubles instead.
 */
/**
 * @param {Object} params
 * @param {Object} params.appDefinition - the loaded app definition. Its
 *   `entityTypeRegistry` (built once by loadAppDefinition) is used.
 * @param {Object} params.config
 * @param {Map} [params.entityTypeRegistry] - overrides the registry on the
 *   app definition. When neither exists (a raw definition in a test), it is
 *   built here from the definition.
 */
function buildV2Dependencies({ appDefinition, config, entityTypeRegistry }) {
    const {
        createIntegrationRepository,
    } = require('../../integrations/repositories/integration-repository-factory');
    const {
        createCredentialRepository,
    } = require('../../credential/repositories/credential-repository-factory');
    const {
        createModuleRepository,
    } = require('../../modules/repositories/module-repository-factory');
    const {
        createUserRepository,
    } = require('../../user/repositories/user-repository-factory');
    const { ModuleFactory } = require('../../modules/module-factory');
    const {
        getEntityTypeRegistry,
        getEntityTypeDefinitions,
    } = require('../../modules/entity-type-registry');
    const { createScopePolicy } = require('../../modules/scope-policy');
    const {
        AuthorizeEntityForUser,
    } = require('../../modules/use-cases/authorize-entity-for-user');
    const {
        ResolveIntegrationOwnership,
    } = require('../../integrations/use-cases/resolve-integration-ownership');
    const {
        AuthenticateWithSharedSecret,
    } = require('../../user/use-cases/authenticate-with-shared-secret');
    const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
    const { buildUserAuthentication } = require('../../user/create-user-authentication');
    const { CreateIntegration } = require('../../integrations/use-cases/create-integration');
    const { UpdateIntegration } = require('../../integrations/use-cases/update-integration');
    const {
        DeleteIntegrationForUser,
    } = require('../../integrations/use-cases/delete-integration-for-user');
    const {
        GetIntegrationsForUser,
    } = require('../../integrations/use-cases/get-integrations-for-user');
    const {
        GetIntegrationInstance,
    } = require('../../integrations/use-cases/get-integration-instance');
    const {
        GetPossibleIntegrations,
    } = require('../../integrations/use-cases/get-possible-integrations');
    const integrationOps = require('../../integrations/use-cases/integration-operations-for-user');
    const {
        GetEntityModuleForUser,
    } = require('../../modules/use-cases/get-entity-module-for-user');
    const entityOps = require('../../modules/use-cases/entity-operations-for-user');
    const { ListEntityTypes, GetEntityType } = require('../../modules/use-cases/entity-types');
    const credentialOps = require('../../credential/use-cases/credential-operations-for-user');
    const {
        GetCredentialReauthorization,
        ReauthorizeCredentialForUser,
    } = require('../../credential/use-cases/reauthorize-credential-for-user');
    const {
        GetAuthorizationStep,
        SubmitAuthorizationStep,
    } = require('../../modules/use-cases/multi-step-authorization');
    const {
        ProcessAuthorizationCallback,
    } = require('../../modules/use-cases/process-authorization-callback');
    const {
        ExecuteEntityProxyRequest,
    } = require('../../modules/use-cases/execute-entity-proxy-request');
    const {
        createAuthorizationSessionRepository,
    } = require('../../modules/repositories/authorization-session-repository-factory');
    const {
        GetAuthorizationRequirements,
    } = require('../../modules/use-cases/get-authorization-requirements');

    const integrationClasses = appDefinition.integrations || [];
    const userConfig = appDefinition.userConfig || {};
    // The registry holds entity types registered on the app as well as those
    // integrations bind (ADR-059), so v2 authorize/entities accept both.
    const registry =
        entityTypeRegistry ??
        appDefinition.entityTypeRegistry ??
        getEntityTypeRegistry(appDefinition);
    const moduleDefinitions = getEntityTypeDefinitions(registry);
    // Ownership by scope (ADR-056 §3): one object every use case asks.
    const scopePolicy = createScopePolicy({
        ownership: appDefinition.ownership,
        entityTypeRegistry: registry,
    });

    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository();
    const authorizationSessionRepository = createAuthorizationSessionRepository();

    const authenticateUser = new AuthenticateUser({
        ...buildUserAuthentication({ userConfig, userRepository }),
        authenticateWithSharedSecret: new AuthenticateWithSharedSecret(),
        userConfig,
    });

    const moduleFactory = new ModuleFactory({ moduleRepository, moduleDefinitions });
    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });
    const getEntityModuleForUser = new GetEntityModuleForUser({
        moduleRepository,
        moduleDefinitions,
        scopePolicy,
    });
    const getCredentialForUser = new credentialOps.GetCredentialForUserV2({
        credentialRepository,
        moduleRepository,
        scopePolicy,
    });
    const getAuthorizationRequirements = new GetAuthorizationRequirements({
        moduleDefinitions,
    });
    const getAuthorizationStep = new GetAuthorizationStep({
        moduleDefinitions,
        getAuthorizationRequirements,
        authorizationSessionRepository,
    });
    const submitAuthorizationStep = new SubmitAuthorizationStep({
        moduleDefinitions,
        getAuthorizationRequirements,
        authorizationSessionRepository,
        authorizeEntityForUser: new AuthorizeEntityForUser({
            scopePolicy,
            processAuthorizationCallback: new ProcessAuthorizationCallback({
                moduleRepository,
                credentialRepository,
                integrationRepository,
                moduleDefinitions,
            }),
        }),
        moduleRepository,
        credentialRepository,
        scopePolicy,
    });
    const getOwnedIntegrationRecord = new integrationOps.GetOwnedIntegrationRecord({
        integrationRepository,
        scopePolicy,
    });
    const getIntegrationInstanceForUser = new integrationOps.GetIntegrationInstanceForUser({
        getOwnedIntegrationRecord,
        getIntegrationInstance,
    });

    return {
        config,
        moduleDefinitions,
        scopePolicy,
        repositories: {
            moduleRepository,
            integrationRepository,
            credentialRepository,
            userRepository,
            authorizationSessionRepository,
        },
        authenticateUser,

        // Integrations
        getIntegrationsForUser: new GetIntegrationsForUser({
            integrationRepository,
            integrationClasses,
            moduleFactory,
            moduleRepository,
            scopePolicy,
        }),
        getPossibleIntegrations: new GetPossibleIntegrations({ integrationClasses }),
        createIntegrationForUser: new integrationOps.CreateIntegrationForUser({
            createIntegration: new CreateIntegration({
                integrationRepository,
                integrationClasses,
                moduleFactory,
            }),
            resolveIntegrationOwnership: new ResolveIntegrationOwnership({
                moduleRepository,
                integrationClasses,
                scopePolicy,
            }),
            integrationClasses,
        }),
        getIntegrationInstanceForUser,
        updateIntegrationForUser: new integrationOps.UpdateIntegrationForUser({
            getOwnedIntegrationRecord,
            updateIntegration: new UpdateIntegration({
                integrationRepository,
                integrationClasses,
                moduleFactory,
            }),
        }),
        removeIntegrationForUser: new integrationOps.RemoveIntegrationForUser({
            getOwnedIntegrationRecord,
            deleteIntegrationForUser: new DeleteIntegrationForUser({
                integrationRepository,
                integrationClasses,
                moduleFactory,
            }),
        }),
        sendIntegrationEventForUser: new integrationOps.SendIntegrationEventForUser({
            getIntegrationInstanceForUser,
        }),
        runIntegrationActionForUser: new integrationOps.RunIntegrationActionForUser({
            getIntegrationInstanceForUser,
        }),
        testIntegrationAuthForUser: new integrationOps.TestIntegrationAuthForUser({
            getIntegrationInstanceForUser,
        }),

        // Entities
        getEntityModuleForUser,
        listEntitiesForUser: new entityOps.ListEntitiesForUser({
            moduleRepository,
            scopePolicy,
        }),
        getEntityForUser: new entityOps.GetEntityForUser({ getEntityModuleForUser }),
        deleteEntityForUser: new entityOps.DeleteEntityForUser({
            getEntityModuleForUser,
            moduleRepository,
            integrationRepository,
        }),
        testEntityAuthForUser: new entityOps.TestEntityAuthForUser({ getEntityModuleForUser }),
        getEntityOptionsForUser: new entityOps.GetEntityOptionsForUser({ getEntityModuleForUser }),
        refreshEntityOptionsForUser: new entityOps.RefreshEntityOptionsForUser({
            getEntityModuleForUser,
        }),
        listEntityTypes: new ListEntityTypes({ entityTypeRegistry: registry, scopePolicy }),
        getEntityType: new GetEntityType({ entityTypeRegistry: registry, scopePolicy }),
        getAuthorizationRequirements,

        // Credentials
        listCredentialsForUser: new credentialOps.ListCredentialsForUser({
            credentialRepository,
            moduleRepository,
            scopePolicy,
        }),
        getCredentialForUser,
        deleteCredentialForUser: new credentialOps.DeleteCredentialForUser({
            credentialRepository,
            moduleRepository,
            getCredentialForUser,
        }),
        getCredentialReauthorization: new GetCredentialReauthorization({
            getCredentialForUser,
            getAuthorizationStep,
        }),
        reauthorizeCredentialForUser: new ReauthorizeCredentialForUser({
            getCredentialForUser,
            submitAuthorizationStep,
        }),

        // Authorization (multi-step)
        getAuthorizationStep,
        submitAuthorizationStep,

        // Entity proxy (ADR-052): only built when the app enables it.
        ...(config.proxy.enable && {
            executeEntityProxyRequest: new ExecuteEntityProxyRequest({
                getEntityModuleForUser,
                proxyConfig: config.proxy,
            }),
        }),
    };
}

module.exports = { buildV2Dependencies };
