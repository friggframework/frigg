const { DeleteScheduleUseCase } = require('../delete-schedule-use-case');

describe('DeleteScheduleUseCase', () => {
    let useCase;
    let mockCommands;
    let mockSchedulerAdapter;
    let mockScriptFactory;

    beforeEach(() => {
        mockCommands = {
            deleteSchedule: jest.fn(),
        };

        mockSchedulerAdapter = {
            deleteSchedule: jest.fn(),
        };

        mockScriptFactory = {
            has: jest.fn(),
            get: jest.fn(),
        };

        useCase = new DeleteScheduleUseCase({
            commands: mockCommands,
            schedulerAdapter: mockSchedulerAdapter,
            scriptFactory: mockScriptFactory,
        });
    });

    describe('execute', () => {
        it('should delete schedule and cleanup external scheduler', async () => {
            const deletedSchedule = {
                scriptName: 'test-script',
                externalScheduleId:
                    'arn:aws:scheduler:us-east-1:123:schedule/test',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: deletedSchedule,
            });
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();

            const result = await useCase.execute('test-script');

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1);
            expect(result.message).toBe('Schedule override removed');
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith(
                'test-script'
            );
        });

        it('should not call scheduler when no external rule exists', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: { scriptName: 'test-script' }, // No externalScheduleId
            });

            const result = await useCase.execute('test-script');

            expect(result.success).toBe(true);
            expect(mockSchedulerAdapter.deleteSchedule).not.toHaveBeenCalled();
        });

        it('should handle scheduler delete errors gracefully with warning', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: {
                    scriptName: 'test-script',
                    externalScheduleId:
                        'arn:aws:scheduler:us-east-1:123:schedule/test',
                },
            });
            mockSchedulerAdapter.deleteSchedule.mockRejectedValue(
                new Error('Scheduler delete failed')
            );

            const result = await useCase.execute('test-script');

            expect(result.success).toBe(true);
            expect(result.schedulerWarning).toBe('Scheduler delete failed');
        });

        it('always returns none after deletion, ignoring any Definition schedule', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: {
                    schedule: { enabled: true, cronExpression: '0 6 * * *' },
                },
            });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: { scriptName: 'test-script' },
            });

            const result = await useCase.execute('test-script');

            expect(result.effectiveSchedule.source).toBe('none');
            expect(result.effectiveSchedule.enabled).toBe(false);
        });

        it('should return none as effective after deletion', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: { scriptName: 'test-script' },
            });

            const result = await useCase.execute('test-script');

            expect(result.effectiveSchedule.source).toBe('none');
            expect(result.effectiveSchedule.enabled).toBe(false);
        });

        it('should return correct message when no schedule found', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 0,
                deleted: null,
            });

            const result = await useCase.execute('test-script');

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(0);
            expect(result.message).toBe('No schedule override found');
        });

        it('should throw SCRIPT_NOT_FOUND error when script does not exist', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(useCase.execute('non-existent')).rejects.toThrow(
                'Script "non-existent" not found'
            );

            try {
                await useCase.execute('non-existent');
            } catch (error) {
                expect(error.output.statusCode).toBe(404);
            }
        });
    });
});
