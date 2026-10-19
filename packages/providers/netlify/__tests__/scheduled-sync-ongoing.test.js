/**
 * scheduled-sync dispatches ONGOING_SYNC per each integration's
 * Definition.schedule.scope: once per class (default, data: {}) or once per
 * ENABLED installation (data.integrationId, so the worker hydrates it).
 *
 * The function file runs for real with core's DispatchOngoingSyncs and the
 * Netlify queue provider; the database, the app definition and the
 * integration repository are stubbed.
 */
const path = require('path');
const { createInMemoryScheduledJobPrisma } = require('../test/in-memory-scheduled-job-prisma');

const corePath = path.dirname(require.resolve('@friggframework/core/package.json'));
const mockDb = createInMemoryScheduledJobPrisma();

function integrationClass(name, schedule) {
    class Integration {}
    Integration.Definition = { name, schedule };
    Integration.prototype.startOngoingSync = function () {};
    return Integration;
}

let mockIntegrations = [];
const mockFindIntegrations = jest.fn();
const mockCreateRepository = jest.fn(() => ({ findIntegrations: mockFindIntegrations }));

jest.doMock(path.join(corePath, 'database/prisma'), () => ({
    prisma: mockDb,
    connectPrisma: jest.fn(async () => mockDb),
    disconnectPrisma: jest.fn(async () => {}),
    getEncryptionConfig: () => ({ enabled: false }),
}));
jest.doMock(path.join(corePath, 'handlers/app-definition-loader'), () => ({
    loadAppDefinition: () => ({ appDefinition: { name: 'app' }, integrations: mockIntegrations }),
}));
jest.doMock(path.join(corePath, 'integrations/repositories/integration-repository-factory'), () => ({
    createIntegrationRepository: mockCreateRepository,
}));

const ENV_KEYS = ['FRIGG_QUEUE_SIGNING_SECRET', 'URL', 'SCHEDULER_PROVIDER'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

describe('scheduled-sync: ONGOING_SYNC per class or per installation', () => {
    const realFetch = global.fetch;
    let handler;

    beforeAll(() => {
        Object.assign(process.env, {
            FRIGG_QUEUE_SIGNING_SECRET: 'tick-secret',
            URL: 'https://site.example',
            SCHEDULER_PROVIDER: 'netlify',
        });
        jest.isolateModules(() => {
            ({ handler } = require('../functions/scheduled-sync'));
        });
    });
    beforeEach(() => {
        mockDb.scheduledJob.rows.clear();
        mockFindIntegrations.mockReset();
        mockCreateRepository.mockClear();
        global.fetch = jest.fn(async () => ({ ok: false, status: 202, statusText: 'Accepted' }));
    });
    afterAll(() => {
        global.fetch = realFetch;
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    const sentBodies = () => global.fetch.mock.calls.map(([, init]) => JSON.parse(init.body));

    it("scope 'class' (default): one unhydrated message per class, no database read", async () => {
        mockIntegrations = [integrationClass('crm')];
        const res = await handler({}, {});

        expect(sentBodies()).toEqual([{ integrationName: 'crm', event: 'ONGOING_SYNC', data: {} }]);
        expect(mockCreateRepository).not.toHaveBeenCalled();
        expect(JSON.parse(res.body)).toMatchObject({ syncsDispatched: 1, syncErrors: 0 });
    });

    it("scope 'installation': one message per ENABLED integration, with its id", async () => {
        mockIntegrations = [
            integrationClass('crm', {
                scope: 'installation',
                isDue: (integration) => integration.id !== 'not-due',
            }),
            integrationClass('erp'),
            integrationClass('hr', { scope: 'installation' }),
        ];
        mockFindIntegrations.mockImplementation(async ({ type }) =>
            type === 'crm' ? [{ id: 'i-1' }, { id: 'not-due' }, { id: 'i-2' }] : []
        );

        const res = await handler({}, {});

        expect(mockFindIntegrations).toHaveBeenCalledWith({ type: 'crm', status: 'ENABLED' });
        expect(sentBodies()).toEqual([
            { integrationName: 'crm', event: 'ONGOING_SYNC', data: { integrationId: 'i-1' } },
            { integrationName: 'crm', event: 'ONGOING_SYNC', data: { integrationId: 'i-2' } },
            { integrationName: 'erp', event: 'ONGOING_SYNC', data: {} },
        ]);
        expect(JSON.parse(res.body)).toMatchObject({ syncsDispatched: 3, syncsNotDue: 1, syncErrors: 0 });
        // One repository per tick, however many classes read records.
        expect(mockCreateRepository).toHaveBeenCalledTimes(1);
        for (const [url, init] of global.fetch.mock.calls) {
            expect(url).toBe('https://site.example/.netlify/functions/worker-background');
            expect(init.headers['x-frigg-queue-signature']).toMatch(/^v1=/);
        }
    });
});
