const { getFunctionEntryPoints, getFunctionEntryPointsDir } = require('../lib/get-function-entry-points');
const path = require('path');
const fs = require('fs');

describe('getFunctionEntryPoints', () => {
    test('returns all 9 standard function files', () => {
        const entryPoints = getFunctionEntryPoints({ name: 'test' });
        const filenames = Object.keys(entryPoints);

        expect(filenames).toHaveLength(9);
        expect(filenames).toContain('auth.js');
        expect(filenames).toContain('user.js');
        expect(filenames).toContain('health.js');
        expect(filenames).toContain('admin.js');
        expect(filenames).toContain('docs.js');
        expect(filenames).toContain('integration-routes.js');
        expect(filenames).toContain('webhooks.js');
        expect(filenames).toContain('worker-background.js');
        expect(filenames).toContain('scheduled-sync.js');
    });

    test('returns non-empty file contents', () => {
        const entryPoints = getFunctionEntryPoints({ name: 'test' });

        for (const [filename, content] of Object.entries(entryPoints)) {
            expect(content.length).toBeGreaterThan(0);
            expect(content).toContain('module.exports');
        }
    });

    test('auth.js references the auth router', () => {
        const entryPoints = getFunctionEntryPoints({ name: 'test' });

        expect(entryPoints['auth.js']).toContain('auth');
        expect(entryPoints['auth.js']).toContain('handler');
    });
});

describe('getFunctionEntryPointsDir', () => {
    test('returns a valid directory path', () => {
        const dir = getFunctionEntryPointsDir();

        expect(fs.existsSync(dir)).toBe(true);
        expect(fs.statSync(dir).isDirectory()).toBe(true);
    });

    test('directory contains all function files', () => {
        const dir = getFunctionEntryPointsDir();
        const files = fs.readdirSync(dir);

        expect(files).toContain('auth.js');
        expect(files).toContain('worker-background.js');
        expect(files).toContain('scheduled-sync.js');
    });
});
