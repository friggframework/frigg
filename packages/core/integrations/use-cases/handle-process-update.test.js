const { HandleProcessUpdate } = require('./handle-process-update');
const { ProcessUpdateMessage, ProcessUpdateOperation } = require('../domain/process-update-message');

describe('HandleProcessUpdate', () => {
    let useCase;
    let mockUpdateProcessState;
    let mockUpdateProcessMetrics;

    beforeEach(() => {
        // Create mocks for dependencies
        mockUpdateProcessState = {
            execute: jest.fn().mockResolvedValue({ id: 'proc-123', state: 'RUNNING' }),
        };

        mockUpdateProcessMetrics = {
            execute: jest.fn().mockResolvedValue({ id: 'proc-123', results: {} }),
        };

        // Create use case with mocked dependencies
        useCase = new HandleProcessUpdate({
            updateProcessState: mockUpdateProcessState,
            updateProcessMetrics: mockUpdateProcessMetrics,
        });
    });

    describe('constructor', () => {
        it('should require updateProcessState', () => {
            expect(() => new HandleProcessUpdate({
                updateProcessMetrics: mockUpdateProcessMetrics,
            })).toThrow('updateProcessState is required');
        });

        it('should require updateProcessMetrics', () => {
            expect(() => new HandleProcessUpdate({
                updateProcessState: mockUpdateProcessState,
            })).toThrow('updateProcessMetrics is required');
        });

        it('should create use case with dependencies', () => {
            const uc = new HandleProcessUpdate({
                updateProcessState: mockUpdateProcessState,
                updateProcessMetrics: mockUpdateProcessMetrics,
            });

            expect(uc.updateProcessState).toBe(mockUpdateProcessState);
            expect(uc.updateProcessMetrics).toBe(mockUpdateProcessMetrics);
        });
    });

    describe('execute', () => {
        describe('UPDATE_STATE operation', () => {
            it('should handle UPDATE_STATE message', async () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_STATE,
                    data: {
                        state: 'RUNNING',
                        contextUpdates: { step: 1 },
                    },
                });

                await useCase.execute(message);

                expect(mockUpdateProcessState.execute).toHaveBeenCalledWith(
                    'proc-123',
                    'RUNNING',
                    { step: 1 }
                );
                expect(mockUpdateProcessMetrics.execute).not.toHaveBeenCalled();
            });

            it('should handle UPDATE_STATE without context updates', async () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_STATE,
                    data: {
                        state: 'RUNNING',
                        contextUpdates: {},
                    },
                });

                await useCase.execute(message);

                expect(mockUpdateProcessState.execute).toHaveBeenCalledWith(
                    'proc-123',
                    'RUNNING',
                    {}
                );
            });
        });

        describe('UPDATE_METRICS operation', () => {
            it('should handle UPDATE_METRICS message', async () => {
                const metricsUpdate = {
                    totalProcessed: 100,
                    totalFailed: 2,
                };

                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_METRICS,
                    data: {
                        metricsUpdate,
                    },
                });

                await useCase.execute(message);

                expect(mockUpdateProcessMetrics.execute).toHaveBeenCalledWith(
                    'proc-123',
                    metricsUpdate
                );
                expect(mockUpdateProcessState.execute).not.toHaveBeenCalled();
            });
        });

        describe('COMPLETE_PROCESS operation', () => {
            it('should handle COMPLETE_PROCESS message', async () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.COMPLETE_PROCESS,
                    data: {},
                });

                await useCase.execute(message);

                expect(mockUpdateProcessState.execute).toHaveBeenCalledWith(
                    'proc-123',
                    'COMPLETED',
                    expect.objectContaining({
                        endTime: expect.any(String),
                    })
                );
            });

            it('should set endTime as ISO string', async () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.COMPLETE_PROCESS,
                    data: {},
                });

                await useCase.execute(message);

                const contextUpdates = mockUpdateProcessState.execute.mock.calls[0][2];
                expect(contextUpdates.endTime).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
            });
        });

        describe('HANDLE_ERROR operation', () => {
            it('should handle HANDLE_ERROR message', async () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.HANDLE_ERROR,
                    data: {
                        error: {
                            message: 'Test error',
                            stack: 'Error stack trace',
                        },
                    },
                });

                await useCase.execute(message);

                expect(mockUpdateProcessState.execute).toHaveBeenCalledWith(
                    'proc-123',
                    'ERROR',
                    expect.objectContaining({
                        error: 'Test error',
                        errorStack: 'Error stack trace',
                        errorTimestamp: expect.any(String),
                    })
                );
            });

            it('should handle errors without stack trace', async () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.HANDLE_ERROR,
                    data: {
                        error: {
                            message: 'Test error',
                        },
                    },
                });

                await useCase.execute(message);

                const contextUpdates = mockUpdateProcessState.execute.mock.calls[0][2];
                expect(contextUpdates.error).toBe('Test error');
                expect(contextUpdates.errorStack).toBeUndefined();
            });
        });

        describe('validation', () => {
            it('should throw if message is not ProcessUpdateMessage', async () => {
                await expect(useCase.execute({ invalid: 'message' }))
                    .rejects.toThrow('message must be an instance of ProcessUpdateMessage');
            });

            it('should throw for unknown operation type', async () => {
                // Create a mock message with invalid operation
                const invalidMessage = {
                    processId: 'proc-123',
                    operation: 'UNKNOWN_OP',
                    data: {},
                    getMessageGroupId: jest.fn(),
                    getMessageDeduplicationId: jest.fn(),
                };

                // Override instanceof check temporarily for this test
                Object.setPrototypeOf(invalidMessage, ProcessUpdateMessage.prototype);

                await expect(useCase.execute(invalidMessage))
                    .rejects.toThrow('Unknown operation type: UNKNOWN_OP');
            });
        });

        describe('error handling', () => {
            it('should propagate UpdateProcessState errors', async () => {
                mockUpdateProcessState.execute.mockRejectedValue(
                    new Error('State update failed')
                );

                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_STATE,
                    data: { state: 'RUNNING', contextUpdates: {} },
                });

                await expect(useCase.execute(message))
                    .rejects.toThrow('Failed to handle process update: State update failed');
            });

            it('should propagate UpdateProcessMetrics errors', async () => {
                mockUpdateProcessMetrics.execute.mockRejectedValue(
                    new Error('Metrics update failed')
                );

                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_METRICS,
                    data: { metricsUpdate: { count: 1 } },
                });

                await expect(useCase.execute(message))
                    .rejects.toThrow('Failed to handle process update: Metrics update failed');
            });

            it('should include processId and operation in error message', async () => {
                mockUpdateProcessState.execute.mockRejectedValue(
                    new Error('Update failed')
                );

                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_STATE,
                    data: { state: 'RUNNING', contextUpdates: {} },
                });

                try {
                    await useCase.execute(message);
                    fail('Should have thrown');
                } catch (error) {
                    expect(error.message).toContain('Failed to handle process update');
                }
            });
        });

        describe('integration scenarios', () => {
            it('should handle sequence of operations', async () => {
                const messages = [
                    new ProcessUpdateMessage({
                        processId: 'proc-123',
                        operation: ProcessUpdateOperation.UPDATE_STATE,
                        data: { state: 'RUNNING', contextUpdates: {} },
                    }),
                    new ProcessUpdateMessage({
                        processId: 'proc-123',
                        operation: ProcessUpdateOperation.UPDATE_METRICS,
                        data: { metricsUpdate: { count: 50 } },
                    }),
                    new ProcessUpdateMessage({
                        processId: 'proc-123',
                        operation: ProcessUpdateOperation.COMPLETE_PROCESS,
                        data: {},
                    }),
                ];

                for (const message of messages) {
                    await useCase.execute(message);
                }

                expect(mockUpdateProcessState.execute).toHaveBeenCalledTimes(2); // RUNNING + COMPLETED
                expect(mockUpdateProcessMetrics.execute).toHaveBeenCalledTimes(1);
            });

            it('should handle error after processing', async () => {
                const messages = [
                    new ProcessUpdateMessage({
                        processId: 'proc-123',
                        operation: ProcessUpdateOperation.UPDATE_METRICS,
                        data: { metricsUpdate: { count: 50 } },
                    }),
                    new ProcessUpdateMessage({
                        processId: 'proc-123',
                        operation: ProcessUpdateOperation.HANDLE_ERROR,
                        data: {
                            error: { message: 'Processing failed' },
                        },
                    }),
                ];

                for (const message of messages) {
                    await useCase.execute(message);
                }

                expect(mockUpdateProcessMetrics.execute).toHaveBeenCalledWith(
                    'proc-123',
                    { count: 50 }
                );
                expect(mockUpdateProcessState.execute).toHaveBeenCalledWith(
                    'proc-123',
                    'ERROR',
                    expect.objectContaining({
                        error: 'Processing failed',
                    })
                );
            });
        });
    });

    describe('executeFromSQS', () => {
        it('should parse SQS message and execute', async () => {
            const sqsMessage = {
                body: JSON.stringify({
                    processId: 'proc-123',
                    operation: 'UPDATE_STATE',
                    data: { state: 'RUNNING', contextUpdates: {} },
                    timestamp: new Date().toISOString(),
                }),
            };

            await useCase.executeFromSQS(sqsMessage);

            expect(mockUpdateProcessState.execute).toHaveBeenCalledWith(
                'proc-123',
                'RUNNING',
                {}
            );
        });

        it('should handle malformed SQS message body', async () => {
            const sqsMessage = {
                body: 'invalid json',
            };

            await expect(useCase.executeFromSQS(sqsMessage))
                .rejects.toThrow();
        });

        it('should handle missing body field', async () => {
            const sqsMessage = {};

            await expect(useCase.executeFromSQS(sqsMessage))
                .rejects.toThrow();
        });
    });
});
