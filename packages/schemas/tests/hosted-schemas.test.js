/**
 * Hosted schema identifiers (ADR-051, "Hosted schemas" amendment).
 *
 * - Every schema's `$id` is https://friggframework.org/schemas/<name>/v<x.y>.json.
 * - website/ serves each schema at exactly that URL, byte for byte.
 * - Validation resolves every `$id` (and every legacy id) from this package,
 *   without network access.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { SCHEMA_ID_PATTERN, parseSchemaId, LEGACY_SCHEMA_IDS } = require('../schema-ids');
const {
    planHostedSchemas,
    WEBSITE_ROOT,
} = require('../scripts/sync-hosted-schemas');

const SCHEMA_DIR = path.join(__dirname, '..', 'schemas');
const packageSchemaFiles = fs.readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.schema.json'));
const readSchema = file => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, file), 'utf8'));

function listFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
    });
}

function collectRefs(node, refs = []) {
    if (Array.isArray(node)) node.forEach(item => collectRefs(item, refs));
    else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
            if (key === '$ref' && typeof value === 'string') refs.push(value);
            else collectRefs(value, refs);
        }
    }
    return refs;
}

describe('schema ids', () => {
    test.each(packageSchemaFiles)('%s has a versioned friggframework.org $id named after the file', file => {
        const schema = readSchema(file);
        expect(schema.$id).toMatch(SCHEMA_ID_PATTERN);
        expect(parseSchemaId(schema.$id).name).toBe(file.replace('.schema.json', ''));
    });

    test('parseSchemaId maps an $id to its hosted path', () => {
        expect(parseSchemaId('https://friggframework.org/schemas/app-definition/v1.0.json')).toEqual({
            name: 'app-definition',
            version: '1.0',
            hostedPath: 'schemas/app-definition/v1.0.json',
        });
        expect(parseSchemaId('https://friggframework.org/schemas/app-definition.json')).toBeNull();
        expect(parseSchemaId('https://schemas.friggframework.org/app-definition/v1.0.json')).toBeNull();
        expect(parseSchemaId('https://friggframework.org/schemas/app-definition/v1.json')).toBeNull();
        expect(parseSchemaId('https://friggframework.org/schemas/App/v1.0.json')).toBeNull();
    });

    test('every legacy id belongs to a schema in the package', () => {
        const names = packageSchemaFiles.map(f => f.replace('.schema.json', ''));
        for (const name of Object.keys(LEGACY_SCHEMA_IDS)) expect(names).toContain(name);
    });
});

describe('hosted copies in website/schemas', () => {
    const plan = planHostedSchemas();

    test('the plan covers every package schema', () => {
        const sources = plan.map(entry => path.basename(entry.source));
        for (const file of packageSchemaFiles) expect(sources).toContain(file);
    });

    test.each(plan.map(entry => [entry.hostedPath, entry]))(
        'website/%s is an exact copy of its source (run `npm run sync:hosted` if not)',
        (hostedPath, entry) => {
            expect(fs.existsSync(entry.target)).toBe(true);
            expect(fs.readFileSync(entry.target, 'utf8')).toBe(entry.content);
            expect(`https://friggframework.org/${hostedPath}`).toBe(entry.id);
        }
    );

    test('every file in website/schemas is served at the URL its $id names', () => {
        const files = listFiles(path.join(WEBSITE_ROOT, 'schemas'));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const relative = path.relative(WEBSITE_ROOT, file).split(path.sep).join('/');
            const { $id } = JSON.parse(fs.readFileSync(file, 'utf8'));
            expect(parseSchemaId($id)).not.toBeNull();
            expect($id).toBe(`https://friggframework.org/${relative}`);
        }
    });

    test('website/_headers serves /schemas/* as JSON Schema with open CORS', () => {
        const headers = fs.readFileSync(path.join(WEBSITE_ROOT, '_headers'), 'utf8');
        const block = headers.split(/^\/schemas\/\*\s*$/m)[1];
        expect(block).toBeDefined();
        expect(block).toMatch(/^\s+Content-Type: application\/schema\+json/m);
        expect(block).toMatch(/^\s+Access-Control-Allow-Origin: \*$/m);
    });
});

describe('offline resolution', () => {
    let networkCalls;
    let restore;

    beforeEach(() => {
        networkCalls = [];
        const spies = [
            jest.spyOn(http, 'request'),
            jest.spyOn(http, 'get'),
            jest.spyOn(https, 'request'),
            jest.spyOn(https, 'get'),
        ];
        spies.forEach(spy =>
            spy.mockImplementation((...args) => {
                networkCalls.push(args[0]);
                throw new Error('network access during schema validation');
            })
        );
        const originalFetch = global.fetch;
        global.fetch = jest.fn(url => {
            networkCalls.push(url);
            throw new Error('network access during schema validation');
        });
        restore = () => {
            spies.forEach(spy => spy.mockRestore());
            global.fetch = originalFetch;
        };
    });

    afterEach(() => restore());

    test('every $id and legacy id resolves from the package', () => {
        jest.isolateModules(() => {
            const { ajv, getSchema, validate } = require('../index');
            for (const file of packageSchemaFiles) {
                const name = file.replace('.schema.json', '');
                const schema = readSchema(file);
                const ids = [schema.$id, ...(LEGACY_SCHEMA_IDS[name] || [])];
                for (const id of ids) {
                    expect(typeof ajv.getSchema(id)).toBe('function');
                    expect(getSchema(id)).toBe(getSchema(name));
                    expect(() => validate(id, {})).not.toThrow();
                }
            }
        });
        expect(networkCalls).toEqual([]);
    });

    test('the middleware registers the same ids', () => {
        jest.isolateModules(() => {
            const Ajv = require('ajv');
            const addSpy = jest.spyOn(Ajv.prototype, 'addSchema');
            require('../middleware/schema-validation');
            const registered = addSpy.mock.calls.map(([schema, key]) => key || schema.$id);
            addSpy.mockRestore();
            for (const name of ['api-entities', 'api-credentials', 'api-proxy', 'api-authorization']) {
                expect(registered).toContain(name);
                for (const legacyId of LEGACY_SCHEMA_IDS[name]) expect(registered).toContain(legacyId);
            }
        });
        expect(networkCalls).toEqual([]);
    });

    test('every non-local $ref points at a schema in the package', () => {
        const ids = new Set(packageSchemaFiles.map(file => readSchema(file).$id));
        for (const file of packageSchemaFiles) {
            for (const ref of collectRefs(readSchema(file))) {
                if (ref.startsWith('#')) continue;
                expect(ids).toContain(ref.split('#')[0]);
            }
        }
    });
});
