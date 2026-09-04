const crypto = require('node:crypto');

/**
 * Admin Auth Middleware
 *
 * Shared authentication middleware for all admin endpoints:
 * - /admin/db-migrate/*
 * - /admin/scripts/*
 *
 * Uses simple ENV-based API key validation.
 * Expects: x-frigg-admin-api-key header
 */

/**
 * Constant-time comparison of two secrets. Hashing both to a fixed-length
 * digest first means timingSafeEqual never throws on length mismatch and the
 * comparison leaks neither the key nor its length.
 * @private
 */
function secretsMatch(provided, expected) {
    const providedHash = crypto
        .createHash('sha256')
        .update(String(provided))
        .digest();
    const expectedHash = crypto
        .createHash('sha256')
        .update(String(expected))
        .digest();
    return crypto.timingSafeEqual(providedHash, expectedHash);
}

/**
 * Validate admin API key from request header
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function validateAdminApiKey(req, res, next) {
    const expectedKey = process.env.ADMIN_API_KEY;

    // Check if admin API key is configured
    if (!expectedKey) {
        console.error('ADMIN_API_KEY environment variable not configured');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Admin API key not configured',
        });
    }

    const apiKey = req.headers['x-frigg-admin-api-key'];

    // Check if header is present
    if (!apiKey) {
        console.error('Missing x-frigg-admin-api-key header');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'x-frigg-admin-api-key header required',
        });
    }

    // Validate key using a constant-time comparison
    if (!secretsMatch(apiKey, expectedKey)) {
        console.error('Invalid admin API key provided');
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid admin API key',
        });
    }

    next();
}

module.exports = { validateAdminApiKey };
