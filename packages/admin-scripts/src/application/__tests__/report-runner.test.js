const { createReportRunner } = require('../report-runner');
const { ScriptFactory } = require('../script-factory');

class FakeReport {
    static Definition = {
        name: 'fake',
        version: '1.0.0',
        runModes: ['live', 'recorded', 'snapshot'],
        output: { format: 'json' },
        inputSchema: {
            type: 'object',
            properties: { n: { type: 'integer' } },
        },
    };

    constructor(params = {}) {
        this.context = params.context || null;
    }

    async execute(frigg, params) {
        return { ok: true, n: params.n ?? 0, friggReceived: frigg };
    }
}

class CsvReport {
    static Definition = {
        name: 'csv',
        version: '1.0.0',
        runModes: ['recorded'],
        output: { format: 'csv' },
    };
    async execute() {
        return { file: 'a,b\n1,2\n', summary: { rows: 1 }, fileType: 'csv' };
    }
}

const FRIGG = { integrations: {}, integrationMappings: {}, usage: {} };

function makeRunner() {
    const reportCommands = {
        createExecution: jest.fn(),
        completeExecution: jest.fn(),
        updateExecutionState: jest.fn(),
    };
    const runner = createReportRunner({
        reportFactory: new ScriptFactory([FakeReport, CsvReport]),
        reportCommands,
        friggCommands: FRIGG,
    });
    return { runner, reportCommands };
}

describe('ReportRunner', () => {
    it('requires a reportFactory', () => {
        expect(() => createReportRunner({})).toThrow(/reportFactory/);
    });

    describe('live mode', () => {
        it('computes inline, returns COMPLETED, and persists NOTHING', async () => {
            const { runner, reportCommands } = makeRunner();

            const result = await runner.execute('fake', { n: 5 }, { mode: 'live' });

            expect(result.status).toBe('COMPLETED');
            expect(result.mode).toBe('live');
            expect(result.output).toMatchObject({ ok: true, n: 5 });
            // The report reads via the injected frigg command bundle.
            expect(result.output.friggReceived).toBe(FRIGG);
            // The core invariant: live creates no execution record.
            expect(reportCommands.createExecution).not.toHaveBeenCalled();
            expect(reportCommands.completeExecution).not.toHaveBeenCalled();
            expect(reportCommands.updateExecutionState).not.toHaveBeenCalled();
        });

        it('defaults to the first runMode when none is given (live)', async () => {
            const { runner, reportCommands } = makeRunner();

            const result = await runner.execute('fake', {});

            expect(result.mode).toBe('live');
            expect(reportCommands.createExecution).not.toHaveBeenCalled();
        });
    });

    it('rejects a mode the report does not allow', async () => {
        const { runner } = makeRunner();
        await expect(
            runner.execute('fake', {}, { mode: 'bogus' })
        ).rejects.toMatchObject({ code: 'INVALID_MODE' });
    });

    it('rejects input that violates the inputSchema', async () => {
        const { runner } = makeRunner();
        await expect(
            runner.execute('fake', { n: 'not-a-number' }, { mode: 'live' })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('rejects a non-JSON output format in live mode (JSON-only inline)', async () => {
        class LiveCsv {
            static Definition = {
                name: 'live-csv',
                version: '1.0.0',
                runModes: ['live'],
                output: { format: 'csv' },
            };
            async execute() {
                return {};
            }
        }
        const runner = createReportRunner({
            reportFactory: new ScriptFactory([LiveCsv]),
            friggCommands: FRIGG,
        });
        await expect(
            runner.execute('live-csv', {}, { mode: 'live' })
        ).rejects.toMatchObject({ code: 'ARTIFACT_STORAGE_UNAVAILABLE' });
    });

    describe('non-JSON artifact output (recorded / snapshot)', () => {
        it('stores the file and completes with summary + artifact ref', async () => {
            const reportCommands = {
                createExecution: jest.fn().mockResolvedValue({ id: 'exec-a' }),
                updateExecutionState: jest.fn().mockResolvedValue({}),
                completeExecution: jest.fn().mockResolvedValue({ success: true }),
            };
            const artifactRepository = {
                put: jest.fn().mockResolvedValue({
                    bucket: 'bkt',
                    key: 'reports/exec-a/csv.csv',
                }),
            };
            const runner = createReportRunner({
                reportFactory: new ScriptFactory([CsvReport]),
                reportCommands,
                friggCommands: FRIGG,
                artifactRepository,
            });

            const result = await runner.execute(
                'csv',
                {},
                { mode: 'recorded', trigger: 'MANUAL' }
            );

            expect(result.status).toBe('COMPLETED');
            expect(result.mode).toBe('recorded');
            expect(result.artifact).toEqual({
                bucket: 'bkt',
                key: 'reports/exec-a/csv.csv',
            });
            expect(result.summary).toEqual({ rows: 1 });
            // No inline output for non-json.
            expect(result.output).toBeUndefined();

            expect(artifactRepository.put).toHaveBeenCalledTimes(1);
            const [key, body, contentType] =
                artifactRepository.put.mock.calls[0];
            expect(key).toMatch(/^reports\/exec-a\/csv-.+\.csv$/);
            expect(body).toBe('a,b\n1,2\n');
            expect(contentType).toBe('text/csv');

            expect(reportCommands.completeExecution).toHaveBeenCalledWith(
                'exec-a',
                expect.objectContaining({
                    state: 'COMPLETED',
                    summary: { rows: 1 },
                    artifact: { bucket: 'bkt', key: 'reports/exec-a/csv.csv' },
                })
            );
        });

        it('records FAILED when artifact storage throws', async () => {
            const reportCommands = {
                createExecution: jest.fn().mockResolvedValue({ id: 'exec-b' }),
                updateExecutionState: jest.fn().mockResolvedValue({}),
                completeExecution: jest.fn().mockResolvedValue({ success: true }),
            };
            const artifactRepository = {
                put: jest.fn().mockRejectedValue(new Error('S3 down')),
            };
            const runner = createReportRunner({
                reportFactory: new ScriptFactory([CsvReport]),
                reportCommands,
                friggCommands: FRIGG,
                artifactRepository,
            });

            const result = await runner.execute(
                'csv',
                {},
                { mode: 'recorded', trigger: 'MANUAL' }
            );

            expect(result.status).toBe('FAILED');
            expect(result.error.message).toBe('S3 down');
            expect(reportCommands.completeExecution).toHaveBeenCalledWith(
                'exec-b',
                expect.objectContaining({ state: 'FAILED' })
            );
        });
    });

    describe('recorded / snapshot modes', () => {
        it('creates a record, marks RUNNING, then completes COMPLETED', async () => {
            const { runner, reportCommands } = makeRunner();
            reportCommands.createExecution.mockResolvedValue({ id: 'exec-1' });
            reportCommands.updateExecutionState.mockResolvedValue({});
            reportCommands.completeExecution.mockResolvedValue({ success: true });

            const result = await runner.execute(
                'fake',
                { n: 2 },
                { mode: 'recorded', trigger: 'MANUAL' }
            );

            expect(result.status).toBe('COMPLETED');
            expect(result.mode).toBe('recorded');
            expect(result.executionId).toBe('exec-1');
            expect(result.output).toMatchObject({ ok: true, n: 2 });

            expect(reportCommands.createExecution).toHaveBeenCalledTimes(1);
            expect(reportCommands.updateExecutionState).toHaveBeenCalledWith(
                'exec-1',
                'RUNNING'
            );
            expect(reportCommands.completeExecution).toHaveBeenCalledWith(
                'exec-1',
                expect.objectContaining({ state: 'COMPLETED', output: result.output })
            );
        });

        it('passes seriesName for snapshot mode (defaulting to report name)', async () => {
            const { runner, reportCommands } = makeRunner();
            reportCommands.createExecution.mockResolvedValue({ id: 'exec-2' });
            reportCommands.updateExecutionState.mockResolvedValue({});
            reportCommands.completeExecution.mockResolvedValue({ success: true });

            await runner.execute('fake', {}, { mode: 'snapshot', trigger: 'SCHEDULED' });

            expect(reportCommands.createExecution).toHaveBeenCalledWith(
                expect.objectContaining({ mode: 'snapshot', seriesName: 'fake' })
            );
        });

        it('does NOT set seriesName for recorded mode', async () => {
            const { runner, reportCommands } = makeRunner();
            reportCommands.createExecution.mockResolvedValue({ id: 'exec-3' });
            reportCommands.updateExecutionState.mockResolvedValue({});
            reportCommands.completeExecution.mockResolvedValue({ success: true });

            await runner.execute('fake', {}, { mode: 'recorded', trigger: 'MANUAL' });

            const arg = reportCommands.createExecution.mock.calls[0][0];
            expect(arg.seriesName).toBeUndefined();
        });

        it('resumes an existing record without creating a new one', async () => {
            const { runner, reportCommands } = makeRunner();
            reportCommands.updateExecutionState.mockResolvedValue({});
            reportCommands.completeExecution.mockResolvedValue({ success: true });

            const result = await runner.execute(
                'fake',
                {},
                { mode: 'recorded', trigger: 'QUEUE', executionId: 'given-1' }
            );

            expect(reportCommands.createExecution).not.toHaveBeenCalled();
            expect(result.executionId).toBe('given-1');
            expect(reportCommands.updateExecutionState).toHaveBeenCalledWith(
                'given-1',
                'RUNNING'
            );
        });

        it('records FAILED when the report throws', async () => {
            class BoomReport {
                static Definition = {
                    name: 'boom',
                    version: '1.0.0',
                    runModes: ['recorded'],
                    output: { format: 'json' },
                };
                async execute() {
                    throw new Error('kaboom');
                }
            }
            const reportCommands = {
                createExecution: jest.fn().mockResolvedValue({ id: 'exec-9' }),
                updateExecutionState: jest.fn().mockResolvedValue({}),
                completeExecution: jest.fn().mockResolvedValue({ success: true }),
            };
            const runner = createReportRunner({
                reportFactory: new ScriptFactory([BoomReport]),
                reportCommands,
                friggCommands: FRIGG,
            });

            const result = await runner.execute(
                'boom',
                {},
                { mode: 'recorded', trigger: 'MANUAL' }
            );

            expect(result.status).toBe('FAILED');
            expect(result.error.message).toBe('kaboom');
            expect(reportCommands.completeExecution).toHaveBeenCalledWith(
                'exec-9',
                expect.objectContaining({ state: 'FAILED' })
            );
        });

        it('throws when the execution record cannot be created', async () => {
            const { runner, reportCommands } = makeRunner();
            reportCommands.createExecution.mockResolvedValue({
                error: 500,
                reason: 'DB down',
            });

            await expect(
                runner.execute('fake', {}, { mode: 'recorded', trigger: 'MANUAL' })
            ).rejects.toThrow('DB down');
        });
    });

    describe('self-requeue continuation', () => {
        // Opts into chunking: yields a continuation marker while the Lambda is
        // low on time and no resume state has arrived yet; otherwise finishes.
        class ChunkedReport {
            static Definition = {
                name: 'chunked',
                version: '1.0.0',
                runModes: ['recorded'],
                output: { format: 'json' },
            };
            async execute(frigg, params, context) {
                const remaining = context.getRemainingTimeInMillis();
                if (remaining < 60000 && !params.__resume) {
                    return { __continuation: { cursor: 42 } };
                }
                return { done: true };
            }
        }

        function makeChunkedRunner() {
            const reportCommands = {
                createExecution: jest
                    .fn()
                    .mockResolvedValue({ id: 'exec-c' }),
                updateExecutionState: jest.fn().mockResolvedValue({}),
                completeExecution: jest.fn().mockResolvedValue({ success: true }),
                appendExecutionLog: jest.fn().mockResolvedValue({}),
            };
            const runner = createReportRunner({
                reportFactory: new ScriptFactory([ChunkedReport]),
                reportCommands,
                friggCommands: FRIGG,
            });
            return { runner, reportCommands };
        }

        it('returns CONTINUE without completing when the report yields on low time', async () => {
            const { runner, reportCommands } = makeChunkedRunner();
            const lambdaContext = {
                getRemainingTimeInMillis: jest.fn().mockReturnValue(5000),
            };

            const result = await runner.execute(
                'chunked',
                {},
                { mode: 'recorded', trigger: 'QUEUE', lambdaContext }
            );

            expect(result.status).toBe('CONTINUE');
            expect(result.executionId).toBe('exec-c');
            expect(result.continuation).toEqual({ cursor: 42 });
            // Stays RUNNING — not completed — between hops.
            expect(reportCommands.completeExecution).not.toHaveBeenCalled();
            expect(reportCommands.appendExecutionLog).toHaveBeenCalledWith(
                'exec-c',
                expect.objectContaining({
                    message: expect.stringMatching(/continuation/i),
                })
            );
        });

        it('completes normally when time is ample (no continuation)', async () => {
            const { runner, reportCommands } = makeChunkedRunner();
            const lambdaContext = {
                getRemainingTimeInMillis: jest.fn().mockReturnValue(900000),
            };

            const result = await runner.execute(
                'chunked',
                {},
                { mode: 'recorded', trigger: 'QUEUE', lambdaContext }
            );

            expect(result.status).toBe('COMPLETED');
            expect(reportCommands.completeExecution).toHaveBeenCalledWith(
                'exec-c',
                expect.objectContaining({ state: 'COMPLETED' })
            );
        });

        it('finishes when resumed with the prior continuation state', async () => {
            const { runner, reportCommands } = makeChunkedRunner();
            const lambdaContext = {
                getRemainingTimeInMillis: jest.fn().mockReturnValue(5000),
            };

            const result = await runner.execute(
                'chunked',
                { __resume: { cursor: 42 } },
                {
                    mode: 'recorded',
                    trigger: 'QUEUE',
                    executionId: 'exec-c',
                    lambdaContext,
                }
            );

            expect(result.status).toBe('COMPLETED');
            expect(reportCommands.createExecution).not.toHaveBeenCalled();
        });
    });
});
