/**
 * Middleware to require admin privileges via API key
 *
 * Authentication modes (in order of priority):
 * 1. Local development - automatically allowed when running locally
 * 2. Admin API key - requires ADMIN_API_KEY environment variable
 */
const requireAdmin = async (req, res, next) => {
    try {
        // Check if running locally (serverless offline or NODE_ENV=development)
        const isLocal = process.env.IS_OFFLINE === 'true' ||
                       process.env.NODE_ENV === 'development' ||
                       req.headers.host?.includes('localhost');

        if (isLocal) {
            console.log('[Admin Auth] Local environment detected - allowing request');
            return next();
        }

        // Check for admin API key in header
        const adminApiKey = process.env.ADMIN_API_KEY;
        const providedKey = req.headers['x-admin-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

        if (!adminApiKey) {
            console.error('[Admin Auth] ADMIN_API_KEY not configured in environment');
            return res.status(500).json({
                error: 'Admin API key not configured',
                message: 'Server configuration error - contact administrator'
            });
        }

        if (!providedKey) {
            return res.status(401).json({
                error: 'Admin API key required',
                message: 'Provide X-Admin-API-Key header or Authorization: Bearer <key>'
            });
        }

        if (providedKey !== adminApiKey) {
            console.warn('[Admin Auth] Invalid admin API key attempt');
            return res.status(403).json({
                error: 'Invalid admin API key',
                message: 'The provided API key is not valid'
            });
        }

        // Valid admin API key
        console.log('[Admin Auth] Valid admin API key - allowing request');
        return next();

    } catch (error) {
        console.error('Admin middleware error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = { requireAdmin };
