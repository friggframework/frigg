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
}

module.exports = { validateApiKeyAuthMode };
