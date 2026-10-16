/**
 * Claiming a due ScheduledJob is atomic, and a claim is a lease.
 *
 * Real ScheduledJobRepository and NetlifySchedulerAdapter over an in-memory
 * prisma.scheduledJob whose updateMany has Prisma's conditional semantics.
 */
const {
    ScheduledJobRepository,
    DEFAULT_LEASE_MS,
} = require('@friggframework/core/infrastructure/scheduler/scheduled-job-repository');
const {
    NetlifySchedulerAdapter,
} = require('@friggframework/core/infrastructure/scheduler/netlify-scheduler-adapter');
const { createInMemoryScheduledJobPrisma } = require('../test/in-memory-scheduled-job-prisma');

const MINUTE = 60 * 1000;

function setup() {
    const db = createInMemoryScheduledJobPrisma();
    const repository = new ScheduledJobRepository({ prismaClient: db });
    const sent = [];
    const queueProvider = {
        send: jest.fn(async (payload, queueId) => {
            sent.push({ payload, queueId });
        }),
    };
    return { db, repository, queueProvider, sent };
}

async function seed(repository, scheduleName, extra = {}) {
    await repository.save({
        scheduleName,
        scheduledAt: new Date(Date.now() - MINUTE).toISOString(),
        queueResourceId: '/.netlify/functions/worker-background',
        payload: { integrationName: 'hubspot', event: 'E', data: { n: scheduleName } },
        ...extra,
    });
}

describe('ScheduledJobRepository.claim', () => {
    beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => {}));
    afterEach(() => jest.restoreAllMocks());

    it('only one of two claims on the same PENDING row wins', async () => {
        const { repository, db } = setup();
        await seed(repository, 'job');
        const now = new Date();
        await expect(repository.claim('job', now)).resolves.toBe(true);
        await expect(repository.claim('job', now)).resolves.toBe(false);
        expect(db.scheduledJob.rows.get('job').state).toBe('PROCESSING');
    });

    it('a PROCESSING row is claimable again only after the lease', async () => {
        const { repository, db } = setup();
        await seed(repository, 'job', { scheduledAt: new Date(Date.now() - 60 * MINUTE).toISOString() });
        const claimedAt = new Date(Date.now() - 30 * MINUTE);
        await repository.claim('job', claimedAt);
        expect(db.scheduledJob.rows.get('job').updatedAt).toEqual(claimedAt);

        const insideLease = new Date(claimedAt.getTime() + DEFAULT_LEASE_MS - 1000);
        await expect(repository.claim('job', insideLease)).resolves.toBe(false);
        await expect(repository.findDue(insideLease)).resolves.toEqual([]);

        const afterLease = new Date(claimedAt.getTime() + DEFAULT_LEASE_MS + 1000);
        await expect(repository.findDue(afterLease)).resolves.toHaveLength(1);
        await expect(repository.claim('job', afterLease)).resolves.toBe(true);
    });

    it('never claims a FAILED row', async () => {
        const { repository } = setup();
        await seed(repository, 'job', { state: 'FAILED' });
        await expect(repository.claim('job', new Date())).resolves.toBe(false);
        await expect(repository.findDue(new Date(Date.now() + 60 * MINUTE))).resolves.toEqual([]);
    });
});

describe('NetlifySchedulerAdapter.processDueSchedules with claims', () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    it('two overlapping ticks dispatch a due job once', async () => {
        const { repository, queueProvider, sent, db } = setup();
        await seed(repository, 'job-a');
        await seed(repository, 'job-b');

        // Both ticks read the due list before either claims: the race the
        // old unconditional PROCESSING write lost.
        let arrived = 0;
        let release;
        const bothRead = new Promise((r) => (release = r));
        const findDue = repository.findDue.bind(repository);
        repository.findDue = async (...args) => {
            const rows = await findDue(...args);
            if (++arrived === 2) release();
            await bothRead;
            return rows;
        };

        const tick = () => new NetlifySchedulerAdapter({ repository, queueProvider }).processDueSchedules();
        const [first, second] = await Promise.all([tick(), tick()]);

        expect(sent.map((s) => s.payload.data.n).sort()).toEqual(['job-a', 'job-b']);
        expect(first.processed + second.processed).toBe(2);
        expect(first.skipped + second.skipped).toBe(2);
        expect(db.scheduledJob.rows.size).toBe(0);
    });

    it('a job left PROCESSING by a dispatcher that died is dispatched after the lease', async () => {
        const { repository, queueProvider, sent, db } = setup();
        await seed(repository, 'stuck');
        // A tick claimed it 10 minutes ago and timed out before sending.
        await repository.claim('stuck', new Date(Date.now() - 10 * MINUTE));

        const result = await new NetlifySchedulerAdapter({ repository, queueProvider }).processDueSchedules();

        expect(result).toEqual({ processed: 1, errors: 0, skipped: 0 });
        expect(sent).toHaveLength(1);
        expect(db.scheduledJob.rows.has('stuck')).toBe(false);
    });

    it('a job claimed within the lease is left to its dispatcher', async () => {
        const { repository, queueProvider, sent, db } = setup();
        await seed(repository, 'busy');
        await repository.claim('busy', new Date(Date.now() - MINUTE));

        const result = await new NetlifySchedulerAdapter({ repository, queueProvider }).processDueSchedules();

        expect(result).toEqual({ processed: 0, errors: 0, skipped: 0 });
        expect(sent).toHaveLength(0);
        expect(db.scheduledJob.rows.get('busy').state).toBe('PROCESSING');
    });

    it('honours a configured lease', async () => {
        const { repository, queueProvider, sent } = setup();
        await seed(repository, 'job');
        await repository.claim('job', new Date(Date.now() - 2 * MINUTE));

        await new NetlifySchedulerAdapter({ repository, queueProvider, leaseMs: MINUTE }).processDueSchedules();
        expect(sent).toHaveLength(1);
    });
});
