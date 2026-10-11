const Boom = require('@hapi/boom');

/** The JSON body as an object, or a 400 VALIDATION_ERROR. */
function objectBody(req) {
    const body = req.body;
    if (body === undefined || body === null || body === '') return {};
    if (typeof body !== 'object' || Array.isArray(body)) {
        throw Boom.badRequest('Request body must be a JSON object', {
            code: 'VALIDATION_ERROR',
        });
    }
    return body;
}

/** Fields that must be present (non-empty) in the body. */
function requireFields(body, fields) {
    const missing = fields.filter(
        (field) =>
            body[field] === undefined || body[field] === null || body[field] === ''
    );
    if (missing.length) {
        throw Boom.badRequest(
            `Missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
            { code: 'VALIDATION_ERROR', details: { missing } }
        );
    }
    return body;
}

/** A 1-based step number from a query or body value; 1 when absent. */
function parseStep(value) {
    if (value === undefined || value === null || value === '') return 1;
    const step = Number(value);
    if (!Number.isInteger(step) || step < 1) {
        throw Boom.badRequest('step must be a positive integer', {
            code: 'INVALID_STEP',
        });
    }
    return step;
}

/** An optional string query/body value. */
function optionalString(value, name) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
        throw Boom.badRequest(`${name} must be a string`, {
            code: 'VALIDATION_ERROR',
            details: { field: name },
        });
    }
    return value;
}

module.exports = { objectBody, requireFields, parseStep, optionalString };
