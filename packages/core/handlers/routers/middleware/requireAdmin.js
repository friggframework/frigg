/**
 * Middleware to require admin API key authentication.
 * Checks for x-frigg-admin-api-key header matching ADMIN_API_KEY environment variable.
 * In non-production environments, allows all requests through for easier development.
 *
 * Uses the same header convention as validateAdminApiKey (handlers/middleware/admin-auth.js).
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware function
 */
const requireAdmin = (req, res, next) => {
    // Allow access in local development (when NODE_ENV is not production)
    if (process.env.NODE_ENV !== 'production') {
        console.log('[requireAdmin] Development mode - bypassing admin auth');
        return next();
    }

    const apiKey = req.headers['x-frigg-admin-api-key'];

    if (!apiKey) {
        console.error('[requireAdmin] Missing x-frigg-admin-api-key header');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - Admin API key required',
            code: 'MISSING_API_KEY',
        });
    }

    if (apiKey !== process.env.ADMIN_API_KEY) {
        console.error('[requireAdmin] Invalid API key provided');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - Invalid admin API key',
            code: 'INVALID_API_KEY',
        });
    }

    console.log('[requireAdmin] Admin authentication successful');
    next();
};

module.exports = { requireAdmin };
