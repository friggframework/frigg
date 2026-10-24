/**
 * The OpenAPI components must agree with the canonical JSON schemas in
 * packages/schemas: every field a schema requires exists in the component,
 * and every field the component requires exists in the schema. Runs in the
 * monorepo, where packages/schemas sits next to core.
 */
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMAS } = require('./components');

const schemasDir = path.resolve(__dirname, '../../../schemas/schemas');
const available = fs.existsSync(schemasDir);
const load = (file) => JSON.parse(fs.readFileSync(path.join(schemasDir, file), 'utf8')).definitions;

const PAIRS = [
    ['Entity', 'api-entities.schema.json', 'entity'],
    ['EntityType', 'api-entities.schema.json', 'entityType'],
    ['ListEntitiesResponse', 'api-entities.schema.json', 'listEntitiesResponse'],
    ['ListEntityTypesResponse', 'api-entities.schema.json', 'listEntityTypesResponse'],
    ['Credential', 'api-credentials.schema.json', 'credential'],
    ['ListCredentialsResponse', 'api-credentials.schema.json', 'listCredentialsResponse'],
    ['AuthorizationRequirements', 'api-authorization.schema.json', 'authorizationRequirements'],
    ['AuthorizeRequest', 'api-authorization.schema.json', 'authorizationRequest'],
    ['AuthorizeComplete', 'api-authorization.schema.json', 'authorizeComplete'],
    ['AuthorizePending', 'api-authorization.schema.json', 'authorizePending'],
    ['ProxyRequest', 'api-proxy.schema.json', 'proxyRequest'],
    ['ProxyResponse', 'api-proxy.schema.json', 'proxyResponse'],
    ['ProxyError', 'api-proxy.schema.json', 'proxyErrorResponse'],
];

(available ? describe : describe.skip)('OpenAPI components agree with packages/schemas', () => {
    it.each(PAIRS)('%s matches %s#%s', (component, file, definition) => {
        const schema = load(file)[definition];
        const ours = SCHEMAS[component];
        expect(schema).toBeDefined();

        const theirProps = Object.keys(schema.properties || {});
        const ourProps = Object.keys(ours.properties || {});
        const missingFromOurs = (schema.required || []).filter((f) => !ourProps.includes(f));
        const missingFromTheirs = (ours.required || []).filter((f) => !theirProps.includes(f));

        expect({ component, missingFromOurs, missingFromTheirs }).toEqual({
            component,
            missingFromOurs: [],
            missingFromTheirs: [],
        });
    });
});
