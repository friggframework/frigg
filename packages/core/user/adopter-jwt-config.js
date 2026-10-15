/**
 * Normalises and validates `user.jwtConfig` from the app definition (ADR-056 §2).
 *
 * Pure: no I/O and no dependencies, so the app definition loader can call it
 * at startup and the use case can call it per request without a cycle.
 */

const ASYMMETRIC_ALGORITHMS = ['ES256', 'ES384', 'RS256', 'RS384', 'RS512'];
const HMAC_ALGORITHMS = ['HS256', 'HS384', 'HS512'];
const SUPPORTED_ALGORITHMS = [...ASYMMETRIC_ALGORITHMS, ...HMAC_ALGORITHMS];

const DEFAULTS = Object.freeze({
    clockToleranceSec: 30,
    userIdClaim: 'sub',
    orgIdClaim: 'org_id',
    roleClaim: 'org_role',
});

const isNonEmptyString = (value) =>
    typeof value === 'string' && value.trim() !== '';

/**
 * @param {Object} [jwtConfig] `userConfig.jwtConfig`
 * @param {Object} [options]
 * @param {boolean} [options.hasInjectedKeySource] A key source is supplied in
 *   code (tests, custom key stores), so neither `jwksUri` nor `secret` is needed.
 * @returns {{jwksUri?: string, secret?: string, issuer?: string,
 *   audience?: string|string[], algorithms: string[], clockToleranceSec: number,
 *   userIdClaim: string, orgIdClaim: string, roleClaim: string}}
 * @throws {Error} When the config cannot verify any token safely.
 */
function resolveAdopterJwtConfig(
    jwtConfig,
    { hasInjectedKeySource = false } = {}
) {
    const config = jwtConfig && typeof jwtConfig === 'object' ? jwtConfig : {};
    const hasJwks = isNonEmptyString(config.jwksUri);
    const hasSecret = isNonEmptyString(config.secret);

    if (!hasJwks && !hasSecret && !hasInjectedKeySource) {
        throw new Error(
            'user.authModes.adopterJwt is enabled but user.jwtConfig has neither jwksUri nor secret'
        );
    }
    if (hasJwks && hasSecret) {
        throw new Error(
            'user.jwtConfig sets both jwksUri and secret; set one, so a token cannot choose which key family verifies it'
        );
    }

    const symmetric = hasSecret;
    // `algorithm` (singular) is the pre-2.1 spelling and stays as an alias.
    const configured =
        config.algorithms ??
        (config.algorithm ? [config.algorithm] : undefined);
    const algorithms =
        configured ?? (symmetric ? ['HS256'] : ['ES256', 'RS256']);

    if (
        !Array.isArray(algorithms) ||
        algorithms.length === 0 ||
        algorithms.some((alg) => !SUPPORTED_ALGORITHMS.includes(alg))
    ) {
        throw new Error(
            `user.jwtConfig.algorithms must be a non-empty list drawn from ${SUPPORTED_ALGORITHMS.join(
                ', '
            )}`
        );
    }
    // A key family only verifies its own algorithms; mixing them is how
    // algorithm-confusion attacks are built. A key source injected in code
    // (no jwksUri, no secret) is the caller's responsibility.
    if (symmetric && algorithms.some((alg) => !HMAC_ALGORITHMS.includes(alg))) {
        throw new Error(
            'user.jwtConfig.algorithms may only list HS* algorithms when secret is used'
        );
    }
    if (hasJwks && algorithms.some((alg) => HMAC_ALGORITHMS.includes(alg))) {
        throw new Error(
            'user.jwtConfig.algorithms may not list HS* algorithms when jwksUri is used'
        );
    }

    const clockToleranceSec =
        config.clockToleranceSec ?? DEFAULTS.clockToleranceSec;
    if (!Number.isInteger(clockToleranceSec) || clockToleranceSec < 0) {
        throw new Error(
            'user.jwtConfig.clockToleranceSec must be an integer >= 0'
        );
    }

    return {
        jwksUri: hasJwks ? config.jwksUri : undefined,
        secret: hasSecret ? config.secret : undefined,
        issuer: config.issuer || undefined,
        audience: config.audience || undefined,
        algorithms,
        clockToleranceSec,
        userIdClaim: config.userIdClaim || DEFAULTS.userIdClaim,
        orgIdClaim: config.orgIdClaim || DEFAULTS.orgIdClaim,
        roleClaim: config.roleClaim || DEFAULTS.roleClaim,
    };
}

/**
 * Startup check: throws when `authModes.adopterJwt` is on and `jwtConfig`
 * is unusable. A no-op when the mode is off, so apps that never enabled it
 * are not affected by a stray `jwtConfig`.
 *
 * @param {Object|null} [userConfig] `appDefinition.user`
 * @throws {Error}
 */
function assertAdopterJwtConfig(userConfig) {
    if (userConfig?.authModes?.adopterJwt !== true) return;
    resolveAdopterJwtConfig(userConfig.jwtConfig);
}

module.exports = {
    resolveAdopterJwtConfig,
    assertAdopterJwtConfig,
    SUPPORTED_ALGORITHMS,
};
