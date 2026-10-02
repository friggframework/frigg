/**
 * `frigg init` validates the generated app with the same code path as
 * `frigg validate`, and never fails because of it (ADR-051).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@inquirer/prompts', () => ({}));

const BackendFirstHandler = require('../../init-command/backend-first-handler');

function writeApp(source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-init-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(path.join(dir, 'index.js'), source);
    return dir;
}

describe('frigg init validation', () => {
    const dirs = [];
    let log;

    beforeEach(() => {
        log = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
        for (const dir of dirs.splice(0))
            fs.rmSync(dir, { recursive: true, force: true });
    });

    it('validates the real generated definition, not a stand-in', async () => {
        const dir = writeApp(
            "module.exports = { Definition: { integrations: [], database: { postgres: { enable: true, management: 'create-new' } } } };"
        );
        dirs.push(dir);
        const handler = new BackendFirstHandler(dir, {});

        const ok = await handler.validateGeneratedAppDefinition(
            path.join(dir, 'index.js')
        );

        expect(ok).toBe(false);
        expect(log.mock.calls.flat().join('\n')).toContain(
            '/database/postgres/management'
        );
    });

    it('stays quiet before npm install, when index.js cannot load its dependencies', async () => {
        const dir = writeApp(
            "require('@friggframework/api-module-does-not-exist');"
        );
        dirs.push(dir);
        const handler = new BackendFirstHandler(dir, {});

        await expect(
            handler.validateGeneratedAppDefinition(path.join(dir, 'index.js'))
        ).resolves.toBe(true);
        expect(log).not.toHaveBeenCalled();
    });
});
