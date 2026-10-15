const jose = require('jose');
const { getLogger } = require('../logs');
const { resolveAdopterJwtConfig } = require('./adopter-jwt-config');
const { fail } = require('./adopter-jwt-errors');

const log = getLogger('frigg.user.adopter_jwt');

/**
 * The only failures that are the caller's token. Anything else thrown while
 * verifying (a refused connection, a DNS failure, a non-200 from the JWKS, a
 * generic JOSE error) is our key source failing, not a bad token.
 */
function tokenFailureCode(error) {
    const { errors } = jose;
    if (error instanceof errors.JWTExpired) return 'token_expired';
    if (error instanceof errors.JWTClaimValidationFailed) {
        if (error.claim === 'iss') return 'token_wrong_issuer';
        if (error.claim === 'aud') return 'token_wrong_audience';
        if (error.claim === 'nbf') return 'token_not_yet_valid';
        return 'token_malformed';
    }
    if (
        error instanceof errors.JWSSignatureVerificationFailed ||
        error instanceof errors.JOSEAlgNotAllowed ||
        error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JWKSMultipleMatchingKeys
    ) {
        return 'token_invalid_signature';
    }
    if (
        error instanceof errors.JWSInvalid ||
        error instanceof errors.JWTInvalid
    ) {
        return 'token_malformed';
    }
    return null;
}

/**
 * Verifies adopter-issued tokens (ADR-056 §2). Owns config resolution, the key
 * source and the mapping from jose failures to typed Boom errors.
 *
 * Build one per app definition: the config is resolved once here, and the
 * remote JWKS is an instance field, so jose's key cache lives as long as the
 * verifier does. A bad config does not throw here (apps with adopterJwt off
 * build a verifier too); `verify` answers 500 and logs the real reason.
 *
 * @param {Object} params
 * @param {Object} [params.jwtConfig] `userConfig.jwtConfig`
 * @param {Function|Object|Uint8Array} [params.keySource] Replaces the key
 *   derived from the config: a jose key or a getKey function such as
 *   `jose.createLocalJWKSet(jwks)`. Tests and custom key stores use it.
 * @returns {{verify: (token: string) => Promise<Object>,
 *   claimNames: {userIdClaim: string, orgIdClaim: string, roleClaim: string}}}
 */
function createAdopterTokenVerifier({ jwtConfig, keySource } = {}) {
    let config = null;
    let configError = null;
    try {
        config = resolveAdopterJwtConfig(jwtConfig);
    } catch (error) {
        configError = error;
    }

    let key = null;
    if (config) {
        key =
            keySource ??
            (config.jwksUri
                ? jose.createRemoteJWKSet(new URL(config.jwksUri))
                : new TextEncoder().encode(config.secret));
    }

    const requireConfig = () => {
        if (config) return config;
        log.error('Adopter JWT config is invalid', {
            eventName: `${log.name}.config_invalid`,
            validationMessage: configError.message,
        });
        throw fail('jwt_config_invalid');
    };

    return {
        get claimNames() {
            const { userIdClaim, orgIdClaim, roleClaim } = requireConfig();
            return { userIdClaim, orgIdClaim, roleClaim };
        },

        /**
         * @param {string} token
         * @returns {Promise<Object>} the verified claims
         * @throws {Boom} 401 with `data.reason` for a token the verifier refuses
         * @throws {Boom} 503 `jwks_unavailable` for any other verification failure
         * @throws {Boom} 500 `jwt_config_invalid` when the config is unusable
         */
        async verify(token) {
            const resolved = requireConfig();
            try {
                const { payload } = await jose.jwtVerify(token, key, {
                    algorithms: resolved.algorithms,
                    issuer: resolved.issuer,
                    audience: resolved.audience,
                    clockTolerance: resolved.clockToleranceSec,
                    // A token that never expires is not browser-safe.
                    requiredClaims: ['exp'],
                });
                return payload;
            } catch (error) {
                const code = tokenFailureCode(error) ?? 'jwks_unavailable';
                if (code !== 'jwks_unavailable') {
                    log.debug('Adopter token rejected', {
                        eventName: `${log.name}.rejected`,
                        reason: code,
                    });
                }
                throw fail(code);
            }
        },
    };
}

module.exports = { createAdopterTokenVerifier };
