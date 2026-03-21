const { ScheduledJobRepository } = require('../lib/scheduled-job-repository');

describe('ScheduledJobRepository', () => {
    test('requires prismaClient in constructor', () => {
        expect(() => new ScheduledJobRepository({})).toThrow(
            'prismaClient'
        );
    });

    test('accepts a prismaClient instance', () => {
        const mockPrisma = { scheduledJob: {} };
        const repo = new ScheduledJobRepository({ prismaClient: mockPrisma });

        expect(repo.prisma).toBe(mockPrisma);
    });

    describe('with mock Prisma client', () => {
        let repo;
        let mockPrisma;

        beforeEach(() => {
            mockPrisma = {
                scheduledJob: {
                    upsert: jest.fn().mockResolvedValue({ id: 1 }),
                    delete: jest.fn().mockResolvedValue({}),
                    findUnique: jest.fn().mockResolvedValue(null),
                    findMany: jest.fn().mockResolvedValue([]),
                },
            };
            repo = new ScheduledJobRepository({ prismaClient: mockPrisma });
        });

        test('save calls upsert with correct params', async () => {
            const scheduleData = {
                scheduleName: 'test-job',
                scheduledAt: new Date().toISOString(),
                queueResourceId: '/.netlify/functions/worker-background',
                payload: { event: 'REFRESH_WEBHOOK' },
                state: 'PENDING',
            };

            await repo.save(scheduleData);

            expect(mockPrisma.scheduledJob.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { scheduleName: 'test-job' },
                    create: expect.objectContaining({
                        scheduleName: 'test-job',
                        queueResourceId:
                            '/.netlify/functions/worker-background',
                        state: 'PENDING',
                    }),
                })
            );
        });

        test('delete calls prisma delete', async () => {
            await repo.delete('test-job');

            expect(mockPrisma.scheduledJob.delete).toHaveBeenCalledWith({
                where: { scheduleName: 'test-job' },
            });
        });

        test('delete ignores P2025 (not found) errors', async () => {
            const notFoundError = new Error('Not found');
            notFoundError.code = 'P2025';
            mockPrisma.scheduledJob.delete.mockRejectedValue(notFoundError);

            // Should not throw
            await expect(repo.delete('nonexistent')).resolves.not.toThrow();
        });

        test('delete rethrows other errors', async () => {
            mockPrisma.scheduledJob.delete.mockRejectedValue(
                new Error('Connection failed')
            );

            await expect(repo.delete('test-job')).rejects.toThrow(
                'Connection failed'
            );
        });

        test('findByName calls findUnique', async () => {
            await repo.findByName('test-job');

            expect(mockPrisma.scheduledJob.findUnique).toHaveBeenCalledWith({
                where: { scheduleName: 'test-job' },
            });
        });

        test('findDue queries PENDING jobs before cutoff', async () => {
            const now = new Date();
            await repo.findDue(now);

            expect(mockPrisma.scheduledJob.findMany).toHaveBeenCalledWith({
                where: {
                    state: 'PENDING',
                    scheduledAt: { lte: now },
                },
                orderBy: { scheduledAt: 'asc' },
            });
        });
    });
});
