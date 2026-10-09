const { AdminScriptExecutionRepositoryInterface } = require('../admin-script-execution-repository-interface');

describe('AdminScriptExecutionRepositoryInterface', () => {
    let repository;

    beforeEach(() => {
        repository = new AdminScriptExecutionRepositoryInterface();
    });

    describe('Interface contract', () => {
        it('should throw error when createExecution is not implemented', async () => {
            await expect(
                repository.createExecution({
                    name: 'test-script',
                    type: 'ADMIN_SCRIPT',
                    context: {
                        scriptVersion: '1.0.0',
                        trigger: 'MANUAL',
                        mode: 'async',
                        input: { param1: 'value1' },
                        audit: {
                            apiKeyName: 'test-key',
                            apiKeyLast4: '1234',
                            ipAddress: '192.168.1.1',
                        },
                    },
                })
            ).rejects.toThrow('Method createExecution must be implemented by subclass');
        });

        it('should throw error when findExecutionById is not implemented', async () => {
            await expect(
                repository.findExecutionById('proc123')
            ).rejects.toThrow('Method findExecutionById must be implemented by subclass');
        });

        it('should throw error when findExecutionsByName is not implemented', async () => {
            await expect(
                repository.findExecutionsByName('test-script', { limit: 10 })
            ).rejects.toThrow('Method findExecutionsByName must be implemented by subclass');
        });

        it('should throw error when findExecutionsByState is not implemented', async () => {
            await expect(
                repository.findExecutionsByState('PENDING', { limit: 10 })
            ).rejects.toThrow('Method findExecutionsByState must be implemented by subclass');
        });

        it('should throw error when updateExecutionState is not implemented', async () => {
            await expect(
                repository.updateExecutionState('proc123', 'RUNNING')
            ).rejects.toThrow('Method updateExecutionState must be implemented by subclass');
        });

        it('should throw error when updateExecutionResults is not implemented', async () => {
            await expect(
                repository.updateExecutionResults('proc123', { output: { result: 'success' } })
            ).rejects.toThrow('Method updateExecutionResults must be implemented by subclass');
        });

        it('should throw error when appendExecutionLog is not implemented', async () => {
            await expect(
                repository.appendExecutionLog('proc123', {
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
                name: 'test-script',
                type: 'ADMIN_SCRIPT',
                context: {
                    scriptVersion: '1.0.0',
                    trigger: 'MANUAL',
                    mode: 'async',
                    input: { param1: 'value1' },
                    audit: {
                        apiKeyName: 'test-key',
                        apiKeyLast4: '1234',
                        ipAddress: '192.168.1.1',
                    },
                },
            };

            await expect(repository.createExecution(params)).rejects.toThrow();
        });

        it('should accept string parameter in findExecutionById', async () => {
            await expect(
                repository.findExecutionById('some-id')
            ).rejects.toThrow();
        });

        it('should accept name and options in findExecutionsByName', async () => {
            await expect(
                repository.findExecutionsByName('test-script', {
                    limit: 10,
                    offset: 0,
                })
            ).rejects.toThrow();
        });

        it('should accept state and options in findExecutionsByState', async () => {
            await expect(
                repository.findExecutionsByState('PENDING', {
                    limit: 10,
                    offset: 0,
                })
            ).rejects.toThrow();
        });

        it('should accept id and state in updateExecutionState', async () => {
            await expect(
                repository.updateExecutionState('proc123', 'COMPLETED')
            ).rejects.toThrow();
        });

        it('should accept id and results in updateExecutionResults', async () => {
            await expect(
                repository.updateExecutionResults('proc123', { output: { result: 'success' } })
            ).rejects.toThrow();
        });

        it('should accept id and logEntry in appendExecutionLog', async () => {
            await expect(
                repository.appendExecutionLog('proc123', {
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
