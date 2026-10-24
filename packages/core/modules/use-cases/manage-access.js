const Boom = require('@hapi/boom');
const { ACCESS } = require('../scope-resolution');

/**
 * The one check behind every "may this caller change or delete it" gate
 * (ADR-056 §3 permissions): the caller may use it but not manage it, so 403
 * `ORG_ADMIN_REQUIRED`. `access` comes from describeRecord (entities,
 * integrations) or scopePolicy.accessToOwnedBy (credentials).
 *
 * @param {string|null} access - ACCESS value
 * @param {string} subject - e.g. `entity 5`, for the message
 */
function assertCanManage(access, subject) {
    if (access !== ACCESS.MANAGE) {
        throw Boom.forbidden(`You may use ${subject} but not change or delete it`, {
            code: 'ORG_ADMIN_REQUIRED',
        });
    }
}

module.exports = { assertCanManage };
