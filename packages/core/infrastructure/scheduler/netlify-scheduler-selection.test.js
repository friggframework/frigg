const { determineProvider, createSchedulerService } = require('./scheduler-service-factory');
const { NetlifySchedulerAdapter, DEFAULT_WORKER_PATH } = require('./netlify-scheduler-adapter');
const { ScheduledJobRepository } = require('./scheduled-job-repository');
const { createSchedulerCommands } = require('../../application/commands/scheduler-commands');

describe('scheduler provider selection on Netlify', () => {
    const keys = ['SCHEDULER_PROVIDER', 'NETLIFY', 'STAGE'];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    beforeEach(() => keys.forEach((k) => delete process.env[k]));
    afterAll(() => {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    });

    it.each([
        [{ NETLIFY: 'true', STAGE: 'production' }, 'netlify'],
        [{ NETLIFY: 'true', STAGE: 'dev' }, 'netlify'],
        [{ NETLIFY: 'true', SCHEDULER_PROVIDER: 'mock' }, 'mock'],
        [{ STAGE: 'production' }, 'eventbridge'],
        [{ STAGE: 'dev' }, 'mock'],
        [{ NETLIFY: 'false', STAGE: 'production' }, 'eventbridge'],
    ])('%j -> %s', (env, expected) => {
        Object.assign(process.env, env);
        expect(determineProvider()).toBe(expected);
    });

    it('the netlify adapter gets the Prisma ScheduledJob repository by default', () => {
        const service = createSchedulerService({ provider: 'netlify' });
        expect(service).toBeInstanceOf(NetlifySchedulerAdapter);
        expect(service.repository).toBeInstanceOf(ScheduledJobRepository);
        expect(service._inMemorySchedules).toBeUndefined();
    });

    it('an injected repository still wins', () => {
        const repository = { save: jest.fn() };
        expect(createSchedulerService({ provider: 'netlify', repository }).repository).toBe(repository);
    });
});

describe('scheduleJob queue target', () => {
    const job = { jobId: 'j', scheduledAt: new Date(Date.now() + 1000), event: 'E' };

    it('Netlify: no queueUrl targets the worker function', async () => {
        const repository = { save: jest.fn(async () => {}) };
        const commands = createSchedulerCommands({
            integrationName: 'hubspot',
            schedulerService: new NetlifySchedulerAdapter({ repository }),
        });
        await expect(commands.scheduleJob(job)).resolves.toMatchObject({ jobId: 'j' });
        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({ queueResourceId: DEFAULT_WORKER_PATH })
        );
    });

    it('Netlify: an SQS URL also targets the worker; a function path is kept', async () => {
        const repository = { save: jest.fn(async () => {}) };
        const commands = createSchedulerCommands({
            integrationName: 'hubspot',
            schedulerService: new NetlifySchedulerAdapter({ repository }),
        });
        await commands.scheduleJob({ ...job, queueUrl: 'https://sqs.us-east-1.amazonaws.com/1/q' });
        await commands.scheduleJob({ ...job, queueUrl: '/.netlify/functions/other-background' });
        for (const queueUrl of [
            '//evil.example/x',
            '/.netlify/functions/../x-background',
            '/.netlify/functions/admin',
        ]) {
            await commands.scheduleJob({ ...job, queueUrl });
        }
        expect(repository.save.mock.calls.map(([d]) => d.queueResourceId)).toEqual([
            DEFAULT_WORKER_PATH,
            '/.netlify/functions/other-background',
            DEFAULT_WORKER_PATH,
            DEFAULT_WORKER_PATH,
            DEFAULT_WORKER_PATH,
        ]);
    });

    it('SQS-backed schedulers still require queueUrl and get the derived ARN', async () => {
        const scheduleOneTime = jest.fn(async () => ({ scheduledJobId: 'arn', scheduledAt: 'x' }));
        const commands = createSchedulerCommands({
            integrationName: 'hubspot',
            schedulerService: { scheduleOneTime },
        });
        await expect(commands.scheduleJob(job)).resolves.toMatchObject({
            error: 400,
            code: 'INVALID_JOB_DATA',
        });
        await commands.scheduleJob({ ...job, queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/q' });
        expect(scheduleOneTime).toHaveBeenCalledWith(
            expect.objectContaining({ queueResourceId: 'arn:aws:sqs:us-east-1:123:q' })
        );
    });
});
