/**
 * Repo Detection Unit Tests
 *
 * Tests the Frigg repository detection algorithm to ensure
 * it correctly identifies Frigg apps in various directory structures.
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const {
    isFriggRepository,
    discoverFriggRepositories,
    getCurrentRepositoryInfo,
    detectFramework,
} = require('../repo-detection');

// Create a temp directory for tests
let testDir;

beforeAll(async () => {
    testDir = path.join(os.tmpdir(), 'frigg-repo-detection-tests');
    await fs.ensureDir(testDir);
});

afterAll(async () => {
    await fs.remove(testDir);
});

beforeEach(async () => {
    // Clean test directory before each test
    await fs.emptyDir(testDir);
});

describe('isFriggRepository', () => {
    describe('positive detection', () => {
        it('detects a root-level Frigg app with index.js', async () => {
            const appDir = path.join(testDir, 'my-frigg-app');
            await fs.ensureDir(appDir);

            // Create package.json with @friggframework/core
            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'my-frigg-app',
                version: '1.0.0',
                dependencies: {
                    '@friggframework/core': '2.0.0-next.58',
                },
            });

            // Create index.js (required for detection)
            await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(true);
            expect(result.repoInfo.name).toBe('my-frigg-app');
            expect(result.repoInfo.path).toBe(appDir);
            expect(result.repoInfo.friggDependencies).toContain('@friggframework/core');
        });

        it('detects a Frigg app with backend directory structure', async () => {
            const appDir = path.join(testDir, 'workspace-frigg-app');
            const backendDir = path.join(appDir, 'backend');
            await fs.ensureDir(backendDir);

            // Root package.json without core (workspace pattern)
            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'workspace-frigg-app',
                version: '1.0.0',
                workspaces: ['backend', 'frontend'],
            });

            // Backend package.json with core dependency
            await fs.writeJSON(path.join(backendDir, 'package.json'), {
                name: 'workspace-frigg-app-backend',
                version: '1.0.0',
                dependencies: {
                    '@friggframework/core': '^2.0.0',
                },
            });

            // Backend index.js
            await fs.writeFile(path.join(backendDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(true);
            expect(result.repoInfo.name).toBe('workspace-frigg-app');
            // Path should point to backend when using workspace structure
            expect(result.repoInfo.path).toBe(backendDir);
        });

        it('detects a Frigg app with backend/serverless.yml', async () => {
            const appDir = path.join(testDir, 'serverless-frigg-app');
            const backendDir = path.join(appDir, 'backend');
            await fs.ensureDir(backendDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'serverless-frigg-app',
                dependencies: {
                    '@friggframework/core': '2.0.0-next.58',
                },
            });

            // serverless.yml instead of index.js
            await fs.writeFile(path.join(backendDir, 'serverless.yml'), 'service: my-frigg-app');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(true);
            expect(result.repoInfo.path).toBe(backendDir);
        });

        it('detects various version formats for @friggframework/core', async () => {
            const versionFormats = [
                '2.0.0-next.58',
                '^2.0.0',
                '~2.0.0',
                '2.0.0',
                'next',
            ];

            for (const version of versionFormats) {
                const appDir = path.join(testDir, `version-test-${version.replace(/[^a-z0-9]/gi, '-')}`);
                await fs.ensureDir(appDir);

                await fs.writeJSON(path.join(appDir, 'package.json'), {
                    name: 'version-test-app',
                    dependencies: {
                        '@friggframework/core': version,
                    },
                });

                await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

                const result = await isFriggRepository(appDir);
                expect(result.isFriggRepo).toBe(true);
            }
        });

        it('includes additional frigg dependencies in repoInfo', async () => {
            const appDir = path.join(testDir, 'multi-dep-app');
            await fs.ensureDir(appDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'multi-dep-app',
                dependencies: {
                    '@friggframework/core': '2.0.0-next.58',
                },
                devDependencies: {
                    '@friggframework/devtools': '2.0.0-next.58',
                    '@friggframework/test': '2.0.0-next.58',
                },
            });

            await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(true);
            expect(result.repoInfo.friggDependencies).toContain('@friggframework/core');
            expect(result.repoInfo.friggDependencies).toContain('@friggframework/devtools');
            expect(result.repoInfo.friggDependencies).toContain('@friggframework/test');
        });
    });

    describe('negative detection', () => {
        it('rejects directories without package.json', async () => {
            const appDir = path.join(testDir, 'no-package-json');
            await fs.ensureDir(appDir);
            await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(false);
        });

        it('rejects directories without @friggframework/core', async () => {
            const appDir = path.join(testDir, 'no-frigg-core');
            await fs.ensureDir(appDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'no-frigg-core',
                dependencies: {
                    express: '^4.0.0',
                },
            });

            await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(false);
        });

        it('rejects @friggframework/* packages themselves', async () => {
            const appDir = path.join(testDir, 'framework-package');
            await fs.ensureDir(appDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: '@friggframework/core',
                version: '2.0.0',
                dependencies: {},
            });

            await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(false);
        });

        it('rejects directories with only devDependency on core (without app structure)', async () => {
            const appDir = path.join(testDir, 'only-dev-dep');
            await fs.ensureDir(appDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'test-project',
                devDependencies: {
                    '@friggframework/core': '2.0.0-next.58',
                },
            });

            // No index.js or backend/

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(false);
        });

        it('rejects v1.x versions of @friggframework/core', async () => {
            const appDir = path.join(testDir, 'v1-app');
            await fs.ensureDir(appDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'v1-app',
                dependencies: {
                    '@friggframework/core': '^1.5.0',
                },
            });

            await fs.writeFile(path.join(appDir, 'index.js'), 'module.exports = {};');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(false);
        });
    });

    describe('app structure detection', () => {
        it('detects hasBackend correctly', async () => {
            const appDir = path.join(testDir, 'has-backend');
            const backendDir = path.join(appDir, 'backend');
            await fs.ensureDir(backendDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'has-backend',
                dependencies: { '@friggframework/core': '^2.0.0' },
            });

            await fs.writeFile(path.join(appDir, 'index.js'), '');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(true);
            expect(result.repoInfo.hasBackend).toBe(true);
        });

        it('detects frigg scripts in package.json', async () => {
            const appDir = path.join(testDir, 'has-frigg-scripts');
            await fs.ensureDir(appDir);

            await fs.writeJSON(path.join(appDir, 'package.json'), {
                name: 'has-frigg-scripts',
                dependencies: { '@friggframework/core': '^2.0.0' },
                scripts: {
                    'frigg:start': 'frigg start',
                    'frigg:deploy': 'frigg deploy',
                },
            });

            await fs.writeFile(path.join(appDir, 'index.js'), '');

            const result = await isFriggRepository(appDir);

            expect(result.isFriggRepo).toBe(true);
            expect(result.repoInfo.hasFriggScripts).toBe(true);
        });
    });
});

describe('discoverFriggRepositories', () => {
    it('discovers repos within search paths', async () => {
        // Create a Frigg app in test directory
        const appDir = path.join(testDir, 'discoverable-app');
        await fs.ensureDir(appDir);

        await fs.writeJSON(path.join(appDir, 'package.json'), {
            name: 'discoverable-app',
            dependencies: { '@friggframework/core': '^2.0.0' },
        });

        await fs.writeFile(path.join(appDir, 'index.js'), '');

        const repos = await discoverFriggRepositories({
            searchPaths: [testDir],
            maxDepth: 2,
        });

        expect(repos.length).toBe(1);
        expect(repos[0].name).toBe('discoverable-app');
    });

    it('discovers repos at multiple depth levels', async () => {
        // Create nested Frigg apps
        const level1 = path.join(testDir, 'org');
        const level2 = path.join(level1, 'apps');
        const appDir = path.join(level2, 'nested-app');
        await fs.ensureDir(appDir);

        await fs.writeJSON(path.join(appDir, 'package.json'), {
            name: 'nested-app',
            dependencies: { '@friggframework/core': '^2.0.0' },
        });

        await fs.writeFile(path.join(appDir, 'index.js'), '');

        const repos = await discoverFriggRepositories({
            searchPaths: [testDir],
            maxDepth: 4,
        });

        expect(repos.length).toBe(1);
        expect(repos[0].name).toBe('nested-app');
    });

    it('excludes node_modules from search', async () => {
        const appDir = path.join(testDir, 'main-app');
        const nodeModulesApp = path.join(appDir, 'node_modules', 'some-frigg-app');
        await fs.ensureDir(nodeModulesApp);

        // Main app
        await fs.writeJSON(path.join(appDir, 'package.json'), {
            name: 'main-app',
            dependencies: { '@friggframework/core': '^2.0.0' },
        });
        await fs.writeFile(path.join(appDir, 'index.js'), '');

        // App in node_modules (should be excluded)
        await fs.writeJSON(path.join(nodeModulesApp, 'package.json'), {
            name: 'some-frigg-app',
            dependencies: { '@friggframework/core': '^2.0.0' },
        });
        await fs.writeFile(path.join(nodeModulesApp, 'index.js'), '');

        const repos = await discoverFriggRepositories({
            searchPaths: [testDir],
            maxDepth: 4,
        });

        expect(repos.length).toBe(1);
        expect(repos[0].name).toBe('main-app');
    });

    it('returns unique repositories (no duplicates)', async () => {
        const appDir = path.join(testDir, 'unique-app');
        await fs.ensureDir(appDir);

        await fs.writeJSON(path.join(appDir, 'package.json'), {
            name: 'unique-app',
            dependencies: { '@friggframework/core': '^2.0.0' },
        });

        await fs.writeFile(path.join(appDir, 'index.js'), '');

        // Search same directory twice
        const repos = await discoverFriggRepositories({
            searchPaths: [testDir, testDir],
            maxDepth: 2,
        });

        expect(repos.length).toBe(1);
    });
});

describe('detectFramework', () => {
    it('detects React from frontend/package.json', async () => {
        const appDir = path.join(testDir, 'react-app');
        const frontendDir = path.join(appDir, 'frontend');
        await fs.ensureDir(frontendDir);

        await fs.writeJSON(path.join(frontendDir, 'package.json'), {
            name: 'frontend',
            dependencies: { react: '^18.0.0' },
        });

        const framework = detectFramework(appDir, []);

        expect(framework).toBe('React');
    });

    it('detects Vue from frontend/package.json', async () => {
        const appDir = path.join(testDir, 'vue-app');
        const frontendDir = path.join(appDir, 'frontend');
        await fs.ensureDir(frontendDir);

        await fs.writeJSON(path.join(frontendDir, 'package.json'), {
            name: 'frontend',
            dependencies: { vue: '^3.0.0' },
        });

        const framework = detectFramework(appDir, []);

        expect(framework).toBe('Vue');
    });

    it('detects framework from named directories', async () => {
        const appDir = path.join(testDir, 'named-dir-app');
        const reactDir = path.join(appDir, 'react');
        await fs.ensureDir(reactDir);

        const framework = detectFramework(appDir, ['react']);

        expect(framework).toBe('React');
    });

    it('returns Unknown when no framework detected', async () => {
        const appDir = path.join(testDir, 'unknown-framework');
        await fs.ensureDir(appDir);

        const framework = detectFramework(appDir, []);

        expect(framework).toBe('Unknown');
    });
});
