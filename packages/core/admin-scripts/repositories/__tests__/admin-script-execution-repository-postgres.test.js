const {
    AdminScriptExecutionRepositoryPostgres,
} = require('../admin-script-execution-repository-postgres');

describe('AdminScriptExecutionRepositoryPostgres query window', () => {
    let repository;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            adminScriptExecution: {
                findMany: jest.fn(),
                deleteMany: jest.fn(),
            },
        };

        repository = new AdminScriptExecutionRepositoryPostgres();
        repository.prisma = mockPrisma;
    });

    describe('findExecutionsByName()', () => {
        it('should filter by type when provided', async () => {
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([]);

            await repository.findExecutionsByName('nightly', { type: 'REPORT' });

            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { name: 'nightly', type: 'REPORT' },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should apply a createdAt window with both bounds', async () => {
            const from = new Date('2025-01-01');
            const to = new Date('2025-02-01');
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([]);

            await repository.findExecutionsByName('nightly', {
                type: 'REPORT',
                from,
                to,
            });

            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: {
                    name: 'nightly',
                    type: 'REPORT',
                    createdAt: { gte: from, lte: to },
                },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should include only the createdAt bound provided', async () => {
            const to = new Date('2025-02-01');
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([]);

            await repository.findExecutionsByName('nightly', { to });

            expect(mockPrisma.adminScriptExecution.findMany).toHaveBeenCalledWith({
                where: { name: 'nightly', createdAt: { lte: to } },
                orderBy: { createdAt: 'desc' },
                take: undefined,
                skip: undefined,
            });
        });

        it('should convert returned ids to strings', async () => {
            mockPrisma.adminScriptExecution.findMany.mockResolvedValue([
                { id: 1, parentExecutionId: 2, name: 'nightly', type: 'REPORT' },
            ]);

            const result = await repository.findExecutionsByName('nightly', {
                type: 'REPORT',
            });

            expect(result[0].id).toBe('1');
            expect(result[0].parentExecutionId).toBe('2');
        });
    });

    describe('deleteExecutionsOlderThan()', () => {
        it('should scope the delete by type when provided', async () => {
            const date = new Date('2024-01-01');
            mockPrisma.adminScriptExecution.deleteMany.mockResolvedValue({
                count: 3,
            });

            const result = await repository.deleteExecutionsOlderThan(date, {
                type: 'REPORT',
            });

            expect(result).toEqual({ acknowledged: true, deletedCount: 3 });
            expect(mockPrisma.adminScriptExecution.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: date }, type: 'REPORT' },
            });
        });

        it('should omit type when not provided', async () => {
            const date = new Date('2024-01-01');
            mockPrisma.adminScriptExecution.deleteMany.mockResolvedValue({
                count: 0,
            });

            await repository.deleteExecutionsOlderThan(date);

            expect(mockPrisma.adminScriptExecution.deleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: date } },
            });
        });
    });
});
