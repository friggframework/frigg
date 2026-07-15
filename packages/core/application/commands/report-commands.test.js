const mockExecutionRepo = {
    createExecution: jest.fn(),
    findExecutionById: jest.fn(),
    findExecutionsByName: jest.fn(),
    updateExecutionState: jest.fn(),
    updateExecutionResults: jest.fn(),
    appendExecutionLog: jest.fn(),
};

jest.mock(
    '../../admin-scripts/repositories/admin-script-execution-repository-factory',
    () => ({
        createAdminScriptExecutionRepository: () => mockExecutionRepo,
    })
);

const { createReportCommands } = require('./report-commands');

describe('createReportCommands', () => {
    let commands;

    beforeEach(() => {
        jest.clearAllMocks();
        commands = createReportCommands();
    });

    describe('createExecution', () => {
        it('writes type:REPORT and puts mode/seriesName in context', async () => {
            mockExecutionRepo.createExecution.mockResolvedValue({ id: 'r1' });

            await commands.createExecution({
                reportName: 'integrations',
                reportVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'snapshot',
                input: { windowDays: 30 },
                audit: { apiKeyLast4: '1234' },
                seriesName: 'nightly',
            });

            expect(mockExecutionRepo.createExecution).toHaveBeenCalledWith({
                name: 'integrations',
                type: 'REPORT',
                parentExecutionId: undefined,
                context: {
                    reportVersion: '1.0.0',
                    trigger: 'MANUAL',
                    mode: 'snapshot',
                    input: { windowDays: 30 },
                    audit: { apiKeyLast4: '1234' },
                    seriesName: 'nightly',
                },
            });
        });

        it('defaults mode to recorded and omits seriesName when absent', async () => {
            mockExecutionRepo.createExecution.mockResolvedValue({ id: 'r1' });

            await commands.createExecution({
                reportName: 'integrations',
                trigger: 'MANUAL',
            });

            const arg = mockExecutionRepo.createExecution.mock.calls[0][0];
            expect(arg.context.mode).toBe('recorded');
            expect('seriesName' in arg.context).toBe(false);
        });

        it('maps repository errors to an error response', async () => {
            mockExecutionRepo.createExecution.mockRejectedValue(
                new Error('DB down')
            );

            const result = await commands.createExecution({
                reportName: 'integrations',
                trigger: 'MANUAL',
            });

            expect(result).toMatchObject({ error: 500, reason: 'DB down' });
        });
    });

    describe('findExecutionById (isolation guard)', () => {
        it('returns the record when it is a REPORT execution', async () => {
            const rec = { id: 'r1', type: 'REPORT', state: 'COMPLETED' };
            mockExecutionRepo.findExecutionById.mockResolvedValue(rec);

            const result = await commands.findExecutionById('r1');

            expect(result).toEqual(rec);
        });

        it('404s a non-REPORT row so a report lookup never returns a script', async () => {
            mockExecutionRepo.findExecutionById.mockResolvedValue({
                id: 's1',
                type: 'ADMIN_SCRIPT',
            });

            const result = await commands.findExecutionById('s1');

            expect(result).toMatchObject({
                error: 404,
                code: 'EXECUTION_NOT_FOUND',
            });
        });

        it('404s when the record is missing', async () => {
            mockExecutionRepo.findExecutionById.mockResolvedValue(null);

            const result = await commands.findExecutionById('nope');

            expect(result).toMatchObject({
                error: 404,
                code: 'EXECUTION_NOT_FOUND',
            });
        });
    });

    describe('listExecutionsByName', () => {
        it('queries by name scoped to type REPORT', async () => {
            const rows = [{ id: 'r1', type: 'REPORT' }];
            mockExecutionRepo.findExecutionsByName.mockResolvedValue(rows);

            const result = await commands.listExecutionsByName('integrations', {
                limit: 5,
                offset: 0,
                state: 'COMPLETED',
            });

            expect(result).toEqual(rows);
            expect(mockExecutionRepo.findExecutionsByName).toHaveBeenCalledWith(
                'integrations',
                { type: 'REPORT', limit: 5, offset: 0, state: 'COMPLETED' }
            );
        });

        it('returns [] on error (never-throw)', async () => {
            mockExecutionRepo.findExecutionsByName.mockRejectedValue(
                new Error('DB down')
            );

            const result = await commands.listExecutionsByName('integrations');

            expect(result).toEqual([]);
        });
    });

    describe('findSnapshotSeries', () => {
        it('windows by name, keeps only snapshots, and maps points', async () => {
            const from = new Date('2025-01-01');
            const to = new Date('2025-02-01');
            const captured = new Date('2025-01-15');
            mockExecutionRepo.findExecutionsByName.mockResolvedValue([
                {
                    id: 'r1',
                    createdAt: captured,
                    context: { mode: 'snapshot' },
                    results: {
                        output: { summary: { total: 7 } },
                        artifact: { bucket: 'b', key: 'k' },
                    },
                },
                {
                    id: 'r2',
                    createdAt: captured,
                    context: { mode: 'recorded' },
                    results: { output: { summary: { total: 9 } } },
                },
            ]);

            const result = await commands.findSnapshotSeries('integrations', {
                from,
                to,
                limit: 100,
            });

            expect(mockExecutionRepo.findExecutionsByName).toHaveBeenCalledWith(
                'integrations',
                {
                    type: 'REPORT',
                    from,
                    to,
                    sortBy: 'createdAt',
                    sortOrder: 'asc',
                    limit: 100,
                }
            );
            expect(result).toEqual([
                {
                    executionId: 'r1',
                    capturedAt: captured,
                    summary: { total: 7 },
                    artifactUrl: { bucket: 'b', key: 'k' },
                },
            ]);
        });

        it('falls back to results.summary and null artifact', async () => {
            mockExecutionRepo.findExecutionsByName.mockResolvedValue([
                {
                    id: 'r1',
                    createdAt: new Date('2025-01-15'),
                    context: { mode: 'snapshot' },
                    results: { summary: { total: 3 } },
                },
            ]);

            const result = await commands.findSnapshotSeries('integrations');

            expect(result).toEqual([
                {
                    executionId: 'r1',
                    capturedAt: new Date('2025-01-15'),
                    summary: { total: 3 },
                    artifactUrl: null,
                },
            ]);
        });

        it('returns [] on error (never-throw)', async () => {
            mockExecutionRepo.findExecutionsByName.mockRejectedValue(
                new Error('DB down')
            );

            const result = await commands.findSnapshotSeries('integrations');

            expect(result).toEqual([]);
        });
    });

    describe('completeExecution', () => {
        it('sets state and merges output/summary/artifact into results', async () => {
            mockExecutionRepo.updateExecutionState.mockResolvedValue({});
            mockExecutionRepo.updateExecutionResults.mockResolvedValue({});

            await commands.completeExecution('r1', {
                state: 'COMPLETED',
                output: { total: 3 },
                summary: { total: 3 },
                artifact: { bucket: 'b', key: 'k' },
                metrics: { durationMs: 12 },
            });

            expect(mockExecutionRepo.updateExecutionState).toHaveBeenCalledWith(
                'r1',
                'COMPLETED'
            );
            expect(mockExecutionRepo.updateExecutionResults).toHaveBeenCalledWith(
                'r1',
                expect.objectContaining({
                    output: { total: 3 },
                    summary: { total: 3 },
                    artifact: { bucket: 'b', key: 'k' },
                    metrics: { durationMs: 12 },
                })
            );
        });

        it('updates state only when no results fields are provided', async () => {
            mockExecutionRepo.updateExecutionState.mockResolvedValue({});

            await commands.completeExecution('r1', { state: 'FAILED' });

            expect(mockExecutionRepo.updateExecutionState).toHaveBeenCalledWith(
                'r1',
                'FAILED'
            );
            expect(
                mockExecutionRepo.updateExecutionResults
            ).not.toHaveBeenCalled();
        });
    });
});
