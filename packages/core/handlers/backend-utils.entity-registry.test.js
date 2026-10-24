/**
 * ADR-059 at the webhook loader: the module factory it builds for an
 * integration is given the app registry's definitions, registry-only types
 * included. Real loader and registry; repositories and use cases are fakes.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('@friggframework/core', () => ({ Worker: class {} }));
jest.mock('@friggframework/core/utils', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));
jest.mock('./integration-event-dispatcher', () => ({
    IntegrationEventDispatcher: jest.fn(),
}));
jest.mock('../integrations/use-cases/get-integration-instance', () => ({
    GetIntegrationInstance: jest.fn(() => ({
        execute: jest.fn().mockResolvedValue({ id: 'i1' }),
    })),
}));
jest.mock('../modules/module-factory', () => ({
    ModuleFactory: jest.fn(() => ({})),
}));
jest.mock('../integrations/repositories/process-repository-factory', () => ({
    createProcessRepository: jest.fn(() => ({
        findById: jest
            .fn()
            .mockResolvedValue({ integrationId: 'i1', userId: 'u1' }),
    })),
}));
jest.mock(
    '../integrations/repositories/integration-repository-factory',
    () => ({
        createIntegrationRepository: jest.fn(() => ({
            findIntegrationById: jest
                .fn()
                .mockResolvedValue({ id: 'i1', userId: 'u1' }),
        })),
    })
);
jest.mock('../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(() => ({})),
}));

const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const { ModuleFactory } = require('../modules/module-factory');
const {
    loadIntegrationForWebhook,
    createQueueWorker,
} = require('./backend-utils');

function writeBackend(source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-backend-utils-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(path.join(dir, 'index.js'), source);
    findNearestBackendPackageJson.mockReturnValue(
        path.join(dir, 'package.json')
    );
    return dir;
}

describe('loadIntegrationForWebhook and the entity registry (ADR-059)', () => {
    const dirs = [];
    afterEach(() => {
        for (const dir of dirs.splice(0))
            fs.rmSync(dir, { recursive: true, force: true });
        jest.clearAllMocks();
    });

    const factoryDefinitions = () =>
        ModuleFactory.mock.calls[0][0].moduleDefinitions;

    it('builds the module factory from the registry, registry-only types included', async () => {
        dirs.push(
            writeBackend(`
                class Sync { static Definition = { name: 'sync', modules: { crm: { definition: { moduleName: 'hubspot' } } } }; }
                module.exports = { Definition: {
                    integrations: [Sync],
                    entities: { xero: { definition: { moduleName: 'xero' } } },
                } };`)
        );

        await loadIntegrationForWebhook('i1');

        expect(
            factoryDefinitions()
                .map((d) => d.moduleName)
                .sort()
        ).toEqual(['hubspot', 'xero']);
    });

    it('an app with no entities key gets exactly the integration-bound definitions', async () => {
        dirs.push(
            writeBackend(`
                class Sync { static Definition = { name: 'sync', modules: { crm: { definition: { moduleName: 'hubspot' } } } }; }
                module.exports = { Definition: { integrations: [Sync] } };`)
        );

        await loadIntegrationForWebhook('i1');

        expect(factoryDefinitions().map((d) => d.moduleName)).toEqual([
            'hubspot',
        ]);
    });

    describe('queue worker hydration by processId', () => {
        class Sync {
            static Definition = {
                name: 'sync',
                modules: { crm: { definition: { moduleName: 'hubspot' } } },
            };
        }
        const run = async (options) => {
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const Worker = createQueueWorker(Sync, options);
            await new Worker()
                ._run({ event: 'E', data: { processId: 'p1' } }, {})
                .catch(() => {});
            console.log.mockRestore();
            console.error.mockRestore();
        };

        it('uses the module definitions the entry point passes (the app registry)', async () => {
            const moduleDefinitions = [
                { moduleName: 'xero' },
                { moduleName: 'hubspot' },
            ];

            await run({ moduleDefinitions });

            expect(factoryDefinitions()).toBe(moduleDefinitions);
        });

        it('without any, falls back to the integration’s own modules', async () => {
            await run(undefined);

            expect(factoryDefinitions().map((d) => d.moduleName)).toEqual([
                'hubspot',
            ]);
        });
    });
});
