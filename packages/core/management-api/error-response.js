const Boom = require('@hapi/boom');

/**
 * Error responses for the HTTP boundary (handlers/app-handler-helpers.js).
 *
 * - v1 and other unversioned routes keep their historical body:
 *   `{ error: message }` for 4xx, `{ error: 'Internal Server Error' }` for 5xx.
 * - Management API v2 and /api/meta answer `{ error: { code, message, details? } }`
 *   and carry `Frigg-API-Version: 2` even when the error happened before any
 *   v2 router ran (for example a body-parser failure).
 */

const API_VERSION_HEADER = 'Frigg-API-Version';

const CODE_BY_STATUS = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    405: 'METHOD_NOT_ALLOWED',
    409: 'CONFLICT',
    410: 'GONE',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    501: 'NOT_IMPLEMENTED',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
};

// body-parser (via http-errors) tags its failures with `type`.
const CODE_BY_BODY_PARSER_TYPE = {
    'entity.parse.failed': 'INVALID_JSON',
    'entity.too.large': 'PAYLOAD_TOO_LARGE',
    'encoding.unsupported': 'UNSUPPORTED_MEDIA_TYPE',
    'charset.unsupported': 'UNSUPPORTED_MEDIA_TYPE',
    'request.aborted': 'BAD_REQUEST',
};

/** True for paths that use the v2 error contract. */
function isVersionedManagementApiPath(path = '') {
    return (
        path === '/api/v2' ||
        path.startsWith('/api/v2/') ||
        path === '/api/meta' ||
        path.startsWith('/api/meta/')
    );
}

/**
 * The HTTP status for an error. Boom errors carry theirs. Other errors are
 * trusted only when they declare a client error as safe to expose, as
 * http-errors (and so body-parser) does; anything else is a 500, so an
 * upstream FetchError's `statusCode` is never mistaken for ours.
 */
function resolveStatusCode(err) {
    if (err?.isBoom) return err.output.statusCode;
    const status = err?.status ?? err?.statusCode;
    if (
        err?.expose === true &&
        Number.isInteger(status) &&
        status >= 400 &&
        status < 500
    ) {
        return status;
    }
    return 500;
}

/** Normalises any thrown value into a Boom error with the right status. */
function toBoom(err) {
    if (err?.isBoom) return err;
    const error = err instanceof Error ? err : new Error(String(err));
    return Boom.boomify(error, { statusCode: resolveStatusCode(err) });
}

/** The v2 error body for a Boom error. */
function toV2ErrorBody(boomError) {
    const statusCode = boomError.output.statusCode;
    const data =
        boomError.data && typeof boomError.data === 'object'
            ? boomError.data
            : {};
    const exposeServerError = statusCode >= 500 && data.expose === true;

    const code =
        (typeof data.code === 'string' && data.code) ||
        CODE_BY_BODY_PARSER_TYPE[boomError.type] ||
        CODE_BY_STATUS[statusCode] ||
        (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');

    const message =
        statusCode < 500 || exposeServerError
            ? boomError.message
            : 'Internal Server Error';

    const body = { code, message };
    if (
        data.details !== undefined &&
        (statusCode < 500 || exposeServerError)
    ) {
        body.details = data.details;
    }
    return { error: body };
}

module.exports = {
    API_VERSION_HEADER,
    isVersionedManagementApiPath,
    resolveStatusCode,
    toBoom,
    toV2ErrorBody,
};
