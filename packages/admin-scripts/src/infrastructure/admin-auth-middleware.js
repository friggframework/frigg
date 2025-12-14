const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');

/**
 * Admin API Key Authentication Middleware
 *
 * Validates admin API keys for script endpoints.
 * Expects: Authorization: Bearer <api-key>
 */
async function adminAuthMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing or invalid Authorization header',
                code: 'MISSING_AUTH'
            });
        }

        const apiKey = authHeader.substring(7); // Remove 'Bearer '
        const commands = createAdminScriptCommands();
        const result = await commands.validateAdminApiKey(apiKey);

        if (result.error) {
            return res.status(result.error).json({
                error: result.reason,
                code: result.code
            });
        }

        // Attach validated key info to request for audit trail
        req.adminApiKey = result.apiKey;
        req.adminAudit = {
            apiKeyName: result.apiKey.name,
            apiKeyLast4: result.apiKey.keyLast4,
            ipAddress: req.ip || req.connection?.remoteAddress || 'unknown'
        };

        next();
    } catch (error) {
        console.error('Admin auth middleware error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            code: 'AUTH_ERROR'
        });
    }
}

module.exports = { adminAuthMiddleware };
