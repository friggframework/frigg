/**
 * Entity scopes and ownership (ADR-056 §3), re-exported from the four files it
 * is split into:
 *
 *   scope-resolution  constants, scope resolution, ownership on create
 *   scope-config      reading and validating app-definition settings
 *   scope-visibility  who may see which stored row
 *   scope-policy      the object a use case asks
 */
module.exports = {
    ...require('./scope-resolution'),
    ...require('./scope-config'),
    ...require('./scope-visibility'),
    ...require('./scope-policy'),
};
