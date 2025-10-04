const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const { loadAppDefinition } = require('../app-definition-loader');
const { ProcessOAuth2CallbackUseCase } = require('../../modules/use-cases/process-oauth2-callback');
const { createAuthorizationSessionRepository } = require('../../modules/repositories/authorization-session-repository-factory');
const { ProcessAuthorizationCallback } = require('../../modules/use-cases/process-authorization-callback');
const { createModuleRepository } = require('../../modules/repositories/module-repository-factory');
const { createCredentialRepository } = require('../../credential/repositories/credential-repository-factory');
const { getModulesDefinitionFromIntegrationClasses } = require('../../integrations/utils/map-integration-dto');

const router = createIntegrationRouter();

// Initialize OAuth2 callback handler lazily
let processOAuth2Callback;

function initializeOAuth2Callback() {
    if (!processOAuth2Callback) {
        const { integrations } = loadAppDefinition();
        const moduleDefinitions = getModulesDefinitionFromIntegrationClasses(integrations);

        const authSessionRepository = createAuthorizationSessionRepository();
        const moduleRepository = createModuleRepository();
        const credentialRepository = createCredentialRepository();

        const processAuthorizationCallback = new ProcessAuthorizationCallback({
            moduleRepository,
            credentialRepository,
            moduleDefinitions
        });

        processOAuth2Callback = new ProcessOAuth2CallbackUseCase({
            authSessionRepository,
            processAuthorizationCallback
        });
    }
}

// OAuth2 callback handler - thin adapter that delegates to use case
// Note: No authentication required here since user is coming back from OAuth provider
router.route('/api/oauth/callback').get(
    async (req, res) => {
        const timestamp = new Date().toISOString();
        console.log('\n\n========================================');
        console.log(`🔥🔥🔥 [OAuth Callback ${timestamp}] ENDPOINT HIT! 🔥🔥🔥`);
        console.log('========================================');
        console.log('[OAuth Callback] Full request details:', {
            method: req.method,
            url: req.url,
            originalUrl: req.originalUrl,
            query: req.query,
            queryKeys: Object.keys(req.query),
            headers: {
                host: req.headers.host,
                referer: req.headers.referer,
                'user-agent': req.headers['user-agent']
            }
        });

        const defaultFrontend = process.env.FRONTEND_URL || 'http://localhost:5173';
        const defaultPath = '/test-area';

        try {
            const { code, state, error } = req.query;

            console.log('[OAuth Callback] Extracted parameters:', {
                code: code ? `${code.substring(0, 20)}...` : '❌ MISSING!!!',
                state: state || '❌ MISSING!!!',
                error: error || '✅ none'
            });
            console.log('[OAuth Callback] All query params:', req.query);

            // Handle OAuth provider errors (user denied, etc.)
            if (error) {
                console.log('❌ [OAuth Callback] OAuth provider returned error:', error);
                console.log(`🔄 [OAuth Callback] Redirecting to: ${defaultFrontend}${defaultPath}?error=${encodeURIComponent(error)}`);
                console.log('========================================\n\n');
                return res.redirect(`${defaultFrontend}${defaultPath}?error=${encodeURIComponent(error)}`);
            }

            // Validate required parameters
            if (!code || !state) {
                console.log('❌ [OAuth Callback] Missing required parameters!');
                console.log('[OAuth Callback] code present:', !!code);
                console.log('[OAuth Callback] state present:', !!state);
                console.log(`🔄 [OAuth Callback] Redirecting to: ${defaultFrontend}${defaultPath}?error=missing_parameters`);
                console.log('========================================\n\n');
                return res.redirect(`${defaultFrontend}${defaultPath}?error=missing_parameters`);
            }

            // Delegate to use case - it handles all business logic
            console.log('✅ [OAuth Callback] Valid parameters received, processing OAuth callback...');
            initializeOAuth2Callback();

            console.log('[OAuth Callback] Executing ProcessOAuth2CallbackUseCase...');
            const result = await processOAuth2Callback.execute(code, state);

            console.log('✅ [OAuth Callback] OAuth processing completed successfully!');
            console.log('[OAuth Callback] Result:', {
                hasEntity: !!result.entity,
                entityId: result.entity?.id,
                redirectUrl: result.redirectUrl,
                frontendBaseUrl: result.frontendBaseUrl
            });

            // Map domain result to HTTP response
            // Use frontendBaseUrl from session if available, otherwise fall back to env var
            const frontendBase = result.frontendBaseUrl || defaultFrontend;
            const redirectUrl = new URL(result.redirectUrl, frontendBase);
            redirectUrl.searchParams.set('success', 'true');

            console.log(`🔄 [OAuth Callback] Redirecting to: ${redirectUrl.toString()}`);
            console.log('========================================\n\n');
            res.redirect(redirectUrl.toString());

        } catch (error) {
            console.error('❌❌❌ [OAuth Callback] ERROR! ❌❌❌');
            console.error('[OAuth Callback] Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });

            const errorRedirect = `${defaultFrontend}${defaultPath}?error=${encodeURIComponent(error.message)}`;
            console.log(`🔄 [OAuth Callback] Redirecting to error page: ${errorRedirect}`);
            console.log('========================================\n\n');

            // Map error to HTTP response
            res.redirect(errorRedirect);
        }
    }
);

router.route('/redirect/:appId').get((req, res) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${req.params.appId
        }?${new URLSearchParams(req.query)}`
    );
});

// Integration settings endpoint
router.route('/config/integration-settings').get(requireLoggedInUser, (req, res) => {
    const appDefinition = loadAppDefinition();

    const settings = {
        autoProvisioningEnabled: appDefinition.integration?.autoProvisioningEnabled ?? true,
        credentialReuseStrategy: appDefinition.integration?.credentialReuseStrategy ?? 'shared',
        allowUserManagedEntities: appDefinition.integration?.allowUserManagedEntities ?? true
    };

    res.json(settings);
});

const handler = createAppHandler('HTTP Event: Auth', router);

module.exports = { handler, router };
