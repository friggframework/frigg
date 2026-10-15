/* eslint-disable camelcase -- the reason codes are snake_case by spec */
const Boom = require('@hapi/boom');

/**
 * Every failure adopter-token authentication can produce, keyed by the stable
 * reason code clients see in `error.data.reason`. Messages are fixed text:
 * the token and its claims never reach a message, `data` or a log record.
 */
const ADOPTER_JWT_ERRORS = Object.freeze({
    token_expired: Object.freeze({ status: 401, message: 'Token has expired' }),
    token_not_yet_valid: Object.freeze({
        status: 401,
        message: 'Token is not yet valid',
    }),
    token_invalid_signature: Object.freeze({
        status: 401,
        message: 'Token signature could not be verified',
    }),
    token_wrong_issuer: Object.freeze({
        status: 401,
        message: 'Token issuer is not accepted',
    }),
    token_wrong_audience: Object.freeze({
        status: 401,
        message: 'Token audience is not accepted',
    }),
    token_missing_user_claim: Object.freeze({
        status: 401,
        message: 'Token does not identify a user',
    }),
    token_malformed: Object.freeze({
        status: 401,
        message: 'Token is malformed',
    }),
    // Our dependency failing, not the caller's token: not a 401, so a client
    // does not discard a good session during a JWKS outage.
    jwks_unavailable: Object.freeze({
        status: 503,
        message: 'Token verification keys are unavailable',
    }),
    multi_org_unsupported: Object.freeze({
        status: 403,
        message:
            'This user already belongs to a different organization. ' +
            'Membership in more than one organization is not supported yet (ADR-056 §3.6).',
    }),
    jwt_config_invalid: Object.freeze({
        status: 500,
        message: 'Adopter JWT authentication is misconfigured',
    }),
});

/**
 * @param {keyof typeof ADOPTER_JWT_ERRORS} code
 * @returns {Boom.Boom} with `data.reason` set to `code`
 */
function fail(code) {
    const { status, message } = ADOPTER_JWT_ERRORS[code];
    return new Boom.Boom(message, {
        statusCode: status,
        data: { reason: code },
    });
}

module.exports = { ADOPTER_JWT_ERRORS, fail };
