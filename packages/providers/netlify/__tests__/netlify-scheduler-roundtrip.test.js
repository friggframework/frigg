/**
 * On Netlify, createSchedulerCommands().scheduleJob() (what an integration
 * calls, with no provider or repository of its own) must store a ScheduledJob
 * row, and the scheduled-sync function must then find it and send it to the
 * queue worker.
 *
 * The Prisma client is an in-memory stand-in for prisma.scheduledJob; the
 * scheduler factory, the commands, the adapter, the repository, the
 * scheduled-sync function and the Netlify queue provider all run for real.
 */
const path = require('path');
const crypto = require('crypto');
const { createInMemoryScheduledJobPrisma } = require('../test/in-memory-scheduled-job-prisma');

const corePath = path.dirname(require.resolve('@friggframework/core/package.json'));

const mockDb = createInMemoryScheduledJobPrisma();

jest.doMock(path.join(corePath, 'database/prisma'), () => ({
    prisma: mockDb,
    connectPrisma: jest.fn(async () => mockDb),
    disconnectPrisma: jest.fn(async () => {}),
    getEncryptionConfig: () => ({ enabled: false }),
}));
jest.doMock(path.join(corePath, 'handlers/app-definition-loader'), () => ({
    loadAppDefinition: () => ({ appDefinition: { name: 'app' }, integrations: [] }),
}));

const SECRET = 'scheduler-roundtrip-secret';
const ENV_KEYS = ['SCHEDULER_PROVIDER', 'NETLIFY', 'STAGE', 'FRIGG_QUEUE_SIGNING_SECRET', 'URL'];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

describe('Netlify one-time jobs: scheduleJob -> ScheduledJob row -> scheduled-sync', () => {
    const realFetch = global.fetch;

    beforeEach(() => {
        for (const k of ENV_KEYS) delete process.env[k];
        mockDb.scheduledJob.rows.clear();
        global.fetch = jest.fn(async () => ({ ok: false, status: 202, statusText: 'Accepted' }));
    });
    afterAll(() => {
        global.fetch = realFetch;
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    const loadCommands = () => {
        let createSchedulerCommands;
        jest.isolateModules(() => {
            ({ createSchedulerCommands } = require('@friggframework/core/application/commands/scheduler-commands'));
        });
        return createSchedulerCommands({ integrationName: 'hubspot' });
    };

    it.each([
        ['NETLIFY=true (the Netlify runtime), with STAGE=production', { NETLIFY: 'true', STAGE: 'production' }],
        ['NETLIFY=true with STAGE=dev', { NETLIFY: 'true', STAGE: 'dev' }],
        ['SCHEDULER_PROVIDER=netlify (set by the generated functions)', { SCHEDULER_PROVIDER: 'netlify', STAGE: 'production' }],
    ])('%s: the job is stored and dispatched by the cron', async (_label, env) => {
        Object.assign(process.env, env, { FRIGG_QUEUE_SIGNING_SECRET: SECRET, URL: 'https://site.example' });
        const commands = loadCommands();

        // An integration written for AWS passes its (here unset) queue URL.
        const result = await commands.scheduleJob({
            jobId: 'hubspot-renew-1',
            scheduledAt: new Date(Date.now() - 1000),
            event: 'REFRESH_WEBHOOK',
            payload: { integrationId: 'i-1' },
            queueUrl: process.env.HUBSPOT_QUEUE_URL,
        });
        expect(result).toMatchObject({ jobId: 'hubspot-renew-1', jobArn: 'netlify-schedule-hubspot-renew-1' });

        const row = mockDb.scheduledJob.rows.get('hubspot-renew-1');
        expect(row).toMatchObject({
            state: 'PENDING',
            queueResourceId: '/.netlify/functions/worker-background',
            payload: expect.objectContaining({
                integrationName: 'hubspot',
                event: 'REFRESH_WEBHOOK',
                data: { integrationId: 'i-1' },
            }),
        });

        let handler;
        jest.isolateModules(() => {
            ({ handler } = require('../functions/scheduled-sync'));
        });
        const res = await handler({}, {});
        expect(JSON.parse(res.body)).toMatchObject({ schedulesProcessed: 1, scheduleErrors: 0 });

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe('https://site.example/.netlify/functions/worker-background');
        expect(JSON.parse(init.body)).toMatchObject({
            integrationName: 'hubspot',
            event: 'REFRESH_WEBHOOK',
            data: { integrationId: 'i-1' },
        });
        // Signed, so the worker will accept it.
        const ts = init.headers['x-frigg-queue-timestamp'];
        const mac = crypto.createHmac('sha256', SECRET).update(`${ts}.${init.body}`).digest('hex');
        expect(init.headers['x-frigg-queue-signature']).toBe(`v1=${mac}`);

        expect(mockDb.scheduledJob.rows.has('hubspot-renew-1')).toBe(false);
    });

    it('a job not yet due stays PENDING through a tick', async () => {
        Object.assign(process.env, { NETLIFY: 'true', FRIGG_QUEUE_SIGNING_SECRET: SECRET });
        await loadCommands().scheduleJob({
            jobId: 'later',
            scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
            event: 'E',
        });
        let handler;
        jest.isolateModules(() => {
            ({ handler } = require('../functions/scheduled-sync'));
        });
        await handler({}, {});
        expect(global.fetch).not.toHaveBeenCalled();
        expect(mockDb.scheduledJob.rows.get('later').state).toBe('PENDING');
    });

    it('the generated functions default SCHEDULER_PROVIDER to netlify', () => {
        const { getFunctionEntryPoints } = require('../lib/get-function-entry-points');
        for (const content of Object.values(getFunctionEntryPoints({}))) {
            expect(content).toContain(
                "process.env.SCHEDULER_PROVIDER = process.env.SCHEDULER_PROVIDER || 'netlify';"
            );
        }
    });
});
