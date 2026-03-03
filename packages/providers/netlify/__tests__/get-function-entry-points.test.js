const { getFunctionEntryPoints, getFunctionEntryPointsDir, getLibEntryPoints } = require('../lib/get-function-entry-points');
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

describe('getLibEntryPoints', () => {
    test('returns re-export shims for all lib files referenced by functions', () => {
        const libEntryPoints = getLibEntryPoints({ name: 'test' });
        const filenames = Object.keys(libEntryPoints);

        // Functions reference these 3 lib files
        expect(filenames).toContain('create-netlify-app-handler.js');
        expect(filenames).toContain('create-netlify-handler.js');
        expect(filenames).toContain('scheduled-job-repository.js');
    });

    test('each shim re-exports from the provider package', () => {
        const libEntryPoints = getLibEntryPoints({ name: 'test' });

        for (const [filename, content] of Object.entries(libEntryPoints)) {
            const moduleName = filename.replace(/\.js$/, '');
            expect(content).toContain('@friggframework/provider-netlify/lib/');
            expect(content).toContain(moduleName);
            expect(content).toContain('module.exports');
        }
    });

    test('does not include build-time-only lib files', () => {
        const libEntryPoints = getLibEntryPoints({ name: 'test' });
        const filenames = Object.keys(libEntryPoints);

        // These are build-time only, not referenced by functions
        expect(filenames).not.toContain('deploy.js');
        expect(filenames).not.toContain('validate.js');
        expect(filenames).not.toContain('generate-netlify-config.js');
        expect(filenames).not.toContain('detect.js');
        expect(filenames).not.toContain('get-function-entry-points.js');
    });

    test('stays in sync with function entry points', () => {
        // If a function references a new lib file, getLibEntryPoints should pick it up
        const functionEntryPoints = getFunctionEntryPoints({ name: 'test' });
        const libEntryPoints = getLibEntryPoints({ name: 'test' });

        // Collect all ../lib/ references from functions
        const referencedLibs = new Set();
        const pattern = /require\(['"]\.\.\/lib\/([^'"]+)['"]\)/g;
        for (const content of Object.values(functionEntryPoints)) {
            let match;
            pattern.lastIndex = 0;
            while ((match = pattern.exec(content)) !== null) {
                const modulePath = match[1];
                const filename = modulePath.endsWith('.js') ? modulePath : `${modulePath}.js`;
                referencedLibs.add(filename);
            }
        }

        // Every referenced lib should have a shim
        for (const libFile of referencedLibs) {
            expect(Object.keys(libEntryPoints)).toContain(libFile);
        }

        // No extra shims beyond what's referenced
        expect(Object.keys(libEntryPoints).sort()).toEqual([...referencedLibs].sort());
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
