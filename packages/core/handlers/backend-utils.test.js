/**
 * @group unit
 */

jest.mock('@friggframework/core', () => ({
    Worker: class {},
}));
jest.mock('./integration-event-dispatcher', () => ({
    IntegrationEventDispatcher: jest.fn(),
}));
jest.mock('../integrations/use-cases/get-integration-instance', () => ({
    GetIntegrationInstance: jest.fn(),
}));
jest.mock('../modules/module-factory', () => ({ ModuleFactory: jest.fn() }));
jest.mock('../integrations/repositories/process-repository-factory', () => ({
    createProcessRepository: jest.fn(),
}));
jest.mock(
    '../integrations/repositories/integration-repository-factory',
    () => ({
        createIntegrationRepository: jest.fn(),
    })
);
jest.mock('../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(),
}));
jest.mock('../integrations/utils/map-integration-dto', () => ({
    getModulesDefinitionFromIntegrationClasses: jest.fn(() => []),
}));
jest.mock('./app-definition-loader', () => ({
    loadAppDefinition: jest.fn(() => ({ integrations: [] })),
}));

const { integrationExists, createQueueWorker } = require('./backend-utils');
const {
    createIntegrationRepository,
} = require('../integrations/repositories/integration-repository-factory');
const {
    GetIntegrationInstance,
} = require('../integrations/use-cases/get-integration-instance');
const {
    IntegrationEventDispatcher,
} = require('./integration-event-dispatcher');

describe('integrationExists', () => {
    const setRepo = (findIntegrationById) =>
        createIntegrationRepository.mockReturnValue({ findIntegrationById });

    afterEach(() => jest.clearAllMocks());

    it('is true when the integration record is found', async () => {
        setRepo(jest.fn().mockResolvedValue({ id: '19306' }));
        await expect(integrationExists('19306')).resolves.toBe(true);
    });

    it('is false when the lookup returns null', async () => {
        setRepo(jest.fn().mockResolvedValue(null));
        await expect(integrationExists('19306')).resolves.toBe(false);
    });

    it('is false when the lookup throws "not found"', async () => {
        setRepo(
            jest
                .fn()
                .mockRejectedValue(new Error('Integration 19306 not found'))
        );
        await expect(integrationExists('19306')).resolves.toBe(false);
    });

    it('is true on an unrelated lookup failure (do not discard on a transient DB error)', async () => {
        setRepo(jest.fn().mockRejectedValue(new Error('connection reset')));
        await expect(integrationExists('19306')).resolves.toBe(true);
    });
});

describe('createQueueWorker — integration deleted mid-flight', () => {
    class FakeIntegration {
        static Definition = { name: 'fake' };
    }

    afterEach(() => jest.clearAllMocks());

    it('discards the webhook message (no throw) when the integration is gone after a processing error', async () => {
        const findIntegrationById = jest
            .fn()
            .mockResolvedValueOnce({ id: '19306', userId: 'u1' }) // hydration
            .mockResolvedValueOnce(null); // re-check → gone
        createIntegrationRepository.mockReturnValue({ findIntegrationById });

        GetIntegrationInstance.mockImplementation(() => ({
            execute: jest
                .fn()
                .mockResolvedValue({ id: '19306', status: 'ENABLED' }),
        }));
        IntegrationEventDispatcher.mockImplementation(() => ({
            dispatchJob: jest
                .fn()
                .mockRejectedValue(new Error('mapping write failed')),
        }));

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'log').mockImplementation();

        const QueueWorker = createQueueWorker(FakeIntegration);
        const worker = new QueueWorker();

        await expect(
            worker._run(
                { event: 'ON_WEBHOOK', data: { integrationId: '19306' } },
                {}
            )
        ).resolves.toBeUndefined();

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('deleted mid-flight')
        );
    });

    it('re-throws the original error when the integration still exists (transient failure retries)', async () => {
        const findIntegrationById = jest
            .fn()
            .mockResolvedValueOnce({ id: '19306', userId: 'u1' }) // hydration
            .mockResolvedValueOnce({ id: '19306' }); // re-check → still there
        createIntegrationRepository.mockReturnValue({ findIntegrationById });

        GetIntegrationInstance.mockImplementation(() => ({
            execute: jest
                .fn()
                .mockResolvedValue({ id: '19306', status: 'ENABLED' }),
        }));
        const boom = new Error('transient 500');
        IntegrationEventDispatcher.mockImplementation(() => ({
            dispatchJob: jest.fn().mockRejectedValue(boom),
        }));

        jest.spyOn(console, 'warn').mockImplementation();
        const errorSpy = jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'log').mockImplementation();

        const QueueWorker = createQueueWorker(FakeIntegration);
        const worker = new QueueWorker();

        await expect(
            worker._run(
                { event: 'ON_WEBHOOK', data: { integrationId: '19306' } },
                {}
            )
        ).rejects.toBe(boom);
        // The Worker boundary logs the rethrown error one time (ADR-048 §4).
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('discards the message when the integration is IN_DELETION (teardown in progress)', async () => {
        const findIntegrationById = jest
            .fn()
            .mockResolvedValue({ id: '19306', userId: 'u1' });
        createIntegrationRepository.mockReturnValue({ findIntegrationById });

        GetIntegrationInstance.mockImplementation(() => ({
            execute: jest
                .fn()
                .mockResolvedValue({ id: '19306', status: 'IN_DELETION' }),
        }));
        const dispatchJob = jest.fn().mockResolvedValue(undefined);
        IntegrationEventDispatcher.mockImplementation(() => ({ dispatchJob }));

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'log').mockImplementation();

        const QueueWorker = createQueueWorker(FakeIntegration);
        const worker = new QueueWorker();

        await expect(
            worker._run(
                { event: 'ON_WEBHOOK', data: { integrationId: '19306' } },
                {}
            )
        ).resolves.toBeUndefined();

        expect(dispatchJob).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Discarding')
        );
    });
});

describe('createQueueWorker — process missing at hydration', () => {
    class FakeIntegration {
        static Definition = { name: 'fake' };
    }

    afterEach(() => jest.clearAllMocks());

    it('throws a coded PROCESS_NOT_FOUND error, so the worker record carries the code', async () => {
        const {
            createProcessRepository,
        } = require('../integrations/repositories/process-repository-factory');
        createProcessRepository.mockReturnValue({
            findById: jest.fn().mockResolvedValue(null),
        });
        createIntegrationRepository.mockReturnValue({
            findIntegrationById: jest.fn(),
        });
        jest.spyOn(console, 'log').mockImplementation();

        const QueueWorker = createQueueWorker(FakeIntegration);
        const worker = new QueueWorker();

        await expect(
            worker._run({ event: 'FETCH_PAGE', data: { processId: 'p-404' } }, {})
        ).rejects.toMatchObject({
            code: 'PROCESS_NOT_FOUND',
            message: 'Process not found: p-404',
        });
    });
});

describe('loadRouterFromObject — logger scope for a route :integrationId', () => {
    const express = require('express');
    const { loadRouterFromObject } = require('./backend-utils');
    const { getLoggerScope } = require('../logs/context');
    const { mergeTelemetryContext } = require('../telemetry/telemetry-context');

    class FakeIntegration {
        static Definition = { name: 'fake' };
        async initialize() {}
    }

    async function call(routeDef, path) {
        const app = express();
        app.use(loadRouterFromObject(FakeIntegration, routeDef));
        const server = await new Promise((resolve) => {
            const s = app.listen(0, () => resolve(s));
        });
        try {
            await fetch(`http://127.0.0.1:${server.address().port}${path}`);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    }

    afterEach(() => jest.clearAllMocks());

    it.each([
        ['with :integrationId', '/items/:integrationId', '/items/int-42', { integrationId: 'int-42' }],
        ['without it', '/items', '/items', {}],
    ])('route %s', async (_label, routePath, requestPath, expected) => {
        jest.spyOn(console, 'log').mockImplementation();
        let seen;
        IntegrationEventDispatcher.mockImplementation(() => ({
            dispatchHttp: async () => {
                seen = { scope: getLoggerScope(), bus: mergeTelemetryContext() };
                return {};
            },
        }));
        await call({ path: routePath, method: 'GET', event: 'X' }, requestPath);
        expect(seen.scope).toEqual(expected);
        expect(seen.bus).toBeUndefined();
    });
});
