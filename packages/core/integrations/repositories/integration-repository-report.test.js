/**
 * findAllForReport tests for the integration repository adapters.
 *
 * This is the report-shaped read that the reporting subsystem used to own in
 * its own repository triad (packages/core/reporting/repositories). ADR-010
 * folds it into the integration repository so reports read cross-integration
 * data through the same command/repository path as everything else. These
 * cases preserve the behavior the retired reporting-repository-*.test.js files
 * verified: where-clause building, errorCount/moduleCount derivation, strict
 * id handling (Postgres), and the DocumentDB cursor drain + invalid-userId
 * short-circuit.
 */

const {
    IntegrationRepositoryPostgres,
} = require('./integration-repository-postgres');
const {
    IntegrationRepositoryMongo,
} = require('./integration-repository-mongo');
const {
    IntegrationRepositoryDocumentDB,
} = require('./integration-repository-documentdb');

describe('IntegrationRepositoryPostgres.findAllForReport', () => {
    let repo;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = { integration: { findMany: jest.fn() } };
        repo = new IntegrationRepositoryPostgres();
        repo.prisma = mockPrisma;
    });

    it('filters by status and userId and maps the report projection', async () => {
        mockPrisma.integration.findMany.mockResolvedValue([
            {
                id: 7,
                config: { type: 'attio' },
                status: 'ENABLED',
                userId: 3,
                version: '1.2.0',
                errors: [{ message: 'a' }, { message: 'b' }],
                entities: [{ id: 1 }, { id: 2 }, { id: 3 }],
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            },
        ]);

        const rows = await repo.findAllForReport({
            status: 'ENABLED',
            userId: '3',
        });

        expect(mockPrisma.integration.findMany).toHaveBeenCalledWith({
            where: { status: 'ENABLED', userId: 3 },
            include: { entities: { select: { id: true } } },
        });
        expect(rows).toEqual([
            {
                id: '7',
                type: 'attio',
                status: 'ENABLED',
                userId: '3',
                version: '1.2.0',
                errorCount: 2,
                moduleCount: 3,
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-02-01T00:00:00Z'),
            },
        ]);
    });

    it('defaults type/errorCount/moduleCount when absent', async () => {
        mockPrisma.integration.findMany.mockResolvedValue([
            { id: 9, config: {}, status: null, userId: null },
        ]);

        const [row] = await repo.findAllForReport();

        expect(mockPrisma.integration.findMany).toHaveBeenCalledWith({
            where: {},
            include: { entities: { select: { id: true } } },
        });
        expect(row).toMatchObject({
            id: '9',
            type: null,
            errorCount: 0,
            moduleCount: 0,
            userId: null,
        });
    });

    it('rejects a non-integer userId instead of silently coercing it', async () => {
        await expect(
            repo.findAllForReport({ userId: '12abc' })
        ).rejects.toThrow(/cannot be converted to integer/);
        expect(mockPrisma.integration.findMany).not.toHaveBeenCalled();
    });
});

describe('IntegrationRepositoryMongo.findAllForReport', () => {
    let repo;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = { integration: { findMany: jest.fn() } };
        repo = new IntegrationRepositoryMongo();
        repo.prisma = mockPrisma;
    });

    it('uses the string userId directly and maps the report projection', async () => {
        mockPrisma.integration.findMany.mockResolvedValue([
            {
                id: '507f1f77bcf86cd799439011',
                config: { type: 'hubspot' },
                status: 'ERROR',
                userId: '507f191e810c19729de860ea',
                version: '2.0.0',
                errors: [{ message: 'boom' }],
                entities: [{ id: 'e1' }],
                createdAt: new Date('2026-03-01T00:00:00Z'),
                updatedAt: new Date('2026-03-02T00:00:00Z'),
            },
        ]);

        const rows = await repo.findAllForReport({
            userId: '507f191e810c19729de860ea',
        });

        expect(mockPrisma.integration.findMany).toHaveBeenCalledWith({
            where: { userId: '507f191e810c19729de860ea' },
            include: { entities: { select: { id: true } } },
        });
        expect(rows[0]).toEqual({
            id: '507f1f77bcf86cd799439011',
            type: 'hubspot',
            status: 'ERROR',
            userId: '507f191e810c19729de860ea',
            version: '2.0.0',
            errorCount: 1,
            moduleCount: 1,
            createdAt: new Date('2026-03-01T00:00:00Z'),
            updatedAt: new Date('2026-03-02T00:00:00Z'),
        });
    });
});

describe('IntegrationRepositoryDocumentDB.findAllForReport', () => {
    let repo;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = { $runCommandRaw: jest.fn() };
        repo = new IntegrationRepositoryDocumentDB();
        repo.prisma = mockPrisma;
    });

    it('drains the cursor across batches (no first-batch truncation)', async () => {
        const doc = (n) => ({
            _id: { $oid: `507f1f77bcf86cd7994390${n}` },
            config: { type: 'attio' },
            status: 'ENABLED',
            userId: null,
            entityIds: [{ $oid: 'e1' }],
            errors: [],
        });

        mockPrisma.$runCommandRaw
            .mockResolvedValueOnce({
                cursor: { id: 42, firstBatch: [doc('11'), doc('12')] },
            })
            .mockResolvedValueOnce({
                cursor: { id: 0, nextBatch: [doc('13')] },
            });

        const rows = await repo.findAllForReport({ status: 'ENABLED' });

        expect(rows).toHaveLength(3);
        const firstCall = mockPrisma.$runCommandRaw.mock.calls[0][0];
        expect(firstCall).toMatchObject({
            find: 'Integration',
            filter: { status: 'ENABLED' },
        });
        expect(mockPrisma.$runCommandRaw.mock.calls[1][0]).toMatchObject({
            getMore: 42,
            collection: 'Integration',
        });
        expect(rows[0]).toMatchObject({
            type: 'attio',
            moduleCount: 1,
            errorCount: 0,
        });
    });

    it('treats an extended-JSON {$numberLong} cursor id as open and drains it', async () => {
        const doc = (n) => ({
            _id: { $oid: `507f1f77bcf86cd7994390${n}` },
            config: { type: 'attio' },
            entityIds: [],
            errors: [],
        });

        mockPrisma.$runCommandRaw
            .mockResolvedValueOnce({
                cursor: { id: { $numberLong: '9007199254740993' }, firstBatch: [doc('11')] },
            })
            .mockResolvedValueOnce({
                cursor: { id: { $numberLong: '0' }, nextBatch: [doc('12')] },
            });

        const rows = await repo.findAllForReport();

        expect(rows).toHaveLength(2);
        expect(mockPrisma.$runCommandRaw.mock.calls[1][0]).toMatchObject({
            getMore: { $numberLong: '9007199254740993' },
            collection: 'Integration',
        });
    });

    it('returns [] for an invalid userId without querying', async () => {
        const rows = await repo.findAllForReport({ userId: 'not-an-object-id' });

        expect(rows).toEqual([]);
        expect(mockPrisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('derives errorCount from messages.errors when top-level errors is absent', async () => {
        mockPrisma.$runCommandRaw.mockResolvedValueOnce({
            cursor: {
                id: 0,
                firstBatch: [
                    {
                        _id: { $oid: '507f1f77bcf86cd799439011' },
                        config: { type: 'x' },
                        messages: { errors: [{ m: 1 }, { m: 2 }] },
                        entityIds: [],
                    },
                ],
            },
        });

        const [row] = await repo.findAllForReport();

        expect(row.errorCount).toBe(2);
        expect(row.moduleCount).toBe(0);
    });
});
