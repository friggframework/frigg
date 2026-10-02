/**
 * Tests for `frigg install <module>`
 *
 * Runs the real install flow against apps on disk (temp directories):
 * - a `frigg init` app (index.js exports the Definition, no backend.js)
 * - an older app with a backend.js
 *
 * Only the external boundaries are mocked: npm search/registry and the
 * interactive picker (validate-package), `npm install` (simulated by writing
 * the module into the app's node_modules), env-var prompts, and git (except
 * in the dedicated commit tests).
 */

const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');

jest.mock('../../../install-command/install-package', () => ({
    ...jest.requireActual('../../../install-command/install-package'),
    installPackage: jest.fn(),
}));
jest.mock('../../../install-command/commit-changes', () => ({
    commitChanges: jest.fn(),
}));
jest.mock('../../../install-command/environment-variables', () => ({
    handleEnvVariables: jest.fn(),
}));
jest.mock('../../../install-command/validate-package', () => ({
    validatePackageExists: jest.fn(),
    searchAndSelectPackage: jest.fn(),
}));
jest.mock('@friggframework/core/utils', () => ({
    findNearestBackendPackageJson: jest.fn(),
    validateBackendPath: jest.fn((p) => {
        if (!p) throw new Error('Could not find a backend package.json file.');
    }),
}));

const { installPackage } = require('../../../install-command/install-package');
const { commitChanges } = require('../../../install-command/commit-changes');
const {
    handleEnvVariables,
} = require('../../../install-command/environment-variables');
const {
    validatePackageExists,
    searchAndSelectPackage,
} = require('../../../install-command/validate-package');
const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const { installCommand } = require('../../../install-command');

const TEMPLATE_DIR = path.join(__dirname, '../../../templates/backend');
const CORE_DIR = path.dirname(
    require.resolve('@friggframework/core/package.json')
);
const HUBSPOT = '@friggframework/api-module-hubspot';

const makeTmpDir = () =>
    fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-install-test-'))
    );

/** Write a minimal Frigg API module into <dir>/node_modules/<name>. */
function writeFakeModule(
    dir,
    name,
    { label, moduleName, withDefinition = true } = {}
) {
    const moduleDir = path.join(dir, 'node_modules', ...name.split('/'));
    fs.ensureDirSync(moduleDir);
    fs.writeJSONSync(path.join(moduleDir, 'package.json'), {
        name,
        version: '2.0.0-next.7',
        main: 'index.js',
    });
    fs.writeFileSync(
        path.join(moduleDir, 'index.js'),
        withDefinition
            ? `class Api {}
const Definition = {
    API: Api,
    getName: () => ${JSON.stringify(moduleName)},
    moduleName: ${JSON.stringify(moduleName)},
    requiredAuthMethods: {},
    env: {},
};
module.exports = {
    Api,
    Definition,
    Config: {
        name: ${JSON.stringify(moduleName)},
        label: ${JSON.stringify(label)},
        productUrl: 'https://example.com',
        logoUrl: 'https://example.com/logo.png',
        categories: ['CRM'],
        description: 'An example module',
    },
};
`
            : 'module.exports = { Api: class {} };\n'
    );
    return moduleDir;
}

/** A `frigg init` app: the real template's index.js plus a package.json. */
function makeScaffoldedApp({
    coreRange = '2.0.0-next.115',
    installedCoreVersion,
} = {}) {
    const dir = makeTmpDir();
    fs.copySync(
        path.join(TEMPLATE_DIR, 'index.js'),
        path.join(dir, 'index.js')
    );
    fs.writeJSONSync(path.join(dir, 'package.json'), {
        name: 'my-app',
        dependencies: { '@friggframework/core': coreRange },
    });
    fs.ensureDirSync(path.join(dir, 'node_modules', '@friggframework'));
    if (installedCoreVersion) {
        // A stand-in core with a chosen version.
        fs.outputJSONSync(
            path.join(dir, 'node_modules/@friggframework/core/package.json'),
            { name: '@friggframework/core', version: installedCoreVersion }
        );
        return dir;
    }
    // Let the generated files load the real core.
    fs.symlinkSync(
        CORE_DIR,
        path.join(dir, 'node_modules', '@friggframework', 'core')
    );
    return dir;
}

describe('CLI Command: install', () => {
    let processExitSpy;
    let consoleLogSpy;
    let consoleErrorSpy;
    let modules;

    const output = () =>
        [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls]
            .map((args) => args.join(' '))
            .join('\n');

    const useApp = (dir) => {
        findNearestBackendPackageJson.mockReturnValue(
            path.join(dir, 'package.json')
        );
        installPackage.mockImplementation((backendPath, spec) => {
            const name = spec.replace(/@(next|latest)$/, '');
            writeFakeModule(path.dirname(backendPath), name, modules[name]);
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        modules = {
            [HUBSPOT]: { label: 'HubSpot', moduleName: 'hubspot' },
            '@friggframework/api-module-google-drive': {
                label: 'Google Drive',
                moduleName: 'google-drive',
            },
        };
        searchAndSelectPackage.mockResolvedValue([HUBSPOT]);
        validatePackageExists.mockResolvedValue(true);
        handleEnvVariables.mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('in a `frigg init` app (index.js, no backend.js)', () => {
        it('installs the module from the app directory with the next tag for a 2.x prerelease app', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);

            await installCommand('hubspot');

            expect(processExitSpy).not.toHaveBeenCalled();
            expect(installPackage).toHaveBeenCalledWith(
                path.join(dir, 'package.json'),
                `${HUBSPOT}@next`
            );
            expect(handleEnvVariables).toHaveBeenCalledWith(
                path.join(dir, 'package.json'),
                path.join(
                    dir,
                    'node_modules',
                    '@friggframework',
                    'api-module-hubspot'
                )
            );
        });

        it('installs the default version for an app on a stable release', async () => {
            const dir = makeScaffoldedApp({
                coreRange: '^2.0.1',
                installedCoreVersion: '2.0.1',
            });
            useApp(dir);

            await installCommand('hubspot');

            expect(installPackage).toHaveBeenCalledWith(
                path.join(dir, 'package.json'),
                HUBSPOT
            );
        });

        it('creates src/integrations/<Label>Integration.js and registers it in index.js', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);

            await installCommand('hubspot');

            const integrationFile = path.join(
                dir,
                'src/integrations/HubSpotIntegration.js'
            );
            expect(fs.existsSync(integrationFile)).toBe(true);
            const index = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
            expect(index).toContain(
                "const HubSpotIntegration = require('./src/integrations/HubSpotIntegration');"
            );
            expect(index).toMatch(
                /integrations: \[\n {8}HubSpotIntegration,\n/
            );
            expect(output()).toMatch(/Added HubSpotIntegration to index\.js/);
        });

        it('produces an app definition that loads, validates, and exposes the integration', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);

            await installCommand('hubspot');

            const { Definition } = require(path.join(dir, 'index.js'));
            expect(Definition.integrations).toHaveLength(1);
            const [Integration] = Definition.integrations;
            const { IntegrationBase } = require('@friggframework/core');
            expect(Object.getPrototypeOf(Integration)).toBe(IntegrationBase);
            expect(Integration.Definition.name).toBe('hubspot');
            expect(
                Integration.Definition.modules.hubspot.definition.getName()
            ).toBe('hubspot');
            // The shape the Management API lists integrations with.
            expect(Integration.getOptionDetails()).toMatchObject({
                type: 'hubspot',
                display: {
                    name: 'HubSpot',
                    icon: 'https://example.com/logo.png',
                },
            });
        });

        it('turns a label into a valid identifier', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);
            searchAndSelectPackage.mockResolvedValue([
                '@friggframework/api-module-google-drive',
            ]);

            await installCommand('google-drive');

            const file = path.join(
                dir,
                'src/integrations/GoogleDriveIntegration.js'
            );
            const content = fs.readFileSync(file, 'utf8');
            expect(content).toContain(
                'class GoogleDriveIntegration extends IntegrationBase'
            );
            expect(content).toContain(
                'googleDrive: { definition: googleDriveModule.Definition }'
            );
            const { Definition } = require(path.join(dir, 'index.js'));
            expect(Definition.integrations[0].Definition.name).toBe(
                'google-drive'
            );
        });

        it('is idempotent: a second install keeps the file and does not register twice', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);
            await installCommand('hubspot');
            const file = path.join(
                dir,
                'src/integrations/HubSpotIntegration.js'
            );
            fs.appendFileSync(file, '// my edits\n');
            const indexAfterFirst = fs.readFileSync(
                path.join(dir, 'index.js'),
                'utf8'
            );

            await installCommand('hubspot');

            expect(fs.readFileSync(file, 'utf8')).toContain('// my edits');
            expect(fs.readFileSync(path.join(dir, 'index.js'), 'utf8')).toBe(
                indexAfterFirst
            );
            expect(output()).toMatch(
                /HubSpotIntegration is already in index\.js/
            );
        });

        it('prints the manual steps and leaves index.js alone when it cannot edit it safely', async () => {
            const dir = makeScaffoldedApp();
            const custom =
                "const integrations = require('./list');\nmodule.exports = { Definition: { integrations } };\n";
            fs.writeFileSync(path.join(dir, 'index.js'), custom);
            useApp(dir);

            await installCommand('hubspot');

            expect(processExitSpy).not.toHaveBeenCalled();
            expect(fs.readFileSync(path.join(dir, 'index.js'), 'utf8')).toBe(
                custom
            );
            expect(
                fs.existsSync(
                    path.join(dir, 'src/integrations/HubSpotIntegration.js')
                )
            ).toBe(true);
            expect(output()).toContain(
                "const HubSpotIntegration = require('./src/integrations/HubSpotIntegration');"
            );
            expect(output()).toContain('integrations: [HubSpotIntegration]');
        });

        it('passes every changed file to the commit step', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);

            await installCommand('hubspot');

            expect(commitChanges).toHaveBeenCalledWith(
                path.join(dir, 'package.json'),
                'HubSpot',
                [
                    path.join(dir, 'src/integrations/HubSpotIntegration.js'),
                    path.join(dir, 'index.js'),
                    path.join(dir, 'package.json'),
                ]
            );
        });
    });

    describe('in an older app with backend.js', () => {
        it('registers the integration in backend.js and leaves index.js alone', async () => {
            const root = makeTmpDir();
            const dir = path.join(root, 'backend');
            fs.ensureDirSync(dir);
            fs.writeJSONSync(path.join(dir, 'package.json'), {
                name: 'backend',
            });
            fs.writeFileSync(
                path.join(dir, 'index.js'),
                "module.exports = require('./backend');\n"
            );
            fs.writeFileSync(
                path.join(dir, 'backend.js'),
                'const appDefinition = {\n    integrations: [],\n};\nmodule.exports = appDefinition;\n'
            );
            // Hoisted node_modules at the workspace root still resolves.
            // (Created up front: Jest's resolver caches missing directories.)
            fs.ensureDirSync(path.join(root, 'node_modules'));
            findNearestBackendPackageJson.mockReturnValue(
                path.join(dir, 'package.json')
            );
            installPackage.mockImplementation((backendPath, spec) => {
                const name = spec.replace(/@(next|latest)$/, '');
                writeFakeModule(root, name, modules[name]);
            });

            await installCommand('hubspot');

            expect(consoleErrorSpy.mock.calls).toEqual([]);
            expect(processExitSpy).not.toHaveBeenCalled();
            const backendJs = fs.readFileSync(
                path.join(dir, 'backend.js'),
                'utf8'
            );
            expect(backendJs).toContain(
                "const HubSpotIntegration = require('./src/integrations/HubSpotIntegration');"
            );
            expect(backendJs).toContain('HubSpotIntegration,');
            expect(fs.readFileSync(path.join(dir, 'index.js'), 'utf8')).toBe(
                "module.exports = require('./backend');\n"
            );
            expect(
                fs.existsSync(
                    path.join(dir, 'src/integrations/HubSpotIntegration.js')
                )
            ).toBe(true);
        });
    });

    describe('early exits and errors', () => {
        it.each([[[]], [null], [undefined]])(
            'returns early when the selection is %p',
            async (selection) => {
                searchAndSelectPackage.mockResolvedValue(selection);

                await installCommand('hubspot');

                expect(findNearestBackendPackageJson).not.toHaveBeenCalled();
                expect(installPackage).not.toHaveBeenCalled();
            }
        );

        it('exits when no app package.json is found', async () => {
            findNearestBackendPackageJson.mockReturnValue(null);

            await installCommand('hubspot');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'An error occurred:',
                expect.any(Error)
            );
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });

        it('exits when the package does not exist', async () => {
            useApp(makeScaffoldedApp());
            const error = new Error('Package not found');
            validatePackageExists.mockRejectedValue(error);

            await installCommand('hubspot');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'An error occurred:',
                error
            );
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });

        it('exits when npm install fails', async () => {
            useApp(makeScaffoldedApp());
            const error = new Error('npm install exited with code 1');
            installPackage.mockImplementation(() => {
                throw error;
            });

            await installCommand('hubspot');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'An error occurred:',
                error
            );
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });

        it('exits when the installed package is not a Frigg API module', async () => {
            const dir = makeScaffoldedApp();
            useApp(dir);
            modules[HUBSPOT] = { withDefinition: false };

            await installCommand('hubspot');

            expect(output()).toMatch(/does not export a Definition/);
            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(fs.existsSync(path.join(dir, 'src/integrations'))).toBe(
                false
            );
        });
    });
});

describe('registerIntegration', () => {
    const {
        registerIntegration,
    } = require('../../../install-command/app-definition');
    const write = (source) => {
        const file = path.join(makeTmpDir(), 'index.js');
        fs.writeFileSync(file, source);
        return file;
    };

    it('adds the require after the last top-level require and the class to a non-empty array', () => {
        const file = write(
            "'use strict';\nconst A = require('./a');\n\nmodule.exports = { Definition: { integrations: [A] } };\n"
        );

        expect(
            registerIntegration(
                file,
                'BIntegration',
                './src/integrations/BIntegration'
            )
        ).toEqual({
            status: 'registered',
        });
        expect(fs.readFileSync(file, 'utf8')).toBe(
            "'use strict';\nconst A = require('./a');\nconst BIntegration = require('./src/integrations/BIntegration');\n\n" +
                'module.exports = { Definition: { integrations: [\n    BIntegration,\n    A] } };\n'
        );
    });

    it('handles a require that follows the definition', () => {
        const file = write(
            "const def = { integrations: [] };\nconst x = require('x');\nmodule.exports = def;\n"
        );

        expect(registerIntegration(file, 'BIntegration', './b').status).toBe(
            'registered'
        );
        expect(fs.readFileSync(file, 'utf8')).toBe(
            "const def = { integrations: [\n    BIntegration,\n] };\nconst x = require('x');\nconst BIntegration = require('./b');\nmodule.exports = def;\n"
        );
    });

    it('refuses to guess when there are two integrations arrays', () => {
        const source =
            'module.exports = { a: { integrations: [] }, b: { integrations: [] } };\n';
        const file = write(source);

        expect(registerIntegration(file, 'BIntegration', './b')).toMatchObject({
            status: 'manual',
        });
        expect(fs.readFileSync(file, 'utf8')).toBe(source);
    });

    it('refuses a file that does not parse', () => {
        const file = write('module.exports = { integrations: [ };\n');

        expect(registerIntegration(file, 'BIntegration', './b')).toMatchObject({
            status: 'manual',
            reason: expect.stringMatching(/cannot parse/),
        });
    });

    it('refuses a partly registered class', () => {
        const file = write(
            'module.exports = { integrations: [BIntegration] };\n'
        );

        expect(registerIntegration(file, 'BIntegration', './b')).toMatchObject({
            status: 'manual',
        });
    });
});

describe('getInstallSpec', () => {
    const { getInstallSpec } = jest.requireActual(
        '../../../install-command/install-package'
    );
    const appWith = (pkg) => {
        const dir = makeTmpDir();
        fs.writeJSONSync(path.join(dir, 'package.json'), pkg);
        return dir;
    };

    it.each([
        ['2.0.0-next.115', `${HUBSPOT}@next`],
        ['2.0.0--canary.639.abc1234.0', `${HUBSPOT}@next`],
        ['^2.0.1', HUBSPOT],
        ['^1.2.2', HUBSPOT],
    ])('core %s installs %s', (range, spec) => {
        expect(
            getInstallSpec(
                HUBSPOT,
                appWith({ dependencies: { '@friggframework/core': range } })
            )
        ).toBe(spec);
    });

    it('uses the installed core version when the range is not semver (file:, link:)', () => {
        const dir = appWith({
            dependencies: { '@friggframework/core': 'file:../core.tgz' },
        });
        const coreDir = path.join(
            dir,
            'node_modules',
            '@friggframework',
            'core'
        );
        fs.ensureDirSync(coreDir);
        fs.writeJSONSync(path.join(coreDir, 'package.json'), {
            name: '@friggframework/core',
            version: '2.0.0-next.0',
        });

        expect(getInstallSpec(HUBSPOT, dir)).toBe(`${HUBSPOT}@next`);
    });

    it('installs the default version without a readable package.json', () => {
        expect(getInstallSpec(HUBSPOT, makeTmpDir())).toBe(HUBSPOT);
    });
});

describe('commitChanges', () => {
    const { commitChanges: realCommit } = jest.requireActual(
        '../../../install-command/commit-changes'
    );
    const env = { ...process.env };

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation();
        // The CLI test setup replaces PATH; git lives on the real one.
        process.env.PATH = '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin';
        process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'Test';
        process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL =
            'test@example.com';
    });

    afterEach(() => {
        process.env = { ...env };
        jest.restoreAllMocks();
    });

    const git = (args, cwd) =>
        spawnSync('git', args, { cwd, encoding: 'utf8', env: process.env });

    it('commits only the given files and leaves other staged changes alone', () => {
        const dir = makeTmpDir();
        git(['init', '-q'], dir);
        fs.writeFileSync(path.join(dir, 'package.json'), '{}');
        fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'wip');
        git(['add', 'unrelated.txt'], dir);

        const committed = realCommit(
            path.join(dir, 'package.json'),
            'HubSpot',
            [path.join(dir, 'package.json')]
        );

        expect(committed).toBe(true);
        expect(
            git(['show', '--name-only', '--format=%s', 'HEAD'], dir).stdout
        ).toBe('Add HubSpot integration\n\npackage.json\n');
        expect(git(['diff', '--cached', '--name-only'], dir).stdout).toBe(
            'unrelated.txt\n'
        );
    });

    it('does nothing outside a git repository', () => {
        const dir = makeTmpDir();
        fs.writeFileSync(path.join(dir, 'package.json'), '{}');

        expect(
            realCommit(path.join(dir, 'package.json'), 'HubSpot', [
                path.join(dir, 'package.json'),
            ])
        ).toBe(false);
    });
});
