const { LocalSchedulerAdapter } = require('../local-scheduler-adapter');
const { SchedulerAdapter } = require('../scheduler-adapter');

describe('LocalSchedulerAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new LocalSchedulerAdapter();
    });

    afterEach(() => {
        adapter.clear();
    });

    describe('Inheritance', () => {
        it('should extend SchedulerAdapter', () => {
            expect(adapter).toBeInstanceOf(SchedulerAdapter);
        });

        it('should have correct adapter name', () => {
            expect(adapter.getName()).toBe('local-cron');
        });
    });

    describe('createSchedule()', () => {
        it('should create a schedule with required fields', async () => {
            const config = {
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            };

            const result = await adapter.createSchedule(config);

            expect(result).toEqual({
                ruleName: 'test-script',
                ruleArn: 'local:schedule:test-script',
            });
            expect(adapter.size).toBe(1);
        });

        it('should create a schedule with all optional fields', async () => {
            const config = {
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
                timezone: 'America/New_York',
                input: { key: 'value' },
            };

            const result = await adapter.createSchedule(config);

            expect(result).toEqual({
                ruleName: 'test-script',
                ruleArn: 'local:schedule:test-script',
            });

            const schedule = await adapter.getSchedule('test-script');
            expect(schedule.ScheduleExpressionTimezone).toBe('America/New_York');
            expect(JSON.parse(schedule.Target.Input).params).toEqual({ key: 'value' });
        });

        it('should default timezone to UTC', async () => {
            const config = {
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            };

            await adapter.createSchedule(config);
            const schedule = await adapter.getSchedule('test-script');

            expect(schedule.ScheduleExpressionTimezone).toBe('UTC');
        });

        it('should enable schedule by default', async () => {
            const config = {
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            };

            await adapter.createSchedule(config);
            const schedule = await adapter.getSchedule('test-script');

            expect(schedule.State).toBe('ENABLED');
        });

        it('should update existing schedule if created again', async () => {
            const config1 = {
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            };

            const config2 = {
                scriptName: 'test-script',
                cronExpression: '0 12 * * *',
            };

            await adapter.createSchedule(config1);
            expect(adapter.size).toBe(1);

            await adapter.createSchedule(config2);
            expect(adapter.size).toBe(1); // Still only 1 schedule

            const schedule = await adapter.getSchedule('test-script');
            expect(schedule.ScheduleExpression).toBe('0 12 * * *');
        });
    });

    describe('deleteSchedule()', () => {
        it('should delete an existing schedule', async () => {
            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            });

            expect(adapter.size).toBe(1);

            await adapter.deleteSchedule('test-script');

            expect(adapter.size).toBe(0);
        });

        it('should not throw error when deleting non-existent schedule', async () => {
            await expect(adapter.deleteSchedule('non-existent')).resolves.toBeUndefined();
        });

        it('should clear intervals if they exist', async () => {
            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            });

            // Simulate an interval
            const intervalId = setInterval(() => {}, 1000);
            adapter.intervals.set('test-script', intervalId);

            await adapter.deleteSchedule('test-script');

            expect(adapter.intervals.has('test-script')).toBe(false);
            expect(adapter.size).toBe(0);
        });
    });

    describe('setScheduleEnabled()', () => {
        beforeEach(async () => {
            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
            });
        });

        it('should disable a schedule', async () => {
            await adapter.setScheduleEnabled('test-script', false);

            const schedule = await adapter.getSchedule('test-script');
            expect(schedule.State).toBe('DISABLED');
        });

        it('should enable a schedule', async () => {
            await adapter.setScheduleEnabled('test-script', false);
            await adapter.setScheduleEnabled('test-script', true);

            const schedule = await adapter.getSchedule('test-script');
            expect(schedule.State).toBe('ENABLED');
        });

        it('should throw error if schedule not found', async () => {
            await expect(
                adapter.setScheduleEnabled('non-existent', true)
            ).rejects.toThrow('Schedule for script "non-existent" not found');
        });

        it('should update the updatedAt timestamp', async () => {
            const schedule1 = await adapter.getSchedule('test-script');
            const originalUpdatedAt = schedule1.LastModificationDate;

            // Wait a bit to ensure timestamp changes
            await new Promise((resolve) => setTimeout(resolve, 10));

            await adapter.setScheduleEnabled('test-script', false);

            const schedule2 = await adapter.getSchedule('test-script');
            expect(schedule2.LastModificationDate.getTime()).toBeGreaterThan(
                originalUpdatedAt.getTime()
            );
        });
    });

    describe('listSchedules()', () => {
        it('should return empty array when no schedules exist', async () => {
            const schedules = await adapter.listSchedules();

            expect(schedules).toEqual([]);
        });

        it('should return all schedules', async () => {
            await adapter.createSchedule({
                scriptName: 'script-1',
                cronExpression: '0 0 * * *',
            });

            await adapter.createSchedule({
                scriptName: 'script-2',
                cronExpression: '0 12 * * *',
            });

            await adapter.createSchedule({
                scriptName: 'script-3',
                cronExpression: '0 18 * * *',
            });

            const schedules = await adapter.listSchedules();

            expect(schedules).toHaveLength(3);
            expect(schedules.map((s) => s.scriptName)).toContain('script-1');
            expect(schedules.map((s) => s.scriptName)).toContain('script-2');
            expect(schedules.map((s) => s.scriptName)).toContain('script-3');
        });

        it('should include all schedule properties', async () => {
            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
                timezone: 'America/New_York',
                input: { key: 'value' },
            });

            const schedules = await adapter.listSchedules();

            expect(schedules[0]).toMatchObject({
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
                timezone: 'America/New_York',
                input: { key: 'value' },
                enabled: true,
            });
            expect(schedules[0]).toHaveProperty('createdAt');
            expect(schedules[0]).toHaveProperty('updatedAt');
        });
    });

    describe('getSchedule()', () => {
        beforeEach(async () => {
            await adapter.createSchedule({
                scriptName: 'test-script',
                cronExpression: '0 0 * * *',
                timezone: 'America/New_York',
                input: { key: 'value' },
            });
        });

        it('should return schedule details', async () => {
            const schedule = await adapter.getSchedule('test-script');

            expect(schedule.Name).toBe('test-script');
            expect(schedule.State).toBe('ENABLED');
            expect(schedule.ScheduleExpression).toBe('0 0 * * *');
            expect(schedule.ScheduleExpressionTimezone).toBe('America/New_York');
        });

        it('should include target configuration', async () => {
            const schedule = await adapter.getSchedule('test-script');

            const targetInput = JSON.parse(schedule.Target.Input);
            expect(targetInput).toEqual({
                scriptName: 'test-script',
                trigger: 'SCHEDULED',
                params: { key: 'value' },
            });
        });

        it('should include creation and modification dates', async () => {
            const schedule = await adapter.getSchedule('test-script');

            expect(schedule.CreationDate).toBeInstanceOf(Date);
            expect(schedule.LastModificationDate).toBeInstanceOf(Date);
        });

        it('should throw error if schedule not found', async () => {
            await expect(adapter.getSchedule('non-existent')).rejects.toThrow(
                'Schedule for script "non-existent" not found'
            );
        });
    });

    describe('Utility methods', () => {
        it('clear() should remove all schedules', async () => {
            await adapter.createSchedule({
                scriptName: 'script-1',
                cronExpression: '0 0 * * *',
            });

            await adapter.createSchedule({
                scriptName: 'script-2',
                cronExpression: '0 12 * * *',
            });

            expect(adapter.size).toBe(2);

            adapter.clear();

            expect(adapter.size).toBe(0);
        });

        it('size should return number of schedules', async () => {
            expect(adapter.size).toBe(0);

            await adapter.createSchedule({
                scriptName: 'script-1',
                cronExpression: '0 0 * * *',
            });

            expect(adapter.size).toBe(1);

            await adapter.createSchedule({
                scriptName: 'script-2',
                cronExpression: '0 12 * * *',
            });

            expect(adapter.size).toBe(2);

            await adapter.deleteSchedule('script-1');

            expect(adapter.size).toBe(1);
        });
    });
});
