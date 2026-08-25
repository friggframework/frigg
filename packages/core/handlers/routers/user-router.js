const express = require('express');
const Boom = require('@hapi/boom');
const { checkRequiredParams } = require('@friggframework/core');
const catchAsyncError = require('express-async-handler');

const LOCAL_STAGES = ['dev', 'test', 'local'];

/**
 * Best-effort client IP for the per-IP rate-limit bucket. Prefers the first hop
 * of X-Forwarded-For (set by API Gateway / proxies), falls back to the socket.
 */
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        return xff.split(',')[0].trim();
    }
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * CSRF Origin/Referer allowlist for the cookie-bearing apiKey login (ADR-034 §7).
 * Enforced only when the app configures `authModes.apiKey.allowedOrigins`.
 * Default (unconfigured): no origin restriction beyond the SameSite cookie —
 * documented, and appropriate for token-only (non-cookie) SPA usage.
 */
function assertOriginAllowed(req, userConfig) {
    const allowed = userConfig?.authModes?.apiKey?.allowedOrigins;
    if (!Array.isArray(allowed) || allowed.length === 0) {
        return; // not configured → rely on SameSite; see ADR-034 §7.
    }
    const origin = req.headers.origin;
    const referer = req.headers.referer || req.headers.referrer;
    const candidate =
        origin ||
        (referer
            ? (() => {
                  try {
                      const u = new URL(referer);
                      return `${u.protocol}//${u.host}`;
                  } catch {
                      return null;
                  }
              })()
            : null);

    if (!candidate || !allowed.includes(candidate)) {
        throw Boom.forbidden('Origin not allowed');
    }
}

/**
 * Set the session cookie with the hygiene ADR-034 §7 requires: httpOnly, secure
 * in non-local stages, SameSite. The access token is ALSO returned in the body
 * so token-only (header-bearer) clients work without reading the cookie.
 */
function setSessionCookie(res, token) {
    const isLocal = LOCAL_STAGES.includes(process.env.STAGE);
    res.cookie('frigg_session', token, {
        httpOnly: true,
        secure: !isLocal,
        sameSite: 'strict',
        path: '/',
    });
}

/**
 * Build the user router. Dependencies are injected so the routes can be tested
 * in isolation. `POST /user/login` is polymorphic (ADR-034):
 *   { username, password } → friggToken (unchanged)
 *   { apiKey }             → apiKey mode (module-validated), when enabled.
 *
 * This module has NO import-time side effects — the production wiring lives in
 * `user.js`, which loads the app definition and calls this factory.
 *
 * @param {Object} deps
 * @param {Object} deps.userConfig
 * @param {import('../../user/use-cases/login-user').LoginUser} deps.loginUser
 * @param {import('../../user/use-cases/create-individual-user').CreateIndividualUser} deps.createIndividualUser
 * @param {import('../../user/use-cases/create-token-for-user-id').CreateTokenForUserId} deps.createTokenForUserId
 * @param {import('../../user/use-cases/login-with-api-key').LoginWithApiKey|null} deps.loginWithApiKey - null when apiKey mode is off.
 * @param {import('../rate-limiter').FixedWindowRateLimiter} deps.apiKeyLoginLimiter
 * @returns {express.Router}
 */
function buildUserRouter({
    userConfig,
    loginUser,
    createIndividualUser,
    createTokenForUserId,
    loginWithApiKey,
    apiKeyLoginLimiter,
}) {
    const router = express();
    const apiKeyModeEnabled = Boolean(loginWithApiKey);

    router.route('/user/login').post(
        catchAsyncError(async (req, res) => {
            const body = req.body || {};

            // Dispatch: an { apiKey } body selects the apiKey mode. The bodies
            // are disjoint, so a password login is never affected by this branch.
            if (typeof body.apiKey === 'string') {
                // Generic rejection when the mode is not enabled — no enumeration.
                if (!apiKeyModeEnabled) {
                    throw Boom.unauthorized('Invalid credentials');
                }

                // Rate limit BEFORE any provider work (oracle protection).
                const { allowed } = apiKeyLoginLimiter.check(getClientIp(req));
                if (!allowed) {
                    throw Boom.tooManyRequests('Too many requests');
                }

                // CSRF: cookie-bearing route.
                assertOriginAllowed(req, userConfig);

                const { token } = await loginWithApiKey.execute({
                    apiKey: body.apiKey,
                    module: body.module,
                });

                setSessionCookie(res, token);
                res.status(201);
                res.json({ token });
                return;
            }

            // friggToken path — UNCHANGED.
            const { username, password } = checkRequiredParams(req.body, [
                'username',
                'password',
            ]);
            const user = await loginUser.execute({ username, password });
            const token = await createTokenForUserId.execute(user.getId(), 120);
            res.status(201);
            res.json({ token });
        })
    );

    router.route('/user/create').post(
        catchAsyncError(async (req, res) => {
            const { username, password } = checkRequiredParams(req.body, [
                'username',
                'password',
            ]);

            const user = await createIndividualUser.execute({
                username,
                password,
            });
            const token = await createTokenForUserId.execute(user.getId(), 120);
            res.status(201);
            res.json({ token });
        })
    );

    return router;
}

module.exports = {
    buildUserRouter,
    getClientIp,
    assertOriginAllowed,
    setSessionCookie,
};
