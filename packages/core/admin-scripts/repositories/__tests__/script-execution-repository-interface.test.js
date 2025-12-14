const { ScriptExecutionRepositoryInterface } = require('../script-execution-repository-interface');

describe('ScriptExecutionRepositoryInterface', () => {
    let repository;

    beforeEach(() => {
        repository = new ScriptExecutionRepositoryInterface();
    });

    describe('Interface contract', () => {
        it('should throw error when createExecution is not implemented', async () => {
            await expect(
                repository.createExecution({
                    scriptName: 'test-script',
                    scriptVersion: '1.0.0',
                    trigger: 'MANUAL',
                    mode: 'async',
                    input: { param1: 'value1' },
                    audit: {
                        apiKeyName: 'test-key',
                        apiKeyLast4: '1234',
                        ipAddress: '192.168.1.1',
                    },
                })
            ).rejects.toThrow('Method createExecution must be implemented by subclass');
        });

        it('should throw error when findExecutionById is not implemented', async () => {
            await expect(
                repository.findExecutionById('exec123')
            ).rejects.toThrow('Method findExecutionById must be implemented by subclass');
        });

        it('should throw error when findExecutionsByScriptName is not implemented', async () => {
            await expect(
                repository.findExecutionsByScriptName('test-script', { limit: 10 })
            ).rejects.toThrow('Method findExecutionsByScriptName must be implemented by subclass');
        });

        it('should throw error when findExecutionsByStatus is not implemented', async () => {
            await expect(
                repository.findExecutionsByStatus('PENDING', { limit: 10 })
            ).rejects.toThrow('Method findExecutionsByStatus must be implemented by subclass');
        });

        it('should throw error when updateExecutionStatus is not implemented', async () => {
            await expect(
                repository.updateExecutionStatus('exec123', 'RUNNING')
            ).rejects.toThrow('Method updateExecutionStatus must be implemented by subclass');
        });

        it('should throw error when updateExecutionOutput is not implemented', async () => {
            await expect(
                repository.updateExecutionOutput('exec123', { result: 'success' })
            ).rejects.toThrow('Method updateExecutionOutput must be implemented by subclass');
        });

        it('should throw error when updateExecutionError is not implemented', async () => {
            await expect(
                repository.updateExecutionError('exec123', {
                    name: 'Error',
                    message: 'Something went wrong',
                    stack: 'Error: ...',
                })
            ).rejects.toThrow('Method updateExecutionError must be implemented by subclass');
        });

        it('should throw error when updateExecutionMetrics is not implemented', async () => {
            await expect(
                repository.updateExecutionMetrics('exec123', {
                    startTime: new Date(),
                    endTime: new Date(),
                    durationMs: 1234,
                })
            ).rejects.toThrow('Method updateExecutionMetrics must be implemented by subclass');
        });

        it('should throw error when appendExecutionLog is not implemented', async () => {
            await expect(
                repository.appendExecutionLog('exec123', {
                    level: 'info',
                    message: 'Log message',
                    data: {},
                    timestamp: new Date().toISOString(),
                })
            ).rejects.toThrow('Method appendExecutionLog must be implemented by subclass');
        });

        it('should throw error when deleteExecutionsOlderThan is not implemented', async () => {
            await expect(
                repository.deleteExecutionsOlderThan(new Date('2024-01-01'))
            ).rejects.toThrow('Method deleteExecutionsOlderThan must be implemented by subclass');
        });
    });

    describe('Method signatures', () => {
        it('should accept all required parameters in createExecution', async () => {
            const params = {
                scriptName: 'test-script',
                scriptVersion: '1.0.0',
                trigger: 'MANUAL',
                mode: 'async',
                input: { param1: 'value1' },
                audit: {
                    apiKeyName: 'test-key',
                    apiKeyLast4: '1234',
                    ipAddress: '192.168.1.1',
                },
            };

            await expect(repository.createExecution(params)).rejects.toThrow();
        });

        it('should accept string parameter in findExecutionById', async () => {
            await expect(
                repository.findExecutionById('some-id')
            ).rejects.toThrow();
        });

        it('should accept scriptName and options in findExecutionsByScriptName', async () => {
            await expect(
                repository.findExecutionsByScriptName('test-script', {
                    limit: 10,
                    offset: 0,
                })
            ).rejects.toThrow();
        });

        it('should accept status and options in findExecutionsByStatus', async () => {
            await expect(
                repository.findExecutionsByStatus('PENDING', {
                    limit: 10,
                    offset: 0,
                })
            ).rejects.toThrow();
        });

        it('should accept id and status in updateExecutionStatus', async () => {
            await expect(
                repository.updateExecutionStatus('exec123', 'COMPLETED')
            ).rejects.toThrow();
        });

        it('should accept id and output in updateExecutionOutput', async () => {
            await expect(
                repository.updateExecutionOutput('exec123', { result: 'success' })
            ).rejects.toThrow();
        });

        it('should accept id and error in updateExecutionError', async () => {
            await expect(
                repository.updateExecutionError('exec123', {
                    name: 'Error',
                    message: 'Failed',
                    stack: 'Stack trace',
                })
            ).rejects.toThrow();
        });

        it('should accept id and metrics in updateExecutionMetrics', async () => {
            await expect(
                repository.updateExecutionMetrics('exec123', {
                    startTime: new Date(),
                    endTime: new Date(),
                    durationMs: 5000,
                })
            ).rejects.toThrow();
        });

        it('should accept id and logEntry in appendExecutionLog', async () => {
            await expect(
                repository.appendExecutionLog('exec123', {
                    level: 'info',
                    message: 'Test log',
                    data: { key: 'value' },
                    timestamp: new Date().toISOString(),
                })
            ).rejects.toThrow();
        });

        it('should accept Date parameter in deleteExecutionsOlderThan', async () => {
            await expect(
                repository.deleteExecutionsOlderThan(new Date('2024-01-01'))
            ).rejects.toThrow();
        });
    });
});
