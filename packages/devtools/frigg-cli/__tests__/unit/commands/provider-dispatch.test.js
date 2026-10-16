/**
 * Provider dispatch (friggframework/frigg#545): appDefinition.provider
 * decides whether a CLI command runs the AWS/serverless path or the
 * provider plugin. Uses real temp projects and the real provider-netlify.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function writeProject(definitionSource) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-dispatch-'));
    const backend = path.join(dir, 'backend');
    fs.mkdirSync(backend);
    fs.writeFileSync(path.join(backend, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(path.join(backend, 'index.js'), `module.exports = { Definition: ${definitionSource} };`);
    return { dir, backend };
}

const NETLIFY_APP = `{
    name: 'dispatch-app',
    provider: 'netlify',
    integrations: [],
    database: { postgres: { enable: true } },
}`;

describe('provider-helper', () => {
    const { loadProviderForCli, loadCliAppDefinition, isNonAwsProject } = require('../../../utils/provider-helper');
    const dirs = [];
    afterAll(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

    it('returns null without an app definition', () => {
        expect(loadProviderForCli({ cwd: os.tmpdir() })).toBeNull();
        expect(loadCliAppDefinition('/nonexistent/path')).toBeNull();
        expect(isNonAwsProject({ cwd: os.tmpdir() })).toBe(false);
    });

    it('treats a missing provider as aws with no plugin', () => {
        const { dir, backend } = writeProject(`{ integrations: [] }`);
        dirs.push(dir);
        expect(loadProviderForCli({ cwd: backend })).toEqual(
            expect.objectContaining({ providerName: 'aws', provider: null, backendDir: backend })
        );
        expect(isNonAwsProject({ cwd: backend })).toBe(false);
    });

    it('resolves the netlify plugin from the project root or from backend/', () => {
        const { dir, backend } = writeProject(NETLIFY_APP);
        dirs.push(dir);
        for (const cwd of [dir, backend]) {
            const result = loadProviderForCli({ cwd });
            expect(result.providerName).toBe('netlify');
            expect(result.provider.name).toBe('netlify');
            expect(result.backendDir).toBe(backend);
        }
        expect(isNonAwsProject({ cwd: backend })).toBe(true);
    });
});

describe('buildWithProvider', () => {
    const { buildWithProvider } = require('../../../../infrastructure/provider-build');

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });
    afterEach(() => jest.restoreAllMocks());

    it('writes netlify.toml, functions and lib shims beside backend/, where their requires resolve', () => {
        const { dir, backend } = writeProject(NETLIFY_APP);
        try {
            const appDefinition = require(path.join(backend, 'index.js')).Definition;
            const { projectDir } = buildWithProvider({ appDefinition, backendDir: backend });

            expect(projectDir).toBe(dir);
            expect(fs.existsSync(path.join(dir, 'netlify.toml'))).toBe(true);
            const auth = fs.readFileSync(path.join(dir, 'netlify/functions/auth.js'), 'utf8');
            expect(auth).toContain("require('../../backend/index.js')");
            expect(fs.existsSync(path.join(dir, 'netlify/lib/create-netlify-app-handler.js'))).toBe(true);
            // Nothing is written into the backend directory itself.
            expect(fs.existsSync(path.join(backend, 'netlify'))).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('stops on validation errors and writes nothing', () => {
        const exit = jest.fn();
        const { dir, backend } = writeProject(`{ provider: 'netlify', integrations: [] }`);
        try {
            const appDefinition = require(path.join(backend, 'index.js')).Definition;
            const { written } = buildWithProvider({ appDefinition, backendDir: backend, exit });
            expect(exit).toHaveBeenCalledWith(1);
            expect(written).toEqual([]);
            expect(fs.existsSync(path.join(dir, 'netlify.toml'))).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe('frigg build dispatch', () => {
    beforeEach(() => {
        jest.resetModules();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
    });
    afterEach(() => {
        jest.restoreAllMocks();
        jest.dontMock('child_process');
    });

    it('builds a netlify app through the plugin, never through osls', async () => {
        const spawnSync = jest.fn(() => ({ status: 0 }));
        jest.doMock('child_process', () => ({ ...jest.requireActual('child_process'), spawnSync }));
        const { dir, backend } = writeProject(NETLIFY_APP);
        try {
            jest.spyOn(process, 'cwd').mockReturnValue(backend);
            await require('../../../build-command').buildCommand({});
            expect(spawnSync).not.toHaveBeenCalled();
            expect(fs.existsSync(path.join(dir, 'netlify/functions/worker-background.js'))).toBe(true);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('keeps the serverless path for an aws app', async () => {
        const spawnSync = jest.fn(() => ({ status: 0 }));
        jest.doMock('child_process', () => ({ ...jest.requireActual('child_process'), spawnSync }));
        const { dir, backend } = writeProject(`{ integrations: [] }`);
        try {
            jest.spyOn(process, 'cwd').mockReturnValue(backend);
            await require('../../../build-command').buildCommand({});
            expect(spawnSync).toHaveBeenCalledWith('osls', expect.any(Array), expect.any(Object));
            expect(fs.existsSync(path.join(dir, 'netlify'))).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
