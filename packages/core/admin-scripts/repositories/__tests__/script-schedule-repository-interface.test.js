const { ScriptScheduleRepositoryInterface } = require('../script-schedule-repository-interface');

describe('ScriptScheduleRepositoryInterface', () => {
    let repository;

    beforeEach(() => {
        repository = new ScriptScheduleRepositoryInterface();
    });

    describe('Interface contract', () => {
        it('should throw error when findScheduleByScriptName is not implemented', async () => {
            await expect(
                repository.findScheduleByScriptName('test-script')
            ).rejects.toThrow('Method findScheduleByScriptName must be implemented by subclass');
        });

        it('should throw error when upsertSchedule is not implemented', async () => {
            await expect(
                repository.upsertSchedule({
                    scriptName: 'test-script',
                    enabled: true,
                    cronExpression: '0 0 * * *',
                    timezone: 'UTC',
                })
            ).rejects.toThrow('Method upsertSchedule must be implemented by subclass');
        });

        it('should throw error when deleteSchedule is not implemented', async () => {
            await expect(
                repository.deleteSchedule('test-script')
            ).rejects.toThrow('Method deleteSchedule must be implemented by subclass');
        });

        it('should throw error when updateScheduleAwsRule is not implemented', async () => {
            await expect(
                repository.updateScheduleAwsRule('test-script', {
                    awsRuleArn: 'arn:aws:events:us-east-1:123456789012:rule/test-rule',
                    awsRuleName: 'test-rule',
                })
            ).rejects.toThrow('Method updateScheduleAwsRule must be implemented by subclass');
        });

        it('should throw error when updateScheduleLastTriggered is not implemented', async () => {
            await expect(
                repository.updateScheduleLastTriggered('test-script', new Date())
            ).rejects.toThrow('Method updateScheduleLastTriggered must be implemented by subclass');
        });

        it('should throw error when updateScheduleNextTrigger is not implemented', async () => {
            await expect(
                repository.updateScheduleNextTrigger('test-script', new Date())
            ).rejects.toThrow('Method updateScheduleNextTrigger must be implemented by subclass');
        });

        it('should throw error when listSchedules is not implemented', async () => {
            await expect(
                repository.listSchedules()
            ).rejects.toThrow('Method listSchedules must be implemented by subclass');
        });
    });

    describe('Method signatures', () => {
        it('should accept scriptName in findScheduleByScriptName', async () => {
            await expect(
                repository.findScheduleByScriptName('test-script')
            ).rejects.toThrow();
        });

        it('should accept all required parameters in upsertSchedule', async () => {
            const params = {
                scriptName: 'test-script',
                enabled: true,
                cronExpression: '0 0 * * *',
                timezone: 'America/New_York',
                awsRuleArn: 'arn:aws:events:us-east-1:123456789012:rule/test',
                awsRuleName: 'test-rule',
            };

            await expect(repository.upsertSchedule(params)).rejects.toThrow();
        });

        it('should accept scriptName in deleteSchedule', async () => {
            await expect(
                repository.deleteSchedule('test-script')
            ).rejects.toThrow();
        });

        it('should accept scriptName and awsInfo in updateScheduleAwsRule', async () => {
            await expect(
                repository.updateScheduleAwsRule('test-script', {
                    awsRuleArn: 'arn:aws:events:us-east-1:123456789012:rule/test',
                    awsRuleName: 'test-rule',
                })
            ).rejects.toThrow();
        });

        it('should accept scriptName and timestamp in updateScheduleLastTriggered', async () => {
            await expect(
                repository.updateScheduleLastTriggered('test-script', new Date())
            ).rejects.toThrow();
        });

        it('should accept scriptName and timestamp in updateScheduleNextTrigger', async () => {
            await expect(
                repository.updateScheduleNextTrigger('test-script', new Date())
            ).rejects.toThrow();
        });

        it('should accept options in listSchedules', async () => {
            await expect(
                repository.listSchedules({ enabledOnly: true })
            ).rejects.toThrow();
        });

        it('should accept no parameters in listSchedules', async () => {
            await expect(repository.listSchedules()).rejects.toThrow();
        });
    });
});
