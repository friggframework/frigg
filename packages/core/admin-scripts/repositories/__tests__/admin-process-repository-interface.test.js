const { AdminProcessRepositoryInterface } = require('../admin-process-repository-interface');

describe('AdminProcessRepositoryInterface', () => {
    let repository;

    beforeEach(() => {
        repository = new AdminProcessRepositoryInterface();
    });

    describe('Interface contract', () => {
        it('should throw error when createProcess is not implemented', async () => {
            await expect(
                repository.createProcess({
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
            ).rejects.toThrow('Method createProcess must be implemented by subclass');
        });

        it('should throw error when findProcessById is not implemented', async () => {
            await expect(
                repository.findProcessById('proc123')
            ).rejects.toThrow('Method findProcessById must be implemented by subclass');
        });

        it('should throw error when findProcessesByName is not implemented', async () => {
            await expect(
                repository.findProcessesByName('test-script', { limit: 10 })
            ).rejects.toThrow('Method findProcessesByName must be implemented by subclass');
        });

        it('should throw error when findProcessesByState is not implemented', async () => {
            await expect(
                repository.findProcessesByState('PENDING', { limit: 10 })
            ).rejects.toThrow('Method findProcessesByState must be implemented by subclass');
        });

        it('should throw error when updateProcessState is not implemented', async () => {
            await expect(
                repository.updateProcessState('proc123', 'RUNNING')
            ).rejects.toThrow('Method updateProcessState must be implemented by subclass');
        });

        it('should throw error when updateProcessResults is not implemented', async () => {
            await expect(
                repository.updateProcessResults('proc123', { output: { result: 'success' } })
            ).rejects.toThrow('Method updateProcessResults must be implemented by subclass');
        });

        it('should throw error when appendProcessLog is not implemented', async () => {
            await expect(
                repository.appendProcessLog('proc123', {
                    level: 'info',
                    message: 'Log message',
                    data: {},
                    timestamp: new Date().toISOString(),
                })
            ).rejects.toThrow('Method appendProcessLog must be implemented by subclass');
        });

        it('should throw error when deleteProcessesOlderThan is not implemented', async () => {
            await expect(
                repository.deleteProcessesOlderThan(new Date('2024-01-01'))
            ).rejects.toThrow('Method deleteProcessesOlderThan must be implemented by subclass');
        });
    });

    describe('Method signatures', () => {
        it('should accept all required parameters in createProcess', async () => {
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

            await expect(repository.createProcess(params)).rejects.toThrow();
        });

        it('should accept string parameter in findProcessById', async () => {
            await expect(
                repository.findProcessById('some-id')
            ).rejects.toThrow();
        });

        it('should accept name and options in findProcessesByName', async () => {
            await expect(
                repository.findProcessesByName('test-script', {
                    limit: 10,
                    offset: 0,
                })
            ).rejects.toThrow();
        });

        it('should accept state and options in findProcessesByState', async () => {
            await expect(
                repository.findProcessesByState('PENDING', {
                    limit: 10,
                    offset: 0,
                })
            ).rejects.toThrow();
        });

        it('should accept id and state in updateProcessState', async () => {
            await expect(
                repository.updateProcessState('proc123', 'COMPLETED')
            ).rejects.toThrow();
        });

        it('should accept id and results in updateProcessResults', async () => {
            await expect(
                repository.updateProcessResults('proc123', { output: { result: 'success' } })
            ).rejects.toThrow();
        });

        it('should accept id and logEntry in appendProcessLog', async () => {
            await expect(
                repository.appendProcessLog('proc123', {
                    level: 'info',
                    message: 'Test log',
                    data: { key: 'value' },
                    timestamp: new Date().toISOString(),
                })
            ).rejects.toThrow();
        });

        it('should accept Date parameter in deleteProcessesOlderThan', async () => {
            await expect(
                repository.deleteProcessesOlderThan(new Date('2024-01-01'))
            ).rejects.toThrow();
        });
    });
});
