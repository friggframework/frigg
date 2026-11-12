/**
 * Schema identifiers (ADR-051, "Hosted schemas" amendment).
 *
 * Every Frigg JSON Schema has the `$id`
 *   https://friggframework.org/schemas/<name>/v<major>.<minor>.json
 * and friggframework.org serves the file at exactly that URL. The `$id` is a
 * name, not a location the runtime reads: validation always resolves it from
 * this package and never fetches it.
 */

const SCHEMA_BASE_URL = 'https://friggframework.org/';

const SCHEMA_ID_PATTERN =
    /^https:\/\/friggframework\.org\/schemas\/([a-z0-9]+(?:-[a-z0-9]+)*)\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.json$/;

/**
 * Unversioned ids the schemas carried before 2.0.1. They never resolved over
 * HTTP, but code may pass them to `validate()`/`getSchema()` or Ajv, so the
 * package still registers them as aliases of the current schema.
 *
 * @deprecated Remove in the release after 2.0.1.
 */
const LEGACY_SCHEMA_IDS = Object.freeze({
    'api-authorization': ['https://friggframework.org/schemas/api-authorization.json'],
    'api-credentials': ['https://friggframework.org/schemas/api-credentials.json'],
    'api-entities': ['https://friggframework.org/schemas/api-entities.json'],
    'api-proxy': ['https://friggframework.org/schemas/api-proxy.json'],
    'api-module-definition': ['https://schemas.friggframework.org/api-module-definition.schema.json'],
    'app-definition': ['https://schemas.friggframework.org/app-definition.schema.json'],
    'core-models': ['https://schemas.friggframework.org/core-models.schema.json'],
    'environment-config': ['https://schemas.friggframework.org/environment-config.schema.json'],
    'integration-definition': ['https://schemas.friggframework.org/integration-definition.schema.json'],
    'serverless-config': ['https://schemas.friggframework.org/serverless-config.schema.json'],
});

/**
 * Parse a schema `$id`.
 * @param {string} id
 * @returns {{ name: string, version: string, hostedPath: string } | null}
 *   `hostedPath` is the path under the website root (`schemas/<name>/v1.0.json`).
 */
function parseSchemaId(id) {
    const match = typeof id === 'string' ? SCHEMA_ID_PATTERN.exec(id) : null;
    if (!match) return null;
    const [, name, major, minor] = match;
    const version = `${major}.${minor}`;
    return { name, version, hostedPath: `schemas/${name}/v${version}.json` };
}

/**
 * Register a schema with Ajv under its file name, its `$id`, and its legacy ids.
 * @param {import('ajv').default} ajv
 * @param {object} schema - parsed schema (its `$id` registers automatically)
 * @param {string} name - file name without `.schema.json`
 */
function addSchemaWithAliases(ajv, schema, name) {
    ajv.addSchema(schema, name);
    for (const legacyId of LEGACY_SCHEMA_IDS[name] || []) {
        ajv.addSchema({ ...schema, $id: legacyId });
    }
}

module.exports = {
    SCHEMA_BASE_URL,
    SCHEMA_ID_PATTERN,
    LEGACY_SCHEMA_IDS,
    parseSchemaId,
    addSchemaWithAliases,
};
