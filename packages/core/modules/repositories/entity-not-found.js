/**
 * The error `findEntityById` throws for an id with no row, and the one
 * predicate that recognises it (as integration-not-found.js does for
 * integrations). The adapters build the error here and use cases match it
 * here, so a missing entity can be told from any other failure without
 * widening a regex.
 *
 * Why it matters: a use case that answers 404 for another tenant's entity must
 * answer the same 404 for an id that does not exist. Otherwise the status code
 * says which ids exist (ADR-052 §3, ADR-056 §3.6).
 */
const MESSAGE = /^Entity .+ not found$/;

const entityNotFoundError = (id) => new Error(`Entity ${id} not found`);

const isEntityNotFound = (error) => MESSAGE.test(error?.message || '');

module.exports = { entityNotFoundError, isEntityNotFound };
