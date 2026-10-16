/**
 * The error `findIntegrationById` throws for an id with no row, and the one
 * predicate that recognises it. The adapters build the error here and the
 * use cases match it here, so the message is written once and a missing
 * integration can be told from any other failure without widening a regex.
 */
const MESSAGE = /^Integration with id .+ not found$/;

const integrationNotFoundError = (id) =>
    new Error(`Integration with id ${id} not found`);

const isIntegrationNotFound = (error) => MESSAGE.test(error?.message || '');

module.exports = { integrationNotFoundError, isIntegrationNotFound };
