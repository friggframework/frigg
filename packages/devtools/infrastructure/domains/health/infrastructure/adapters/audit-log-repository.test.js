const AuditLogRepository = require('./audit-log-repository');
const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('AuditLogRepository', () => {
    let repository;
    const testLogDir = '/tmp/frigg-audit-logs';

    beforeEach(() => {
        jest.clearAllMocks();
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockReturnValue(undefined);
        fs.appendFileSync.mockReturnValue(undefined);

        repository = new AuditLogRepository({
            logDirectory: testLogDir,
        });
    });

    describe('constructor', () => {
        it('should initialize with default log directory', () => {
            fs.existsSync.mockReturnValue(true);
            const repo = new AuditLogRepository({});

            expect(repo.logDirectory).toContain('.frigg');
            expect(repo.logDirectory).toContain('audit-logs');
        });

        it('should initialize with provided log directory', () => {
            const repo = new AuditLogRepository({
                logDirectory: '/custom/path',
            });

            expect(repo.logDirectory).toBe('/custom/path');
        });

        it('should create log directory if it does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            new AuditLogRepository({
                logDirectory: testLogDir,
            });

            expect(fs.mkdirSync).toHaveBeenCalledWith(testLogDir, { recursive: true });
        });
    });

    describe('logCleanupOperation', () => {
        it('should log cleanup operation to file', async () => {
            const operation = {
                stackIdentifier: {
                    stackName: 'test-stack',
                    region: 'us-east-1',
                    accountId: '123456789012',
                },
                deletionPlan: {
                    totalResources: 5,
                    deletableCount: 5,
                    blockedCount: 0,
                },
                result: {
                    successCount: 5,
                    failedCount: 0,
                },
                timestamp: '2025-10-27T10:30:00Z',
            };

            await repository.logCleanupOperation(operation);

            expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
            const [filepath, content] = fs.appendFileSync.mock.calls[0];

            expect(filepath).toContain('cleanup-operations.log');
            expect(content).toContain('test-stack');
            expect(content).toContain('us-east-1');
            expect(content).toContain('"successCount":5');
        });

        it('should include dry-run flag in log', async () => {
            const operation = {
                stackIdentifier: {
                    stackName: 'test-stack',
                    region: 'us-east-1',
                },
                dryRun: true,
                timestamp: '2025-10-27T10:30:00Z',
            };

            await repository.logCleanupOperation(operation);

            const [, content] = fs.appendFileSync.mock.calls[0];
            expect(content).toContain('"dryRun":true');
        });

        it('should handle logging errors gracefully', async () => {
            fs.appendFileSync.mockImplementation(() => {
                throw new Error('Disk full');
            });

            const operation = {
                stackIdentifier: { stackName: 'test-stack' },
                timestamp: '2025-10-27T10:30:00Z',
            };

            await expect(repository.logCleanupOperation(operation)).resolves.toEqual({
                success: false,
                error: 'Disk full',
            });
        });

        it('should return success when log is written', async () => {
            const operation = {
                stackIdentifier: { stackName: 'test-stack' },
                timestamp: '2025-10-27T10:30:00Z',
            };

            const result = await repository.logCleanupOperation(operation);

            expect(result.success).toBe(true);
        });
    });

    describe('logDeletionAttempt', () => {
        it('should log individual deletion attempt', async () => {
            const attempt = {
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                logicalId: 'FriggVPC',
                success: true,
                timestamp: '2025-10-27T10:30:00Z',
            };

            await repository.logDeletionAttempt(attempt);

            expect(fs.appendFileSync).toHaveBeenCalledTimes(1);
            const [filepath, content] = fs.appendFileSync.mock.calls[0];

            expect(filepath).toContain('deletion-attempts.log');
            expect(content).toContain('vpc-123');
            expect(content).toContain('AWS::EC2::VPC');
            expect(content).toContain('"success":true');
        });

        it('should log failure with error details', async () => {
            const attempt = {
                physicalId: 'vpc-123',
                resourceType: 'AWS::EC2::VPC',
                success: false,
                error: 'DependencyViolation',
                errorMessage: 'The vpc has dependencies',
                timestamp: '2025-10-27T10:30:00Z',
            };

            await repository.logDeletionAttempt(attempt);

            const [, content] = fs.appendFileSync.mock.calls[0];
            expect(content).toContain('"success":false');
            expect(content).toContain('DependencyViolation');
            expect(content).toContain('The vpc has dependencies');
        });
    });

    describe('getRecentOperations', () => {
        it('should read and parse recent operations from log file', async () => {
            const logContent =
                '{"timestamp":"2025-10-27T10:30:00Z","stackName":"test-stack-1"}\n' +
                '{"timestamp":"2025-10-27T10:31:00Z","stackName":"test-stack-2"}\n' +
                '{"timestamp":"2025-10-27T10:32:00Z","stackName":"test-stack-3"}\n';

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(logContent);

            const operations = await repository.getRecentOperations(2);

            expect(operations).toHaveLength(2);
            expect(operations[0].stackName).toBe('test-stack-3');
            expect(operations[1].stackName).toBe('test-stack-2');
        });

        it('should return empty array if log file does not exist', async () => {
            fs.existsSync.mockReturnValue(false);

            const operations = await repository.getRecentOperations(10);

            expect(operations).toEqual([]);
        });

        it('should handle corrupted log entries', async () => {
            const logContent =
                '{"timestamp":"2025-10-27T10:30:00Z","stackName":"test-stack-1"}\n' +
                'CORRUPTED LINE\n' +
                '{"timestamp":"2025-10-27T10:32:00Z","stackName":"test-stack-3"}\n';

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(logContent);

            const operations = await repository.getRecentOperations(10);

            expect(operations).toHaveLength(2);
            expect(operations[0].stackName).toBe('test-stack-3');
            expect(operations[1].stackName).toBe('test-stack-1');
        });

        it('should default to 100 operations if limit not specified', async () => {
            const logLines = Array.from({ length: 150 }, (_, i) =>
                JSON.stringify({ timestamp: `2025-10-27T${String(i).padStart(2, '0')}:00:00Z`, index: i })
            ).join('\n');

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(logLines);

            const operations = await repository.getRecentOperations();

            expect(operations.length).toBeLessThanOrEqual(100);
        });
    });

    describe('file paths', () => {
        it('should use correct file path for cleanup operations', () => {
            const expectedPath = path.join(testLogDir, 'cleanup-operations.log');
            expect(repository._getCleanupLogPath()).toBe(expectedPath);
        });

        it('should use correct file path for deletion attempts', () => {
            const expectedPath = path.join(testLogDir, 'deletion-attempts.log');
            expect(repository._getDeletionLogPath()).toBe(expectedPath);
        });
    });
});
