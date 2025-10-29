const { ProcessUpdateMessage, ProcessUpdateOperation } = require('./process-update-message');

describe('ProcessUpdateOperation', () => {
    it('should define all operation types', () => {
        expect(ProcessUpdateOperation.UPDATE_STATE).toBe('UPDATE_STATE');
        expect(ProcessUpdateOperation.UPDATE_METRICS).toBe('UPDATE_METRICS');
        expect(ProcessUpdateOperation.COMPLETE_PROCESS).toBe('COMPLETE_PROCESS');
        expect(ProcessUpdateOperation.HANDLE_ERROR).toBe('HANDLE_ERROR');
    });

    it('should have a list of valid operations', () => {
        expect(ProcessUpdateOperation.VALID_OPERATIONS).toEqual([
            'UPDATE_STATE',
            'UPDATE_METRICS',
            'COMPLETE_PROCESS',
            'HANDLE_ERROR',
        ]);
    });

    it('should validate operation types', () => {
        expect(ProcessUpdateOperation.isValid('UPDATE_STATE')).toBe(true);
        expect(ProcessUpdateOperation.isValid('UPDATE_METRICS')).toBe(true);
        expect(ProcessUpdateOperation.isValid('COMPLETE_PROCESS')).toBe(true);
        expect(ProcessUpdateOperation.isValid('HANDLE_ERROR')).toBe(true);
        expect(ProcessUpdateOperation.isValid('INVALID_OP')).toBe(false);
        expect(ProcessUpdateOperation.isValid('')).toBe(false);
        expect(ProcessUpdateOperation.isValid(null)).toBe(false);
    });
});

describe('ProcessUpdateMessage', () => {
    describe('constructor', () => {
        it('should create message with required fields', () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: { state: 'RUNNING' },
            });

            expect(message.processId).toBe('proc-123');
            expect(message.operation).toBe('UPDATE_STATE');
            expect(message.data).toEqual({ state: 'RUNNING' });
            expect(message.timestamp).toBeInstanceOf(Date);
        });

        it('should create message with custom timestamp', () => {
            const customTime = new Date('2024-01-15T10:00:00Z');
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: { state: 'RUNNING' },
                timestamp: customTime,
            });

            expect(message.timestamp).toEqual(customTime);
        });

        it('should throw if processId is missing', () => {
            expect(() => new ProcessUpdateMessage({
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            })).toThrow('processId is required');
        });

        it('should throw if processId is not a string', () => {
            expect(() => new ProcessUpdateMessage({
                processId: 123,
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            })).toThrow('processId must be a string');
        });

        it('should throw if processId is empty string', () => {
            expect(() => new ProcessUpdateMessage({
                processId: '',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            })).toThrow('processId cannot be empty');
        });

        it('should throw if operation is missing', () => {
            expect(() => new ProcessUpdateMessage({
                processId: 'proc-123',
                data: {},
            })).toThrow('operation is required');
        });

        it('should throw if operation is invalid', () => {
            expect(() => new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: 'INVALID_OP',
                data: {},
            })).toThrow('Invalid operation type: INVALID_OP');
        });

        it('should throw if data is missing', () => {
            expect(() => new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
            })).toThrow('data is required');
        });

        it('should throw if data is not an object', () => {
            expect(() => new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: 'invalid',
            })).toThrow('data must be an object');
        });

        it('should allow empty data object', () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.COMPLETE_PROCESS,
                data: {},
            });

            expect(message.data).toEqual({});
        });

        it('should throw if timestamp is not a Date', () => {
            expect(() => new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
                timestamp: 'not-a-date',
            })).toThrow('timestamp must be a Date object');
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON format', () => {
            const timestamp = new Date('2024-01-15T10:00:00Z');
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: { state: 'RUNNING', context: { step: 1 } },
                timestamp,
            });

            const json = message.toJSON();

            expect(json).toEqual({
                processId: 'proc-123',
                operation: 'UPDATE_STATE',
                data: { state: 'RUNNING', context: { step: 1 } },
                timestamp: '2024-01-15T10:00:00.000Z',
            });
        });

        it('should be JSON.stringify compatible', () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_METRICS,
                data: { totalProcessed: 100 },
            });

            const jsonString = JSON.stringify(message);
            const parsed = JSON.parse(jsonString);

            expect(parsed.processId).toBe('proc-123');
            expect(parsed.operation).toBe('UPDATE_METRICS');
            expect(parsed.data).toEqual({ totalProcessed: 100 });
            expect(typeof parsed.timestamp).toBe('string');
        });
    });

    describe('fromJSON', () => {
        it('should deserialize from JSON format', () => {
            const json = {
                processId: 'proc-123',
                operation: 'UPDATE_STATE',
                data: { state: 'RUNNING' },
                timestamp: '2024-01-15T10:00:00.000Z',
            };

            const message = ProcessUpdateMessage.fromJSON(json);

            expect(message).toBeInstanceOf(ProcessUpdateMessage);
            expect(message.processId).toBe('proc-123');
            expect(message.operation).toBe('UPDATE_STATE');
            expect(message.data).toEqual({ state: 'RUNNING' });
            expect(message.timestamp).toEqual(new Date('2024-01-15T10:00:00.000Z'));
        });

        it('should deserialize from JSON string', () => {
            const jsonString = JSON.stringify({
                processId: 'proc-456',
                operation: 'UPDATE_METRICS',
                data: { totalProcessed: 50 },
                timestamp: '2024-01-15T11:00:00.000Z',
            });

            const message = ProcessUpdateMessage.fromJSON(jsonString);

            expect(message.processId).toBe('proc-456');
            expect(message.operation).toBe('UPDATE_METRICS');
        });

        it('should throw if JSON is invalid', () => {
            expect(() => ProcessUpdateMessage.fromJSON('invalid-json'))
                .toThrow();
        });

        it('should throw if deserialized data is invalid', () => {
            const json = {
                processId: 123, // Invalid type
                operation: 'UPDATE_STATE',
                data: {},
                timestamp: '2024-01-15T10:00:00.000Z',
            };

            expect(() => ProcessUpdateMessage.fromJSON(json))
                .toThrow('processId must be a string');
        });
    });

    describe('getMessageGroupId', () => {
        it('should return MessageGroupId for FIFO queue', () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            });

            expect(message.getMessageGroupId()).toBe('process-proc-123');
        });

        it('should use processId in MessageGroupId', () => {
            const message1 = new ProcessUpdateMessage({
                processId: 'proc-abc',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            });

            const message2 = new ProcessUpdateMessage({
                processId: 'proc-xyz',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            });

            expect(message1.getMessageGroupId()).toBe('process-proc-abc');
            expect(message2.getMessageGroupId()).toBe('process-proc-xyz');
        });
    });

    describe('getMessageDeduplicationId', () => {
        it('should return unique MessageDeduplicationId', () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
            });

            const dedupId = message.getMessageDeduplicationId();

            expect(dedupId).toContain('proc-123');
            expect(dedupId).toContain('UPDATE_STATE');
            expect(typeof dedupId).toBe('string');
        });

        it('should generate different IDs for same process with different operations', () => {
            const timestamp = new Date('2024-01-15T10:00:00.000Z');

            const message1 = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
                timestamp,
            });

            const message2 = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_METRICS,
                data: {},
                timestamp,
            });

            const dedupId1 = message1.getMessageDeduplicationId();
            const dedupId2 = message2.getMessageDeduplicationId();

            expect(dedupId1).not.toBe(dedupId2);
        });

        it('should generate different IDs for same process at different times', () => {
            const message1 = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
                timestamp: new Date('2024-01-15T10:00:00.000Z'),
            });

            const message2 = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: {},
                timestamp: new Date('2024-01-15T10:00:01.000Z'),
            });

            expect(message1.getMessageDeduplicationId())
                .not.toBe(message2.getMessageDeduplicationId());
        });
    });

    describe('specific operation types', () => {
        describe('UPDATE_STATE', () => {
            it('should create UPDATE_STATE message', () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_STATE,
                    data: {
                        state: 'RUNNING',
                        contextUpdates: { step: 2, batchId: 'batch-1' },
                    },
                });

                expect(message.operation).toBe('UPDATE_STATE');
                expect(message.data.state).toBe('RUNNING');
                expect(message.data.contextUpdates).toEqual({ step: 2, batchId: 'batch-1' });
            });
        });

        describe('UPDATE_METRICS', () => {
            it('should create UPDATE_METRICS message', () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.UPDATE_METRICS,
                    data: {
                        metricsUpdate: {
                            totalProcessed: 100,
                            totalFailed: 2,
                        },
                    },
                });

                expect(message.operation).toBe('UPDATE_METRICS');
                expect(message.data.metricsUpdate).toEqual({
                    totalProcessed: 100,
                    totalFailed: 2,
                });
            });
        });

        describe('COMPLETE_PROCESS', () => {
            it('should create COMPLETE_PROCESS message', () => {
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.COMPLETE_PROCESS,
                    data: {},
                });

                expect(message.operation).toBe('COMPLETE_PROCESS');
            });
        });

        describe('HANDLE_ERROR', () => {
            it('should create HANDLE_ERROR message', () => {
                const error = new Error('Test error');
                const message = new ProcessUpdateMessage({
                    processId: 'proc-123',
                    operation: ProcessUpdateOperation.HANDLE_ERROR,
                    data: {
                        error: {
                            message: error.message,
                            stack: error.stack,
                        },
                    },
                });

                expect(message.operation).toBe('HANDLE_ERROR');
                expect(message.data.error.message).toBe('Test error');
                expect(message.data.error.stack).toBeDefined();
            });
        });
    });
});
