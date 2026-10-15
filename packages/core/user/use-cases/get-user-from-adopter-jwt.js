const Boom = require('@hapi/boom');
const jose = require('jose');
const { User } = require('../user');
const { getLogger } = require('../../logs');
const { resolveAdopterJwtConfig } = require('../adopter-jwt-config');

const log = getLogger('frigg.user.adopter_jwt');

// One remote JWKS per URI per process. jose caches and rotates the fetched
// keys inside it, so building one per request would refetch on every call.
const remoteJwksByUri = new Map();

function getRemoteJwks(uri) {
    if (!remoteJwksByUri.has(uri)) {
        remoteJwksByUri.set(uri, jose.createRemoteJWKSet(new URL(uri)));
    }
    return remoteJwksByUri.get(uri);
}

/** Test seam: forget the process-wide remote JWKS instances. */
function clearAdopterJwksCache() {
    remoteJwksByUri.clear();
}

const REASONS = Object.freeze({
    EXPIRED: 'token_expired',
    NOT_YET_VALID: 'token_not_yet_valid',
    INVALID_SIGNATURE: 'token_invalid_signature',
    WRONG_ISSUER: 'token_wrong_issuer',
    WRONG_AUDIENCE: 'token_wrong_audience',
    MISSING_USER_CLAIM: 'token_missing_user_claim',
    MALFORMED: 'token_malformed',
});

const MESSAGES = Object.freeze({
    [REASONS.EXPIRED]: 'Token has expired',
    [REASONS.NOT_YET_VALID]: 'Token is not yet valid',
    [REASONS.INVALID_SIGNATURE]: 'Token signature could not be verified',
    [REASONS.WRONG_ISSUER]: 'Token issuer is not accepted',
    [REASONS.WRONG_AUDIENCE]: 'Token audience is not accepted',
    [REASONS.MISSING_USER_CLAIM]: 'Token does not identify a user',
    [REASONS.MALFORMED]: 'Token is malformed',
});

// Messages are fixed text per reason. The token and its claims never reach a
// message, `data` or a log record.
function unauthorized(reason) {
    const error = Boom.unauthorized(MESSAGES[reason]);
    error.data = { reason };
    return error;
}

/**
 * Maps a jose failure onto a stable reason code. An algorithm outside the
 * allow-list (including `alg: none`) and a `kid` that matches no key are
 * signature failures from the caller's point of view.
 */
function reasonFor(error) {
    const { errors } = jose;
    if (error instanceof errors.JWTExpired) return REASONS.EXPIRED;
    if (error instanceof errors.JWTClaimValidationFailed) {
        if (error.claim === 'iss') return REASONS.WRONG_ISSUER;
        if (error.claim === 'aud') return REASONS.WRONG_AUDIENCE;
        if (error.claim === 'nbf') return REASONS.NOT_YET_VALID;
        return REASONS.MALFORMED;
    }
    if (
        error instanceof errors.JWSSignatureVerificationFailed ||
        error instanceof errors.JOSEAlgNotAllowed ||
        error instanceof errors.JWKSNoMatchingKey ||
        error instanceof errors.JWKSMultipleMatchingKeys
    ) {
        return REASONS.INVALID_SIGNATURE;
    }
    return REASONS.MALFORMED;
}

// The key source could not be reached or parsed. That is our dependency
// failing, not the caller's token, so it must not read as a 401: a client
// would discard a good session on every JWKS outage.
function isKeySourceFailure(error) {
    const { errors } = jose;
    return (
        error instanceof errors.JWKSTimeout ||
        error instanceof errors.JWKSInvalid ||
        error?.code === 'ERR_JOSE_GENERIC' // remote JWKS answered with a non-200 or the fetch failed
    );
}

const idFromClaim = (value) => {
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return null;
};

/**
 * Authenticates a request by a token issued by the adopter's own identity
 * system (ADR-056 §2): verifies it, then finds or creates the individual and
 * organization users it names.
 *
 * @class GetUserFromAdopterJwt
 */
class GetUserFromAdopterJwt {
    /**
     * @param {Object} params
     * @param {import('../repositories/user-repository-interface').UserRepositoryInterface} params.userRepository
     * @param {Object} params.userConfig - The user config in the app definition.
     * @param {Function|Object|Uint8Array} [params.keySource] - Replaces the key
     *   derived from `jwtConfig`: a jose key, or a getKey function such as
     *   `jose.createLocalJWKSet(jwks)`. Tests and custom key stores use it.
     */
    constructor({ userRepository, userConfig, keySource }) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
        this.keySource = keySource;
    }

    /**
     * @async
     * @param {string} token - The JWT from the Authorization header.
     * @returns {Promise<import('../user').User>}
     * @throws {Boom} 401 with `data.reason` for any token the verifier refuses.
     * @throws {Boom} 403 `multi_org_unsupported` when the person already belongs to another organization.
     * @throws {Boom} 503 `jwks_unavailable` when the key source cannot be read.
     * @throws {Boom} 500 when `jwtConfig` is unusable (startup validation should have caught it).
     */
    async execute(token) {
        const config = this._resolveConfig();
        const claims = await this._verify(token, config);

        const appUserId = idFromClaim(claims[config.userIdClaim]);
        if (!appUserId) throw this._reject(REASONS.MISSING_USER_CLAIM);

        const rawOrgId = claims[config.orgIdClaim];
        const appOrgId = idFromClaim(rawOrgId);
        if (rawOrgId !== undefined && rawOrgId !== null && !appOrgId) {
            throw this._reject(REASONS.MALFORMED);
        }
        const role = claims[config.roleClaim];

        const user = await this._findOrCreateUsers(appUserId, appOrgId);
        user.orgRole = typeof role === 'string' && role !== '' ? role : null;

        log.debug('Adopter token accepted', {
            eventName: `${log.name}.accepted`,
            hasOrganization: Boolean(user.getOrganizationUser()),
        });
        return user;
    }

    _resolveConfig() {
        try {
            return resolveAdopterJwtConfig(this.userConfig?.jwtConfig, {
                hasInjectedKeySource: this.keySource != null,
            });
        } catch {
            throw Boom.badImplementation(
                'Adopter JWT authentication is misconfigured',
                { reason: 'jwt_config_invalid' }
            );
        }
    }

    _keyFor(config) {
        if (this.keySource != null) return this.keySource;
        if (config.jwksUri) return getRemoteJwks(config.jwksUri);
        return new TextEncoder().encode(config.secret);
    }

    _reject(reason) {
        log.debug('Adopter token rejected', {
            eventName: `${log.name}.rejected`,
            reason,
        });
        return unauthorized(reason);
    }

    async _verify(token, config) {
        try {
            const { payload } = await jose.jwtVerify(
                token,
                this._keyFor(config),
                {
                    algorithms: config.algorithms,
                    issuer: config.issuer,
                    audience: config.audience,
                    clockTolerance: config.clockToleranceSec,
                    // A token that never expires is not browser-safe.
                    requiredClaims: ['exp'],
                }
            );
            return payload;
        } catch (error) {
            if (isKeySourceFailure(error)) {
                const unavailable = Boom.serverUnavailable(
                    'Token verification keys are unavailable'
                );
                unavailable.data = { reason: 'jwks_unavailable' };
                throw unavailable;
            }
            throw this._reject(reasonFor(error));
        }
    }

    async _findOrCreateUsers(appUserId, appOrgId) {
        const cfg = this.userConfig;
        const wantIndividual = cfg.individualUserRequired !== false;
        const wantOrg =
            Boolean(appOrgId) && Boolean(cfg.organizationUserRequired);

        let individual = wantIndividual
            ? await this.userRepository.findIndividualUserByAppUserId(appUserId)
            : null;
        let organization = wantOrg
            ? await this.userRepository.findOrganizationUserByAppOrgId(appOrgId)
            : null;

        // Interim rule until the membership table (ADR-056 §3.6): a person
        // belongs to one organization. Decide before creating anything, so a
        // refused request leaves no new organization behind.
        const currentOrgId = individual?.organizationId;
        const hasOrg =
            currentOrgId !== undefined &&
            currentOrgId !== null &&
            currentOrgId !== '';
        if (
            wantOrg &&
            hasOrg &&
            (!organization || String(currentOrgId) !== String(organization.id))
        ) {
            log.debug('Adopter token names a second organization', {
                eventName: `${log.name}.multi_org_refused`,
            });
            const refusal = Boom.forbidden(
                'This user already belongs to a different organization. ' +
                    'Membership in more than one organization is not supported yet (ADR-056 §3.6).'
            );
            refusal.data = { reason: 'multi_org_unsupported' };
            throw refusal;
        }

        if (!individual && wantIndividual) {
            individual = await this.userRepository.createIndividualUser({
                appUserId,
                username: `app-user-${appUserId}`,
                email: `${appUserId}@app.local`,
            });
        }
        if (!organization && wantOrg) {
            organization = await this.userRepository.createOrganizationUser({
                appOrgId,
            });
        }
        if (individual && organization && !hasOrg) {
            individual = await this.userRepository.linkIndividualToOrganization(
                individual.id,
                organization.id
            );
        }

        return new User(
            individual,
            organization,
            cfg.usePassword,
            cfg.primary,
            cfg.individualUserRequired,
            cfg.organizationUserRequired
        );
    }
}

module.exports = { GetUserFromAdopterJwt, clearAdopterJwksCache };
