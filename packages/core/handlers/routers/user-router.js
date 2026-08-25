const express = require('express');
const Boom = require('@hapi/boom');
const { checkRequiredParams } = require('@friggframework/core');
const catchAsyncError = require('express-async-handler');

const LOCAL_STAGES = ['dev', 'test', 'local'];

/**
 * Number of trusted proxies (API Gateway, ALB, CloudFront, …) in front of the
 * app. The client IP is taken this many hops from the RIGHT of X-Forwarded-For.
 * Defaults to 1 (the single trusted hop AWS API Gateway adds). Only a positive
 * finite integer is honored; anything else falls back to 1.
 */
function trustedProxyDepth(userConfig) {
    const configured =
        userConfig?.authModes?.apiKey?.rateLimit?.trustedProxyDepth;
    if (
        typeof configured === 'number' &&
        Number.isInteger(configured) &&
        configured > 0
    ) {
        return configured;
    }
    return 1;
}

/**
 * Client IP for the per-IP rate-limit bucket, derived from a TRUSTED position in
 * X-Forwarded-For.
 *
 * X-Forwarded-For is `client, proxy1, …, proxyN`, where each trusted proxy
 * APPENDS the address it received the request from. The LEFTMOST entry is
 * therefore attacker-controlled (a client can pre-seed it), so keying the limiter
 * off `split(',')[0]` let an attacker mint a fresh bucket per request and defeat
 * the per-IP cap entirely. We instead read the entry `trustedProxyDepth` hops
 * from the right — the value stamped by the first trusted proxy — which the
 * client cannot forge. Falls back to the socket address when no XFF is present.
 *
 * NOTE: `maxGlobal` on the limiter is the only hard in-process ceiling this
 * endpoint has, and even that is per-container in a multi-instance serverless
 * deployment. The real per-IP control belongs at the edge (WAF / API Gateway
 * throttling); this limiter is a floor, not a guarantee.
 */
function getClientIp(req, userConfig) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
        const parts = xff
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
        if (parts.length > 0) {
            const depth = trustedProxyDepth(userConfig);
            const idx = Math.max(0, parts.length - depth);
            return parts[idx];
        }
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
 * in non-local stages, SameSite. The cookie lifetime is aligned to the session
 * token TTL so the browser drops the cookie exactly when the token stops being
 * valid (no stale cookie outliving its token, and no token outliving its cookie).
 * The access token is ALSO returned in the body so token-only (header-bearer)
 * clients work without reading the cookie.
 *
 * @param {import('express').Response} res
 * @param {string} token
 * @param {number} [ttlMinutes=120] - Session token TTL; drives Max-Age/Expires.
 */
function setSessionCookie(res, token, ttlMinutes = 120) {
    const isLocal = LOCAL_STAGES.includes(process.env.STAGE);
    const options = {
        httpOnly: true,
        secure: !isLocal,
        sameSite: 'strict',
        path: '/',
    };
    // Align cookie lifetime to the token TTL (express sets both Max-Age and
    // Expires from maxAge). Guard against a non-positive/NaN TTL.
    if (Number.isFinite(ttlMinutes) && ttlMinutes > 0) {
        options.maxAge = ttlMinutes * 60 * 1000;
    }
    res.cookie('frigg_session', token, options);
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

                // Rate limit BEFORE any provider work (oracle protection). The
                // bucket key is derived from a trusted XFF position so a client
                // cannot rotate it to escape the per-IP cap.
                const { allowed } = apiKeyLoginLimiter.check(
                    getClientIp(req, userConfig)
                );
                if (!allowed) {
                    throw Boom.tooManyRequests('Too many requests');
                }

                // CSRF: cookie-bearing route.
                assertOriginAllowed(req, userConfig);

                const { token } = await loginWithApiKey.execute({
                    apiKey: body.apiKey,
                    module: body.module,
                });

                // Align the cookie lifetime to the minted token's TTL.
                setSessionCookie(
                    res,
                    token,
                    loginWithApiKey.tokenExpiryMinutes ?? 120
                );
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
