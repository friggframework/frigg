/**
 * Wires the repositories and use cases behind Management API v2. Kept apart
 * from the router so tests can hand the router doubles instead.
 */
function buildV2Dependencies({ appDefinition, config }) {
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
        getModulesDefinitionFromIntegrationClasses,
    } = require('../../integrations/utils/map-integration-dto');
    const { GetUserFromBearerToken } = require('../../user/use-cases/get-user-from-bearer-token');
    const { GetUserFromXFriggHeaders } = require('../../user/use-cases/get-user-from-x-frigg-headers');
    const { GetUserFromAdopterJwt } = require('../../user/use-cases/get-user-from-adopter-jwt');
    const {
        AuthenticateWithSharedSecret,
    } = require('../../user/use-cases/authenticate-with-shared-secret');
    const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
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
        GetAuthorizationRequirements,
    } = require('../../modules/use-cases/get-authorization-requirements');

    const integrationClasses = appDefinition.integrations || [];
    const userConfig = appDefinition.userConfig || {};
    const moduleDefinitions =
        getModulesDefinitionFromIntegrationClasses(integrationClasses);

    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository();

    const authenticateUser = new AuthenticateUser({
        getUserFromBearerToken: new GetUserFromBearerToken({ userRepository, userConfig }),
        getUserFromXFriggHeaders: new GetUserFromXFriggHeaders({ userRepository, userConfig }),
        getUserFromAdopterJwt: new GetUserFromAdopterJwt({ userRepository, userConfig }),
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
    });
    const getCredentialForUser = new credentialOps.GetCredentialForUserV2({
        credentialRepository,
        moduleRepository,
    });
    const getOwnedIntegrationRecord = new integrationOps.GetOwnedIntegrationRecord({
        integrationRepository,
    });
    const getIntegrationInstanceForUser = new integrationOps.GetIntegrationInstanceForUser({
        getOwnedIntegrationRecord,
        getIntegrationInstance,
    });

    return {
        config,
        moduleDefinitions,
        repositories: {
            moduleRepository,
            integrationRepository,
            credentialRepository,
            userRepository,
        },
        authenticateUser,

        // Integrations
        getIntegrationsForUser: new GetIntegrationsForUser({
            integrationRepository,
            integrationClasses,
            moduleFactory,
            moduleRepository,
        }),
        getPossibleIntegrations: new GetPossibleIntegrations({ integrationClasses }),
        createIntegrationForUser: new integrationOps.CreateIntegrationForUser({
            createIntegration: new CreateIntegration({
                integrationRepository,
                integrationClasses,
                moduleFactory,
            }),
            getEntityModuleForUser,
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
        listEntitiesForUser: new entityOps.ListEntitiesForUser({ moduleRepository }),
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
        listEntityTypes: new ListEntityTypes({ moduleDefinitions }),
        getEntityType: new GetEntityType({ moduleDefinitions }),
        getAuthorizationRequirements: new GetAuthorizationRequirements({ moduleDefinitions }),

        // Credentials
        listCredentialsForUser: new credentialOps.ListCredentialsForUser({
            credentialRepository,
            moduleRepository,
        }),
        getCredentialForUser,
        deleteCredentialForUser: new credentialOps.DeleteCredentialForUser({
            credentialRepository,
            moduleRepository,
            getCredentialForUser,
        }),
    };
}

module.exports = { buildV2Dependencies };
