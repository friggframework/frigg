const { UpsertScheduleUseCase } = require('../upsert-schedule-use-case');

describe('UpsertScheduleUseCase', () => {
    let useCase;
    let mockCommands;
    let mockSchedulerAdapter;
    let mockScriptFactory;

    beforeEach(() => {
        mockCommands = {
            upsertSchedule: jest.fn(),
            updateScheduleExternalInfo: jest.fn(),
        };

        mockSchedulerAdapter = {
            createSchedule: jest.fn(),
            deleteSchedule: jest.fn(),
        };

        mockScriptFactory = {
            has: jest.fn(),
            get: jest.fn(),
        };

        useCase = new UpsertScheduleUseCase({
            commands: mockCommands,
            schedulerAdapter: mockSchedulerAdapter,
            scriptFactory: mockScriptFactory,
        });
    });

    describe('execute', () => {
        it('should create schedule and provision external scheduler when enabled', async () => {
            const savedSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue(savedSchedule);
            mockSchedulerAdapter.createSchedule.mockResolvedValue({
                scheduleArn: 'arn:aws:scheduler:us-east-1:123:schedule/test',
                scheduleName: 'frigg-script-test-script',
            });
            mockCommands.updateScheduleExternalInfo.mockResolvedValue({
                ...savedSchedule,
                externalScheduleId:
                    'arn:aws:scheduler:us-east-1:123:schedule/test',
            });

            const result = await useCase.execute('test-script', {
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });

            expect(result.success).toBe(true);
            expect(result.schedule.scriptName).toBe('test-script');
            expect(mockSchedulerAdapter.createSchedule).toHaveBeenCalledWith({
                scriptName: 'test-script',
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });
            expect(mockCommands.updateScheduleExternalInfo).toHaveBeenCalled();
        });

        it('should default timezone to UTC', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue({
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });
            mockSchedulerAdapter.createSchedule.mockResolvedValue({
                scheduleArn: 'arn:test',
                scheduleName: 'test',
            });

            await useCase.execute('test-script', {
                enabled: true,
                cronExpression: '0 12 * * *',
            });

            expect(mockSchedulerAdapter.createSchedule).toHaveBeenCalledWith({
                scriptName: 'test-script',
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            });
        });

        it('should delete external scheduler when disabling', async () => {
            const existingSchedule = {
                scriptName: 'test-script',
                enabled: false,
                cronExpression: null,
                timezone: 'UTC',
                externalScheduleId:
                    'arn:aws:scheduler:us-east-1:123:schedule/test',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue(existingSchedule);
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();
            mockCommands.updateScheduleExternalInfo.mockResolvedValue({
                ...existingSchedule,
                externalScheduleId: null,
            });

            const result = await useCase.execute('test-script', {
                enabled: false,
            });

            expect(result.success).toBe(true);
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith(
                'test-script'
            );
        });

        it('should handle scheduler errors gracefully with warning', async () => {
            const savedSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue(savedSchedule);
            mockSchedulerAdapter.createSchedule.mockRejectedValue(
                new Error('Scheduler API error')
            );

            const result = await useCase.execute('test-script', {
                enabled: true,
                cronExpression: '0 12 * * *',
            });

            // Should succeed with warning, not fail
            expect(result.success).toBe(true);
            expect(result.schedulerWarning).toBe('Scheduler API error');
        });

        it('should throw SCRIPT_NOT_FOUND error when script does not exist', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(
                useCase.execute('non-existent', { enabled: true })
            ).rejects.toThrow('Script "non-existent" not found');

            try {
                await useCase.execute('non-existent', { enabled: true });
            } catch (error) {
                expect(error.code).toBe('SCRIPT_NOT_FOUND');
            }
        });

        it('should throw INVALID_INPUT error when enabled is not a boolean', async () => {
            mockScriptFactory.has.mockReturnValue(true);

            await expect(
                useCase.execute('test-script', { enabled: 'yes' })
            ).rejects.toThrow('enabled must be a boolean');

            try {
                await useCase.execute('test-script', { enabled: 'yes' });
            } catch (error) {
                expect(error.code).toBe('INVALID_INPUT');
            }
        });

        it('should throw INVALID_INPUT error when enabled without cronExpression', async () => {
            mockScriptFactory.has.mockReturnValue(true);

            await expect(
                useCase.execute('test-script', { enabled: true })
            ).rejects.toThrow(
                'cronExpression is required when enabled is true'
            );

            try {
                await useCase.execute('test-script', { enabled: true });
            } catch (error) {
                expect(error.code).toBe('INVALID_INPUT');
            }
        });

        it('should not require cronExpression when disabled', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue({
                scriptName: 'test-script',
                enabled: false,
                cronExpression: null,
                timezone: 'UTC',
            });

            const result = await useCase.execute('test-script', {
                enabled: false,
            });

            expect(result.success).toBe(true);
            expect(mockCommands.upsertSchedule).toHaveBeenCalledWith({
                scriptName: 'test-script',
                enabled: false,
                cronExpression: null,
                timezone: 'UTC',
            });
        });
    });
});
