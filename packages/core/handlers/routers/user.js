const { createAppHandler } = require('../app-handler-helpers');
const {
    createUserRepository,
} = require('../../user/repositories/user-repository-factory');
const {
    createModuleRepository,
} = require('../../modules/repositories/module-repository-factory');
const {
    createCredentialRepository,
} = require('../../credential/repositories/credential-repository-factory');
const {
    createIntegrationRepository,
} = require('../../integrations/repositories/integration-repository-factory');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../../integrations/utils/map-integration-dto');
const {
    CreateIndividualUser,
} = require('../../user/use-cases/create-individual-user');
const { LoginUser } = require('../../user/use-cases/login-user');
const {
    CreateTokenForUserId,
} = require('../../user/use-cases/create-token-for-user-id');
const {
    GetUserFromXFriggHeaders,
} = require('../../user/use-cases/get-user-from-x-frigg-headers');
const { LoginWithApiKey } = require('../../user/use-cases/login-with-api-key');
const {
    validateApiKeyAuthMode,
} = require('../../user/use-cases/validate-api-key-auth-mode');
const {
    ProcessAuthorizationCallback,
} = require('../../modules/use-cases/process-authorization-callback');
const { FixedWindowRateLimiter } = require('../rate-limiter');
const { loadAppDefinition } = require('../app-definition-loader');
const { buildUserRouter } = require('./user-router');

// ---------------------------------------------------------------------------
// Module-scope wiring (production). Kept thin; all logic lives in use cases.
// The route factory (buildUserRouter) is side-effect-free and lives in
// ./user-router.js so it can be unit-tested without loading an app definition.
// ---------------------------------------------------------------------------
const { integrations: integrationClasses, userConfig } = loadAppDefinition();
const moduleDefinitions =
    getModulesDefinitionFromIntegrationClasses(integrationClasses);

// Fail fast if apiKey mode names a module the app does not have (no-op when off).
validateApiKeyAuthMode(userConfig, moduleDefinitions);

const apiKeyModeEnabled = Boolean(userConfig?.authModes?.apiKey);
const userRepository = createUserRepository();
const createIndividualUser = new CreateIndividualUser({
    userRepository,
    userConfig,
});
const loginUser = new LoginUser({ userRepository, userConfig });
const createTokenForUserId = new CreateTokenForUserId({ userRepository });

// apiKey-mode collaborators are only wired when the mode is enabled, so an app
// that never opts in pays nothing and behaves exactly as before.
let loginWithApiKey = null;
if (apiKeyModeEnabled) {
    const moduleRepository = createModuleRepository();
    const credentialRepository = createCredentialRepository();
    const integrationRepository = createIntegrationRepository();

    const getUserFromXFriggHeaders = new GetUserFromXFriggHeaders({
        userRepository,
        userConfig,
    });
    const processAuthorizationCallback = new ProcessAuthorizationCallback({
        moduleRepository,
        credentialRepository,
        integrationRepository,
        moduleDefinitions,
    });

    loginWithApiKey = new LoginWithApiKey({
        userConfig,
        moduleDefinitions,
        getUserFromXFriggHeaders,
        processAuthorizationCallback,
        createTokenForUserId,
    });
}

const rlConfig = userConfig?.authModes?.apiKey?.rateLimit || {};
const apiKeyLoginLimiter = new FixedWindowRateLimiter({
    windowMs: rlConfig.windowMs ?? 60000,
    maxPerKey: rlConfig.maxPerKey ?? 10,
    maxGlobal: rlConfig.maxGlobal ?? 1000,
});

const router = buildUserRouter({
    userConfig,
    loginUser,
    createIndividualUser,
    createTokenForUserId,
    loginWithApiKey,
    apiKeyLoginLimiter,
});

const handler = createAppHandler('HTTP Event: User', router);

module.exports = { handler, router };
