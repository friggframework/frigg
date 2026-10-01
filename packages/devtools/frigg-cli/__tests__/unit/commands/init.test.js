/**
 * Tests for `frigg init`
 *
 * - commander registration (flags exposed on `frigg init --help`)
 * - initCommand argument handling (name, --mode, legacy --template)
 * - BackendFirstHandler scaffolding with --yes into a temp directory
 * - scaffold dependency/version derivation
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');

const CLI_DIR = path.join(__dirname, '..', '..', '..');
const CLI_ENTRY = path.join(CLI_DIR, 'index.js');
const DEVTOOLS_PACKAGE_JSON = require('../../../../package.json');

const makeTmpDir = () =>
    fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-init-test-'));

/** Prompt implementations that fail the test if any prompt is shown. */
const failingPrompts = () => ({
    select: jest.fn(() => {
        throw new Error('select prompt should not be shown');
    }),
    confirm: jest.fn(() => {
        throw new Error('confirm prompt should not be shown');
    }),
    checkbox: jest.fn(() => {
        throw new Error('checkbox prompt should not be shown');
    }),
    Separator: class {},
});

describe('frigg init', () => {
    let consoleLogSpy;
    let consoleErrorSpy;
    let processExitSpy;

    beforeEach(() => {
        jest.resetModules();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.dontMock('../../../init-command/backend-first-handler');
    });

    const output = () =>
        [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls]
            .map((args) => args.join(' '))
            .join('\n');

    describe('commander registration', () => {
        it('exposes the init options on `frigg init --help`', () => {
            const result = spawnSync(
                process.execPath,
                [CLI_ENTRY, 'init', '--help'],
                {
                    cwd: os.tmpdir(),
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        FRIGG_CLI_SKIP_VERSION_CHECK: 'true',
                    },
                }
            );

            expect(result.status).toBe(0);
            const help = result.stdout;
            expect(help).toMatch(/init \[options\] \[projectName\]/);
            expect(help).toMatch(/-y, --yes/);
            expect(help).toMatch(/-m, --mode <mode>/);
            expect(help).toMatch(/--no-install/);
            expect(help).toMatch(/--no-git/);
            expect(help).toMatch(/-f, --force/);
            expect(help).toMatch(/-n, --name <name>/);
            // The demo frontend is gone.
            expect(help).not.toMatch(/frontend/);
        });
    });

    describe('initCommand', () => {
        const mockHandler = () => {
            const initialize = jest.fn().mockResolvedValue();
            const Handler = jest.fn().mockImplementation(() => ({
                initialize,
            }));
            jest.doMock(
                '../../../init-command/backend-first-handler',
                () => Handler
            );
            return { Handler, initialize };
        };

        it('runs the backend-first handler by default, not the legacy branch', async () => {
            const { Handler, initialize } = mockHandler();
            const { initCommand } = require('../../../init-command');
            const target = path.join(makeTmpDir(), 'my-app');

            await initCommand(target, { yes: true });

            expect(Handler).toHaveBeenCalledWith(
                target,
                expect.objectContaining({ yes: true })
            );
            expect(initialize).toHaveBeenCalled();
            expect(processExitSpy).not.toHaveBeenCalled();
            expect(output()).not.toMatch(/Legacy template/);
        });

        it('accepts the project name from --name', async () => {
            const { Handler } = mockHandler();
            const { initCommand } = require('../../../init-command');
            const target = path.join(makeTmpDir(), 'named-app');

            await initCommand(undefined, { name: target });

            expect(Handler).toHaveBeenCalledWith(target, expect.any(Object));
        });

        it('exits with a message when no project name is given', async () => {
            const { Handler } = mockHandler();
            const { initCommand } = require('../../../init-command');

            await initCommand(undefined, {});

            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(output()).toMatch(/Please specify a project name/);
            expect(Handler).not.toHaveBeenCalled();
        });

        it('rejects an invalid --mode before scaffolding', async () => {
            const { Handler } = mockHandler();
            const { initCommand } = require('../../../init-command');
            const target = path.join(makeTmpDir(), 'my-app');

            await initCommand(target, { mode: 'serverless' });

            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(output()).toMatch(
                /Invalid --mode "serverless". Expected one of: standalone, embedded/
            );
            expect(Handler).not.toHaveBeenCalled();
        });

        it('rejects the legacy --template option', async () => {
            const { Handler } = mockHandler();
            const { initCommand } = require('../../../init-command');

            await initCommand('my-app', { template: 'react' });

            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(output()).toMatch(/Legacy template system/);
            expect(Handler).not.toHaveBeenCalled();
        });
    });

    describe('BackendFirstHandler', () => {
        let tmpDir;

        beforeEach(() => {
            tmpDir = makeTmpDir();
        });

        afterEach(() => {
            fs.removeSync(tmpDir);
        });

        const createHandler = (target, options = {}) => {
            const BackendFirstHandler = require('../../../init-command/backend-first-handler');
            return new BackendFirstHandler(target, {
                yes: true,
                install: false,
                git: false,
                prompts: failingPrompts(),
                ...options,
            });
        };

        it('--yes scaffolds a standalone app without prompting', async () => {
            const target = path.join(tmpDir, 'demo-app');
            const handler = createHandler(target, { mode: 'standalone' });

            await handler.initialize();

            for (const file of [
                'index.js',
                'infrastructure.js',
                'package.json',
                'README.md',
                '.gitignore',
                '.env.example',
                '.env',
            ]) {
                expect(fs.existsSync(path.join(target, file))).toBe(true);
            }

            const indexJs = fs.readFileSync(
                path.join(target, 'index.js'),
                'utf8'
            );
            expect(indexJs).toContain("name: 'demo-app',");
            expect(indexJs).not.toContain("name: 'frigg-app'");

            const readme = fs.readFileSync(
                path.join(target, 'README.md'),
                'utf8'
            );
            expect(readme.startsWith('# demo-app\n')).toBe(true);

            const pkg = fs.readJsonSync(path.join(target, 'package.json'));
            expect(pkg.name).toBe('demo-app');
            expect(pkg.scripts).toEqual(
                expect.objectContaining({
                    start: 'frigg start',
                    build: 'frigg build',
                    deploy: 'frigg deploy',
                    test: expect.stringMatching(/^jest/),
                })
            );
            expect(JSON.stringify(pkg.scripts)).not.toMatch(
                /infrastructure\.js/
            );
            expect(Object.keys(pkg.dependencies)).toEqual(
                expect.arrayContaining([
                    '@friggframework/core',
                    '@prisma/client',
                    'prisma',
                ])
            );
            expect(Object.keys(pkg.devDependencies)).toEqual(
                expect.arrayContaining([
                    '@friggframework/devtools',
                    '@friggframework/serverless-plugin',
                    'osls',
                    'serverless-esbuild',
                    'serverless-offline',
                    'serverless-offline-sqs',
                    'serverless-dotenv-plugin',
                ])
            );
            expect(pkg.workspaces).toBeUndefined();
            expect(fs.existsSync(path.join(target, 'frontend'))).toBe(false);
            expect(handler.prompts.select).not.toHaveBeenCalled();
            expect(handler.prompts.confirm).not.toHaveBeenCalled();
        });

        it('produces a Definition that loads and passes schema validation', async () => {
            const target = path.join(tmpDir, 'valid-app');
            await createHandler(target).initialize();

            const { Definition } = require(path.join(target, 'index.js'));
            const {
                validateAppDefinition,
            } = require('@friggframework/schemas');

            expect(Definition.name).toBe('valid-app');
            expect(validateAppDefinition(Definition).valid).toBe(true);
        });

        it('uses defaults when stdin is not a TTY even without --yes', () => {
            const BackendFirstHandler = require('../../../init-command/backend-first-handler');
            const original = process.stdin.isTTY;
            try {
                process.stdin.isTTY = false;
                expect(new BackendFirstHandler(tmpDir, {}).interactive).toBe(
                    false
                );
                process.stdin.isTTY = true;
                expect(new BackendFirstHandler(tmpDir, {}).interactive).toBe(
                    true
                );
                expect(
                    new BackendFirstHandler(tmpDir, { yes: true }).interactive
                ).toBe(false);
            } finally {
                process.stdin.isTTY = original;
            }
        });

        it('rejects an invalid mode', async () => {
            const handler = createHandler(path.join(tmpDir, 'x'), {
                mode: 'bogus',
            });
            await expect(handler.selectDeploymentMode()).rejects.toThrow(
                /Invalid --mode "bogus"/
            );
        });

        it('checks for a non-empty directory before prompting', async () => {
            const target = path.join(tmpDir, 'existing');
            fs.outputFileSync(path.join(target, 'server.js'), '// app');
            const handler = createHandler(target, {
                yes: false,
                interactive: true,
                mode: 'standalone',
            });

            await expect(handler.initialize()).rejects.toThrow(
                'Directory not empty'
            );
            expect(handler.prompts.select).not.toHaveBeenCalled();
            expect(handler.prompts.confirm).not.toHaveBeenCalled();
        });

        it('keeps an existing README.md unless --force', async () => {
            const target = path.join(tmpDir, 'with-readme');
            fs.outputFileSync(path.join(target, 'README.md'), 'mine');

            await createHandler(target).initialize();
            expect(
                fs.readFileSync(path.join(target, 'README.md'), 'utf8')
            ).toBe('mine');

            const forced = path.join(tmpDir, 'with-readme-forced');
            fs.outputFileSync(path.join(forced, 'README.md'), 'mine');
            await createHandler(forced, { force: true }).initialize();
            expect(
                fs.readFileSync(path.join(forced, 'README.md'), 'utf8')
            ).toMatch(/^# with-readme-forced/);
        });

        it('scaffolds embedded mode into frigg-integration/ of an existing project', async () => {
            const target = path.join(tmpDir, 'existing-app');
            fs.outputFileSync(path.join(target, 'server.js'), '// app');

            await createHandler(target, { mode: 'embedded' }).initialize();

            const dir = path.join(target, 'frigg-integration');
            const pkg = fs.readJsonSync(path.join(dir, 'package.json'));
            expect(pkg.name).toBe('existing-app-frigg-integration');
            expect(pkg.scripts.start).toBe('frigg start');
            expect(pkg.dependencies['@friggframework/core']).toBeDefined();
            expect(fs.existsSync(path.join(dir, 'infrastructure.js'))).toBe(
                true
            );
            expect(
                fs.readFileSync(path.join(target, 'server.js'), 'utf8')
            ).toBe('// app');
        });

        it('turns selected API modules into `frigg install` next steps without editing the app', async () => {
            jest.doMock('../../../utils/npm-registry', () => ({
                getModulesByType: jest.fn().mockResolvedValue({
                    CRM: [
                        {
                            name: '@friggframework/api-module-hubspot',
                            integrationName: 'HubSpot',
                            description: 'CRM',
                        },
                    ],
                }),
            }));
            const answers = {
                'What are you building with Frigg?': 'exploring',
                'Which cloud provider will you use?': 'aws',
            };
            const prompts = {
                select: jest.fn(async ({ message }) => answers[message]),
                confirm: jest.fn(async ({ message }) =>
                    message.startsWith('Would you like to pick API modules')
                ),
                checkbox: jest.fn(async () => ['hubspot']),
                Separator: class {},
            };
            const target = path.join(tmpDir, 'with-modules');
            const handler = createHandler(target, {
                yes: false,
                interactive: true,
                mode: 'standalone',
                prompts,
            });

            await handler.initialize();

            const pkg = fs.readJsonSync(path.join(target, 'package.json'));
            expect(
                Object.keys(pkg.dependencies).filter((d) =>
                    d.includes('api-module')
                )
            ).toEqual([]);
            const indexJs = fs.readFileSync(
                path.join(target, 'index.js'),
                'utf8'
            );
            expect(indexJs).not.toMatch(
                /HubspotIntegration|src\/integrations\/Hub/
            );
            expect(output()).toMatch(/npx frigg install hubspot/);
        });
    });

    describe('scaffold dependencies', () => {
        const {
            getFriggVersionRange,
            getScaffoldDependencies,
        } = require('../../../init-command/scaffold-dependencies');

        it.each([
            ['2.0.0-next.115', '2.0.0-next.115'],
            ['2.0.0--canary.639.abc1234.0', '2.0.0--canary.639.abc1234.0'],
            ['2.0.1', '^2.0.1'],
            ['2.3.4', '^2.3.4'],
            // The deprecated core@2.0.0 must never be admitted.
            ['2.0.0', '^2.0.1'],
        ])(
            'derives the Frigg range for devtools %s as %s',
            (version, range) => {
                expect(getFriggVersionRange(version)).toBe(range);
            }
        );

        it('rejects an invalid version', () => {
            expect(() => getFriggVersionRange('not-a-version')).toThrow(
                /Invalid/
            );
        });

        it('reads third-party versions from devtools and Frigg ranges from its version', () => {
            const { dependencies, devDependencies } = getScaffoldDependencies();
            const friggRange = getFriggVersionRange(
                DEVTOOLS_PACKAGE_JSON.version
            );
            const devtoolsDeps = {
                ...DEVTOOLS_PACKAGE_JSON.dependencies,
                ...DEVTOOLS_PACKAGE_JSON.devDependencies,
            };

            expect(dependencies['@friggframework/core']).toBe(friggRange);
            expect(devDependencies['@friggframework/devtools']).toBe(
                friggRange
            );
            expect(devDependencies['@friggframework/serverless-plugin']).toBe(
                friggRange
            );
            for (const name of [
                'osls',
                'serverless-esbuild',
                'serverless-offline',
                'serverless-offline-sqs',
                'serverless-dotenv-plugin',
            ]) {
                expect(devDependencies[name]).toBe(devtoolsDeps[name]);
            }
        });

        it('never admits an osls whose CLI rejects plugin commands', () => {
            // osls 3.65.0 (what `^3.58.0` resolved to on Node 23) fails
            // `osls offline` with `Serverless command "offline" not found`.
            // 3.78.0 is the release `frigg start` was verified against.
            const semver = require('semver');
            const { devDependencies } = getScaffoldDependencies();
            for (const range of [
                devDependencies.osls,
                DEVTOOLS_PACKAGE_JSON.devDependencies.osls,
                require('../../../package.json').dependencies.osls,
            ]) {
                expect(
                    semver.gte(semver.minVersion(range), '3.78.0')
                ).toBe(true);
            }
        });

        it('covers every serverless plugin the composed definition loads', () => {
            const { devDependencies } = getScaffoldDependencies();
            const {
                createBaseDefinition,
            } = require('../../../../infrastructure/domains/shared/utilities/base-definition-factory');
            const originalArgv = process.argv;
            try {
                // Include the offline-only dotenv plugin.
                process.argv = [...originalArgv, 'offline'];
                const definition = createBaseDefinition(
                    { name: 'x' },
                    {},
                    {},
                    {}
                );
                for (const plugin of definition.plugins) {
                    expect(devDependencies[plugin]).toBeDefined();
                }
            } finally {
                process.argv = originalArgv;
            }
        });

        it('takes the Prisma versions from core', () => {
            const { dependencies } = getScaffoldDependencies({
                devtoolsPackageJson: DEVTOOLS_PACKAGE_JSON,
                corePackageJson: {
                    peerDependencies: {
                        '@prisma/client': '^9.9.9',
                        prisma: '^9.9.9',
                    },
                },
            });
            expect(dependencies['@prisma/client']).toBe('^9.9.9');
            expect(dependencies.prisma).toBe('^9.9.9');
        });
    });
});
