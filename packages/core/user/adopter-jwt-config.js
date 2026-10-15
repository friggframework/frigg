const { getLogger } = require('../logs');

const log = getLogger('frigg.user.adopter_jwt');

/**
 * Normalises and validates `user.jwtConfig` from the app definition (ADR-056 §2).
 * Called once at startup by the app definition loader and once per verifier,
 * never per request.
 */

const ASYMMETRIC_ALGORITHMS = ['ES256', 'ES384', 'RS256', 'RS384', 'RS512'];
const HMAC_ALGORITHMS = ['HS256', 'HS384', 'HS512'];
const SUPPORTED_ALGORITHMS = [...ASYMMETRIC_ALGORITHMS, ...HMAC_ALGORITHMS];

const DEFAULTS = Object.freeze({
    jwksAlgorithms: Object.freeze(['ES256', 'RS256']),
    secretAlgorithms: Object.freeze(['HS256']),
    clockToleranceSec: 30,
    userIdClaim: 'sub',
    orgIdClaim: 'org_id',
    roleClaim: 'org_role',
});

const isNonEmptyString = (value) =>
    typeof value === 'string' && value.trim() !== '';

const hasAudience = (audience) =>
    isNonEmptyString(audience) ||
    (Array.isArray(audience) &&
        audience.length > 0 &&
        audience.every(isNonEmptyString));

const LOOPBACK_IPV4 = /^127(\.\d{1,3}){3}$/;

function isLoopbackHost(hostname) {
    return (
        hostname === 'localhost' ||
        hostname === '[::1]' ||
        LOOPBACK_IPV4.test(hostname)
    );
}

/**
 * The JWKS is the trust root: fetched over https, or over http only to the
 * machine itself (a local identity provider in development).
 */
function assertJwksUri(jwksUri) {
    let url;
    try {
        url = new URL(jwksUri);
    } catch {
        throw new Error('user.jwtConfig.jwksUri is not a valid URL');
    }
    if (url.protocol === 'https:') return;
    if (url.protocol === 'http:' && isLoopbackHost(url.hostname)) return;
    throw new Error(
        'user.jwtConfig.jwksUri must use https (http is allowed only for localhost, 127.0.0.0/8 and ::1)'
    );
}

/**
 * @param {Object} [jwtConfig] `userConfig.jwtConfig`
 * @returns {{jwksUri?: string, secret?: string, issuer?: string,
 *   audience?: string|string[], algorithms: string[], clockToleranceSec: number,
 *   userIdClaim: string, orgIdClaim: string, roleClaim: string}}
 * @throws {Error} When the config cannot verify any token safely.
 */
function resolveAdopterJwtConfig(jwtConfig) {
    const config = jwtConfig && typeof jwtConfig === 'object' ? jwtConfig : {};
    const hasJwks = isNonEmptyString(config.jwksUri);
    const hasSecret = isNonEmptyString(config.secret);

    if (!hasJwks && !hasSecret) {
        throw new Error(
            'user.authModes.adopterJwt is enabled but user.jwtConfig has neither jwksUri nor secret'
        );
    }
    if (hasJwks && hasSecret) {
        throw new Error(
            'user.jwtConfig sets both jwksUri and secret; set one, so a token cannot choose which key family verifies it'
        );
    }
    if (hasJwks) {
        assertJwksUri(config.jwksUri);
        // Without an audience, a token minted by the same issuer for another
        // service verifies here. HMAC mode shares its secret with one issuer,
        // so it stays lenient.
        if (!hasAudience(config.audience)) {
            throw new Error(
                'user.jwtConfig.audience is required when jwksUri is used'
            );
        }
    }
    if (config.algorithm !== undefined && config.algorithms !== undefined) {
        throw new Error(
            'user.jwtConfig sets both algorithm and algorithms; use algorithms (algorithm is a deprecated alias)'
        );
    }

    const configured =
        config.algorithms ??
        (config.algorithm ? [config.algorithm] : undefined);
    const algorithms =
        configured ??
        (hasSecret ? DEFAULTS.secretAlgorithms : DEFAULTS.jwksAlgorithms);

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
    // algorithm-confusion attacks are built.
    if (hasSecret && algorithms.some((alg) => !HMAC_ALGORITHMS.includes(alg))) {
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
 * is unusable, and warns when a jwksUri has no issuer. A no-op when the mode
 * is off, so apps that never enabled it are not affected by a stray `jwtConfig`.
 *
 * @param {Object|null} [userConfig] `appDefinition.user`
 * @throws {Error}
 */
function assertAdopterJwtConfig(userConfig) {
    if (userConfig?.authModes?.adopterJwt !== true) return;
    const config = resolveAdopterJwtConfig(userConfig.jwtConfig);
    if (config.jwksUri && !config.issuer) {
        log.warn(
            'Adopter JWT issuer is not set; any issuer on this JWKS is accepted',
            {
                eventName: `${log.name}.issuer_unset`,
            }
        );
    }
}

module.exports = {
    resolveAdopterJwtConfig,
    assertAdopterJwtConfig,
    SUPPORTED_ALGORITHMS,
};
