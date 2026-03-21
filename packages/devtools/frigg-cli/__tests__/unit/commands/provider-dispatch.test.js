/**
 * Provider Dispatch Tests
 *
 * Verifies that CLI commands correctly route to provider plugins
 * based on appDefinition.provider. These tests ensure:
 *
 *   1. AWS (default) falls through to existing serverless behavior
 *   2. Non-AWS providers delegate to the provider plugin
 *   3. AWS-only commands reject non-AWS providers
 *
 * When adding a new provider, these tests should pass without changes
 * as long as the provider implements the plugin interface.
 */

const path = require('path');

// Jest hoists jest.mock() calls — variable names prefixed with `mock` are allowed
function mockCreateProvider(overrides = {}) {
    return {
        name: 'test-provider',
        deploy: jest.fn().mockResolvedValue({ url: 'https://test.example.com' }),
        validate: jest.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
        preflightCheck: jest.fn().mockResolvedValue({ ready: true, missing: [] }),
        generateConfig: jest.fn().mockReturnValue('# generated config'),
        generateEnvTemplate: jest.fn().mockReturnValue({}),
        getFunctionEntryPoints: jest.fn().mockReturnValue({
            'api.js': '// api handler',
            'worker-background.js': '// worker handler',
        }),
        detect: jest.fn().mockReturnValue(false),
        createHandler: jest.fn(),
        ...overrides,
    };
}

/**
 * Create a mock child process that auto-fires the 'close' event with exit 0.
 * This prevents deploy command from hanging on the `await` for the close event.
 */
function mockCreateChildProcess(exitCode = 0) {
    return {
        on: jest.fn((event, callback) => {
            if (event === 'close') {
                // Fire asynchronously to simulate real behavior
                setImmediate(() => callback(exitCode));
            }
        }),
    };
}

// ─── Deploy Command ────────────────────────────────────────────────

describe('deploy command: provider dispatch', () => {
    let deployCommand;
    let spawn;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.mock('child_process', () => ({
            spawn: jest.fn(),
        }));

        jest.mock('fs', () => ({
            existsSync: jest.fn().mockReturnValue(false),
        }));

        // Mock doctor-command (deploy imports it; it has heavy AWS deps)
        jest.mock('../../../doctor-command', () => ({
            doctorCommand: jest.fn(),
        }));

        spawn = require('child_process').spawn;
        spawn.mockReturnValue(mockCreateChildProcess(0));

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('falls through to osls for AWS (no provider in appDefinition)', async () => {
        ({ deployCommand } = require('../../../deploy-command'));

        await deployCommand({ stage: 'dev', skipDoctor: true });

        expect(spawn).toHaveBeenCalledWith(
            'osls',
            expect.arrayContaining(['deploy']),
            expect.any(Object)
        );
    });

    it('falls through to osls when provider is explicitly "aws"', async () => {
        const fs = require('fs');
        fs.existsSync.mockReturnValue(true);

        jest.mock(
            path.join(process.cwd(), 'index.js'),
            () => ({ Definition: { provider: 'aws', environment: {} } }),
            { virtual: true }
        );

        ({ deployCommand } = require('../../../deploy-command'));
        await deployCommand({ stage: 'dev', skipDoctor: true });

        expect(spawn).toHaveBeenCalledWith(
            'osls',
            expect.arrayContaining(['deploy']),
            expect.any(Object)
        );
    });

    it('delegates to provider.deploy() for non-AWS provider', async () => {
        const mockProvider = mockCreateProvider({ name: 'netlify' });
        const fs = require('fs');
        fs.existsSync.mockReturnValue(true);

        jest.mock(
            path.join(process.cwd(), 'index.js'),
            () => ({ Definition: { provider: 'netlify', environment: {} } }),
            { virtual: true }
        );

        jest.mock('@friggframework/core/providers/resolve-provider', () => ({
            resolveProvider: () => mockProvider,
        }), { virtual: true });

        ({ deployCommand } = require('../../../deploy-command'));
        await deployCommand({ stage: 'production' });

        // Should NOT spawn osls
        expect(spawn).not.toHaveBeenCalled();

        // Should call provider.validate then provider.deploy
        expect(mockProvider.validate).toHaveBeenCalled();
        expect(mockProvider.deploy).toHaveBeenCalledWith(
            expect.objectContaining({ provider: 'netlify' }),
            expect.objectContaining({ stage: 'production', prod: true })
        );
    });

    it('exits when provider.validate() reports errors', async () => {
        const mockProvider = mockCreateProvider({
            name: 'netlify',
            validate: jest.fn().mockReturnValue({
                valid: false,
                errors: ['KMS encryption not supported on Netlify'],
                warnings: [],
            }),
        });

        const fs = require('fs');
        fs.existsSync.mockReturnValue(true);

        jest.mock(
            path.join(process.cwd(), 'index.js'),
            () => ({ Definition: { provider: 'netlify' } }),
            { virtual: true }
        );

        jest.mock('@friggframework/core/providers/resolve-provider', () => ({
            resolveProvider: () => mockProvider,
        }), { virtual: true });

        jest.spyOn(process, 'exit').mockImplementation();

        ({ deployCommand } = require('../../../deploy-command'));
        await deployCommand({ stage: 'dev' });

        expect(process.exit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('KMS encryption not supported')
        );
    });

    it('exits when provider.deploy() throws', async () => {
        const mockDeployError = new Error('Preflight check failed');
        mockDeployError.missing = ['NETLIFY_AUTH_TOKEN'];

        const mockProvider = mockCreateProvider({
            name: 'netlify',
            deploy: jest.fn().mockRejectedValue(mockDeployError),
        });

        const fs = require('fs');
        fs.existsSync.mockReturnValue(true);

        jest.mock(
            path.join(process.cwd(), 'index.js'),
            () => ({ Definition: { provider: 'netlify' } }),
            { virtual: true }
        );

        jest.mock('@friggframework/core/providers/resolve-provider', () => ({
            resolveProvider: () => mockProvider,
        }), { virtual: true });

        jest.spyOn(process, 'exit').mockImplementation();

        ({ deployCommand } = require('../../../deploy-command'));
        await deployCommand({ stage: 'dev' });

        expect(process.exit).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('Preflight check failed')
        );
    });
});

// ─── Build Command ─────────────────────────────────────────────────

describe('build command: provider dispatch', () => {
    let buildCommand;
    let spawnSync;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.mock('child_process', () => ({
            spawnSync: jest.fn().mockReturnValue({ status: 0 }),
        }));

        spawnSync = require('child_process').spawnSync;

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(process, 'exit').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('falls through to osls for AWS (default)', async () => {
        ({ buildCommand } = require('../../../build-command'));

        await buildCommand({ stage: 'dev' });

        expect(spawnSync).toHaveBeenCalledWith(
            'osls',
            expect.arrayContaining(['package']),
            expect.any(Object)
        );
    });

    it('delegates to provider build for non-AWS', async () => {
        const mockProvider = mockCreateProvider({ name: 'netlify' });

        jest.mock('../../../utils/provider-helper', () => ({
            loadProviderForCli: () => ({
                appDefinition: { provider: 'netlify' },
                provider: mockProvider,
                providerName: 'netlify',
            }),
        }));

        jest.mock('fs', () => ({
            writeFileSync: jest.fn(),
            mkdirSync: jest.fn(),
        }));

        ({ buildCommand } = require('../../../build-command'));
        await buildCommand({ stage: 'dev' });

        // Should NOT call osls
        expect(spawnSync).not.toHaveBeenCalled();

        // Should call provider's build pipeline
        expect(mockProvider.validate).toHaveBeenCalled();
        expect(mockProvider.generateConfig).toHaveBeenCalled();
        expect(mockProvider.getFunctionEntryPoints).toHaveBeenCalled();
    });
});

// ─── AWS-Only Command Guards ───────────────────────────────────────

describe('AWS-only command guards', () => {
    let processExitSpy;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('repair command rejects non-AWS provider', async () => {
        jest.mock('../../../utils/provider-helper', () => ({
            loadProviderForCli: () => ({
                appDefinition: { provider: 'netlify' },
                provider: mockCreateProvider({ name: 'netlify' }),
                providerName: 'netlify',
            }),
        }));

        jest.mock('../../../utils/output', () => ({
            info: jest.fn(),
            error: jest.fn(),
            log: jest.fn(),
            success: jest.fn(),
            warn: jest.fn(),
        }));

        jest.mock('../../../../infrastructure/domains/health/domain/value-objects/stack-identifier', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/application/use-cases/run-health-check-use-case', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/application/use-cases/repair-via-import-use-case', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/application/use-cases/reconcile-properties-use-case', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/application/use-cases/execute-resource-import-use-case', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/infrastructure/adapters/aws-stack-repository', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/infrastructure/adapters/aws-resource-detector', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/infrastructure/adapters/aws-resource-importer', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/infrastructure/adapters/aws-property-reconciler', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/domain/services/mismatch-analyzer', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/domain/services/health-score-calculator', () => jest.fn());
        jest.mock('../../../../infrastructure/domains/health/domain/services/template-parser', () => ({
            TemplateParser: jest.fn(),
        }));
        jest.mock('../../../../infrastructure/domains/health/domain/services/import-template-generator', () => ({
            ImportTemplateGenerator: jest.fn(),
        }));
        jest.mock('../../../../infrastructure/domains/health/domain/services/import-progress-monitor', () => ({
            ImportProgressMonitor: jest.fn(),
        }));

        const { repairCommand } = require('../../../repair-command');
        const output = require('../../../utils/output');

        await repairCommand('my-stack', { import: true });

        expect(output.error).toHaveBeenCalledWith(
            expect.stringContaining('only available for AWS')
        );
        expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('generate-iam command rejects non-AWS provider', async () => {
        jest.mock('../../../utils/provider-helper', () => ({
            loadProviderForCli: () => ({
                appDefinition: { provider: 'netlify' },
                provider: mockCreateProvider({ name: 'netlify' }),
                providerName: 'netlify',
            }),
        }));

        jest.mock('fs-extra', () => ({
            existsSync: jest.fn(),
            writeFileSync: jest.fn(),
            ensureDirSync: jest.fn(),
        }), { virtual: true });

        jest.mock('@friggframework/core', () => ({
            findNearestBackendPackageJson: jest.fn(),
        }), { virtual: true });

        jest.mock('../../../../infrastructure/domains/security/iam-generator', () => ({
            generateIAMCloudFormation: jest.fn(),
            getFeatureSummary: jest.fn(),
        }));

        const { generateIamCommand } = require('../../../generate-iam-command');

        await generateIamCommand({});

        expect(processExitSpy).toHaveBeenCalledWith(1);
        expect(console.error).toHaveBeenCalledWith(
            expect.stringContaining('only available for AWS')
        );
    });
});
