const { ScheduleManagementUseCase } = require('../schedule-management-use-case');

describe('ScheduleManagementUseCase', () => {
    let useCase;
    let mockCommands;
    let mockSchedulerAdapter;
    let mockScriptFactory;

    beforeEach(() => {
        mockCommands = {
            getScheduleByScriptName: jest.fn(),
            upsertSchedule: jest.fn(),
            updateScheduleAwsInfo: jest.fn(),
            deleteSchedule: jest.fn(),
        };

        mockSchedulerAdapter = {
            createSchedule: jest.fn(),
            deleteSchedule: jest.fn(),
        };

        mockScriptFactory = {
            has: jest.fn(),
            get: jest.fn(),
        };

        useCase = new ScheduleManagementUseCase({
            commands: mockCommands,
            schedulerAdapter: mockSchedulerAdapter,
            scriptFactory: mockScriptFactory,
        });
    });

    describe('getEffectiveSchedule', () => {
        it('should return database schedule when override exists', async () => {
            const dbSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 9 * * *',
                timezone: 'UTC',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.getScheduleByScriptName.mockResolvedValue(dbSchedule);

            const result = await useCase.getEffectiveSchedule('test-script');

            expect(result.source).toBe('database');
            expect(result.schedule).toEqual(dbSchedule);
        });

        it('should return definition schedule when no database override', async () => {
            const definitionSchedule = {
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'America/New_York',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: { schedule: definitionSchedule },
            });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.getEffectiveSchedule('test-script');

            expect(result.source).toBe('definition');
            expect(result.schedule.enabled).toBe(true);
            expect(result.schedule.cronExpression).toBe('0 12 * * *');
        });

        it('should return none when no schedule configured', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.getScheduleByScriptName.mockResolvedValue(null);

            const result = await useCase.getEffectiveSchedule('test-script');

            expect(result.source).toBe('none');
            expect(result.schedule.enabled).toBe(false);
        });

        it('should throw error when script not found', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(useCase.getEffectiveSchedule('non-existent'))
                .rejects.toThrow('Script "non-existent" not found');
        });
    });

    describe('upsertSchedule', () => {
        it('should create schedule and provision EventBridge when enabled', async () => {
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
            mockCommands.updateScheduleAwsInfo.mockResolvedValue({
                ...savedSchedule,
                awsScheduleArn: 'arn:aws:scheduler:us-east-1:123:schedule/test',
            });

            const result = await useCase.upsertSchedule('test-script', {
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
            expect(mockCommands.updateScheduleAwsInfo).toHaveBeenCalled();
        });

        it('should delete EventBridge schedule when disabling', async () => {
            const existingSchedule = {
                scriptName: 'test-script',
                enabled: false,
                cronExpression: null,
                timezone: 'UTC',
                awsScheduleArn: 'arn:aws:scheduler:us-east-1:123:schedule/test',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue(existingSchedule);
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();
            mockCommands.updateScheduleAwsInfo.mockResolvedValue({
                ...existingSchedule,
                awsScheduleArn: null,
            });

            const result = await useCase.upsertSchedule('test-script', {
                enabled: false,
            });

            expect(result.success).toBe(true);
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith('test-script');
        });

        it('should handle scheduler errors gracefully', async () => {
            const savedSchedule = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 12 * * *',
                timezone: 'UTC',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockCommands.upsertSchedule.mockResolvedValue(savedSchedule);
            mockSchedulerAdapter.createSchedule.mockRejectedValue(
                new Error('AWS Scheduler API error')
            );

            const result = await useCase.upsertSchedule('test-script', {
                enabled: true,
                cronExpression: '0 12 * * *',
            });

            // Should succeed with warning, not fail
            expect(result.success).toBe(true);
            expect(result.schedulerWarning).toBe('AWS Scheduler API error');
        });

        it('should throw error when script not found', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(useCase.upsertSchedule('non-existent', { enabled: true }))
                .rejects.toThrow('Script "non-existent" not found');
        });

        it('should throw error when enabled without cronExpression', async () => {
            mockScriptFactory.has.mockReturnValue(true);

            await expect(useCase.upsertSchedule('test-script', { enabled: true }))
                .rejects.toThrow('cronExpression is required when enabled is true');
        });
    });

    describe('deleteSchedule', () => {
        it('should delete schedule and EventBridge rule', async () => {
            const deletedSchedule = {
                scriptName: 'test-script',
                awsScheduleArn: 'arn:aws:scheduler:us-east-1:123:schedule/test',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: deletedSchedule,
            });
            mockSchedulerAdapter.deleteSchedule.mockResolvedValue();

            const result = await useCase.deleteSchedule('test-script');

            expect(result.success).toBe(true);
            expect(result.deletedCount).toBe(1);
            expect(mockSchedulerAdapter.deleteSchedule).toHaveBeenCalledWith('test-script');
        });

        it('should not call scheduler when no AWS rule exists', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: { scriptName: 'test-script' }, // No awsScheduleArn
            });

            const result = await useCase.deleteSchedule('test-script');

            expect(result.success).toBe(true);
            expect(mockSchedulerAdapter.deleteSchedule).not.toHaveBeenCalled();
        });

        it('should handle scheduler delete errors gracefully', async () => {
            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({ Definition: {} });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: {
                    scriptName: 'test-script',
                    awsScheduleArn: 'arn:aws:scheduler:us-east-1:123:schedule/test',
                },
            });
            mockSchedulerAdapter.deleteSchedule.mockRejectedValue(
                new Error('AWS delete failed')
            );

            const result = await useCase.deleteSchedule('test-script');

            expect(result.success).toBe(true);
            expect(result.schedulerWarning).toBe('AWS delete failed');
        });

        it('should return effective schedule after deletion', async () => {
            const definitionSchedule = {
                enabled: true,
                cronExpression: '0 6 * * *',
            };

            mockScriptFactory.has.mockReturnValue(true);
            mockScriptFactory.get.mockReturnValue({
                Definition: { schedule: definitionSchedule },
            });
            mockCommands.deleteSchedule.mockResolvedValue({
                deletedCount: 1,
                deleted: { scriptName: 'test-script' },
            });

            const result = await useCase.deleteSchedule('test-script');

            expect(result.effectiveSchedule.source).toBe('definition');
            expect(result.effectiveSchedule.enabled).toBe(true);
        });

        it('should throw error when script not found', async () => {
            mockScriptFactory.has.mockReturnValue(false);

            await expect(useCase.deleteSchedule('non-existent'))
                .rejects.toThrow('Script "non-existent" not found');
        });
    });
});
