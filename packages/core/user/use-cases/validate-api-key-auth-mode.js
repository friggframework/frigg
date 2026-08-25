/**
 * Validate the `user.authModes.apiKey` block of an app definition against the
 * app's registered module definitions (ADR-034 §Config).
 *
 * Default-off: when `authModes.apiKey` is absent this is a no-op, so apps that
 * do not opt in are completely unaffected. When present, every named identity
 * module MUST exist in the app's modules, or the app is misconfigured and we
 * fail fast at wiring time rather than at first login.
 *
 * Accepts either:
 *   - `authModes.apiKey.module`  — a single identity module (the common case), or
 *   - `authModes.apiKey.modules` — an allowlist of identity modules (multi-identity apps).
 *
 * @param {Object} userConfig - The app definition's `user` config (may be null).
 * @param {Array<Object>} moduleDefinitions - Registered module definitions (each with `moduleName`).
 * @throws {Error} If apiKey mode is declared but names no module, or names a module the app does not register.
 * @returns {void}
 */
function validateApiKeyAuthMode(userConfig, moduleDefinitions = []) {
    const config = userConfig?.authModes?.apiKey;
    if (!config) {
        return; // apiKey mode not enabled — nothing to validate.
    }

    const named = [];
    if (Array.isArray(config.modules)) {
        named.push(...config.modules);
    }
    if (config.module) {
        named.push(config.module);
    }

    if (named.length === 0) {
        throw new Error(
            'Invalid app definition: user.authModes.apiKey is enabled but names no identity module. ' +
                "Set authModes.apiKey.module = '<moduleName>' (or authModes.apiKey.modules = ['<moduleName>', ...])."
        );
    }

    const known = new Set(
        (moduleDefinitions || [])
            .map((def) => def && def.moduleName)
            .filter(Boolean)
    );

    for (const moduleName of named) {
        if (typeof moduleName !== 'string' || moduleName.trim() === '') {
            throw new Error(
                'Invalid app definition: user.authModes.apiKey names a non-string module.'
            );
        }
        if (!known.has(moduleName)) {
            throw new Error(
                `Invalid app definition: user.authModes.apiKey.module '${moduleName}' is not a registered module. ` +
                    `Registered modules: ${[...known].join(', ') || '(none)'}.`
            );
        }
    }

    // allowedOrigins, when present, MUST be an array. A bare string would be
    // iterated character-by-character by the Origin/Referer allowlist check
    // (`allowed.includes(candidate)` on a string tests substrings), silently
    // widening or breaking CSRF enforcement.
    if (
        config.allowedOrigins !== undefined &&
        !Array.isArray(config.allowedOrigins)
    ) {
        throw new Error(
            'Invalid app definition: user.authModes.apiKey.allowedOrigins must be an array of origin strings.'
        );
    }

    // rateLimit, when present, must be an object whose numeric knobs are positive
    // finite numbers. A `0`, negative, or NaN would disable or corrupt the
    // limiter (e.g. maxPerKey:0 rejects every request; windowMs:NaN never rolls),
    // so fail fast at wiring time rather than shipping a broken oracle guard.
    if (config.rateLimit !== undefined) {
        if (
            typeof config.rateLimit !== 'object' ||
            config.rateLimit === null ||
            Array.isArray(config.rateLimit)
        ) {
            throw new Error(
                'Invalid app definition: user.authModes.apiKey.rateLimit must be an object.'
            );
        }
        for (const field of ['maxPerKey', 'maxGlobal', 'windowMs']) {
            const value = config.rateLimit[field];
            if (
                value !== undefined &&
                (typeof value !== 'number' ||
                    !Number.isFinite(value) ||
                    value <= 0)
            ) {
                throw new Error(
                    `Invalid app definition: user.authModes.apiKey.rateLimit.${field} must be a positive finite number.`
                );
            }
        }
    }
}

module.exports = { validateApiKeyAuthMode };
