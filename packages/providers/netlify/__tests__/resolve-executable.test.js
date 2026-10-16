const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveExecutable } = require('../lib/resolve-executable');

describe('resolveExecutable', () => {
    let root;
    const makeFile = (dir, name, mode) => {
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, name);
        fs.writeFileSync(file, '#!/bin/sh\n');
        fs.chmodSync(file, mode);
        return file;
    };

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-exe-'));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('returns the absolute path of the first executable in an absolute PATH dir', () => {
        const a = path.join(root, 'a');
        const b = path.join(root, 'b');
        makeFile(b, 'netlify', 0o755);
        const expected = path.join(b, 'netlify');
        expect(resolveExecutable('netlify', { pathEnv: `${a}:${b}`, platform: 'linux' })).toBe(expected);
    });

    it('never searches a relative PATH entry (".", "", "node_modules/.bin")', () => {
        const cwd = process.cwd();
        try {
            process.chdir(root);
            makeFile(root, 'netlify', 0o755);
            makeFile(path.join(root, 'node_modules/.bin'), 'netlify', 0o755);
            expect(
                resolveExecutable('netlify', { pathEnv: '.::node_modules/.bin', platform: 'linux' })
            ).toBeNull();
        } finally {
            process.chdir(cwd);
        }
    });

    it('skips a file that is not executable, and directories', () => {
        const a = path.join(root, 'a');
        const b = path.join(root, 'b');
        makeFile(a, 'netlify', 0o644);
        fs.mkdirSync(path.join(b, 'netlify'), { recursive: true });
        expect(resolveExecutable('netlify', { pathEnv: `${a}:${b}`, platform: 'linux' })).toBeNull();
    });

    it('refuses a command that is already a path', () => {
        makeFile(root, 'netlify', 0o755);
        expect(resolveExecutable('./netlify', { pathEnv: root, platform: 'linux' })).toBeNull();
        expect(resolveExecutable(path.join(root, 'netlify'), { pathEnv: root, platform: 'linux' })).toBeNull();
    });
});

describe('teardown spawns the resolved netlify path, not a bare name', () => {
    afterEach(() => {
        jest.resetModules();
        jest.dontMock('child_process');
    });

    it('runs execFileSync with the absolute CLI path and no shell string', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teardown-'));
        const bin = path.join(root, 'bin');
        fs.mkdirSync(bin);
        fs.writeFileSync(path.join(bin, 'netlify'), '#!/bin/sh\n');
        fs.chmodSync(path.join(bin, 'netlify'), 0o755);
        const savedPath = process.env.PATH;
        process.env.PATH = `.:${bin}`;
        const execFileSync = jest.fn();
        jest.doMock('child_process', () => ({ execFileSync, spawn: jest.fn() }));
        jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const { teardown } = require('../lib/deploy');
            await teardown({}, { deleteSite: true, dir: root });
            expect(execFileSync).toHaveBeenCalledWith(
                path.join(bin, 'netlify'),
                ['sites:delete', '--force'],
                expect.objectContaining({ cwd: root })
            );
        } finally {
            process.env.PATH = savedPath;
            fs.rmSync(root, { recursive: true, force: true });
            console.log.mockRestore();
        }
    });
});
