/**
 * Runs the generated Netlify functions end to end, the way Netlify loads
 * them: a project with backend/index.js and backend/node_modules, entry
 * points and lib shims written by getFunctionEntryPoints/getLibEntryPoints,
 * each function required by path and invoked with a Lambda-shaped event.
 *
 * What it pins: the preamble presets the app definition, so the functions
 * load the app through core's loadAppDefinition (no process.cwd() discovery)
 * and the Management API, its auth and its error envelope behave as on the
 * AWS auth Lambda. The database connect is stubbed: nothing here needs one.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const corePath = path.dirname(require.resolve('@friggframework/core/package.json'));
const providerPath = path.resolve(__dirname, '..');

jest.doMock(path.join(corePath, 'database/prisma'), () => ({
    prisma: {},
    connectPrisma: jest.fn(async () => ({})),
    disconnectPrisma: jest.fn(async () => {}),
    getEncryptionConfig: () => ({ enabled: false }),
}));

const {
    getFunctionEntryPoints,
    getLibEntryPoints,
} = require('../lib/get-function-entry-points');

let projectDir;

function writeProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-netlify-'));
    const backend = path.join(dir, 'backend');
    fs.mkdirSync(path.join(backend, 'node_modules', '@friggframework'), { recursive: true });
    fs.symlinkSync(corePath, path.join(backend, 'node_modules/@friggframework/core'), 'dir');
    fs.symlinkSync(providerPath, path.join(backend, 'node_modules/@friggframework/provider-netlify'), 'dir');
    fs.writeFileSync(path.join(backend, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(
        path.join(backend, 'index.js'),
        `
const express = require(${JSON.stringify(require.resolve('express'))});
module.exports = {
    Definition: {
        name: 'netlify-smoke',
        provider: 'netlify',
        integrations: [],
        database: { postgres: { enable: true } },
        user: { authModes: { friggToken: true, sharedSecret: true, adopterJwt: false } },
        managementApi: { v1: false },
        extensions: [{
            name: 'probe',
            routes: {
                path: '/api/admin/probe',
                handler: () => express.Router().get('/', (_req, res) => res.json({ probe: true })),
            },
        }],
    },
};
`
    );

    const appDefinition = require(path.join(backend, 'index.js')).Definition;
    for (const [dirName, files] of [
        ['functions', getFunctionEntryPoints(appDefinition)],
        ['lib', getLibEntryPoints(appDefinition)],
    ]) {
        const out = path.join(dir, 'netlify', dirName);
        fs.mkdirSync(out, { recursive: true });
        for (const [name, content] of Object.entries(files)) {
            fs.writeFileSync(path.join(out, name), content);
        }
    }
    return dir;
}

const event = (method, p, headers = {}) => ({
    httpMethod: method,
    path: p,
    headers,
    multiValueHeaders: {},
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: {},
});

const load = (name) => require(path.join(projectDir, 'netlify/functions', `${name}.js`)).handler;

describe('generated Netlify functions at runtime', () => {
    const savedKey = process.env.ADMIN_API_KEY;

    beforeAll(() => {
        projectDir = writeProject();
        process.env.ADMIN_API_KEY = 'smoke-admin-key';
    });

    afterAll(() => {
        fs.rmSync(projectDir, { recursive: true, force: true });
        if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = savedKey;
    });

    it('every generated function loads', () => {
        for (const name of Object.keys(getFunctionEntryPoints({}))) {
            expect(typeof load(name.replace(/\.js$/, ''))).toBe('function');
        }
    });

    it('auth: the v2 Management API rejects an unauthenticated call in the v2 envelope', async () => {
        const res = await load('auth')(event('GET', '/api/v2/integrations'), {});
        expect(res.statusCode).toBe(401);
        expect(res.headers['frigg-api-version'] || res.headers['Frigg-Api-Version']).toBe('2');
        expect(JSON.parse(res.body)).toEqual({
            error: expect.objectContaining({ code: expect.any(String), message: expect.any(String) }),
        });
    });

    it('auth: the preset definition is the one in force (managementApi.v1: false answers 410)', async () => {
        const res = await load('auth')(event('GET', '/api/integrations'), {});
        expect(res.statusCode).toBe(410);
        expect(JSON.parse(res.body).error.code).toBe('API_VERSION_DISABLED');
    });

    it('admin: extension routes sit behind the admin API key', async () => {
        const admin = load('admin');
        expect((await admin(event('GET', '/api/admin/probe'), {})).statusCode).toBe(401);

        const ok = await admin(
            event('GET', '/api/admin/probe', { 'x-frigg-admin-api-key': 'smoke-admin-key' }),
            {}
        );
        expect(ok.statusCode).toBe(200);
        expect(JSON.parse(ok.body)).toEqual({ probe: true });

        expect((await admin(event('GET', '/api/admin/users'), {})).statusCode).toBe(404);
    });

    it('health and docs serve the Management API discovery routes', async () => {
        const meta = await load('health')(event('GET', '/api/meta'), {});
        expect(meta.statusCode).toBe(200);

        const docs = await load('docs')(event('GET', '/api/docs'), {});
        expect(docs.statusCode).toBe(302);
        expect(docs.headers.location).toBe('/api/meta/openapi/v2.json');
    });

    it('every generated file requires core and provider-netlify through the backend only', () => {
        for (const dirName of ['functions', 'lib']) {
            const dir = path.join(projectDir, 'netlify', dirName);
            for (const file of fs.readdirSync(dir)) {
                const content = fs.readFileSync(path.join(dir, file), 'utf8');
                const specifiers = [...content.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
                for (const spec of specifiers) {
                    expect(
                        spec.startsWith('../lib/') ||
                            spec.startsWith('../../backend/')
                    ).toBe(true);
                }
            }
        }
    });
});
