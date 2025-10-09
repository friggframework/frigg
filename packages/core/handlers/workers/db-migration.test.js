/**
 * Unit tests for Database Migration Lambda Handler
 *
 * Tests the db-migration Lambda handler which runs Prisma migrations
 * from within the VPC for CI/CD pipelines.
 */

// Mock the use case module before requiring the handler
jest.mock('../../database/use-cases/run-database-migration-use-case', () => {
    const mockExecute = jest.fn();
    return {
        RunDatabaseMigrationUseCase: jest.fn().mockImplementation(() => ({
            execute: mockExecute,
        })),
        MigrationError: class MigrationError extends Error {
            constructor(message, context) {
                super(message);
                this.name = 'MigrationError';
                this.context = context;
            }
        },
        ValidationError: class ValidationError extends Error {
            constructor(message) {
                super(message);
                this.name = 'ValidationError';
            }
        },
        __mockExecute: mockExecute, // Expose for test access
    };
});

const { handler } = require('./db-migration');
const {
    RunDatabaseMigrationUseCase,
    MigrationError,
    ValidationError,
    __mockExecute: mockExecute,
} = require('../../database/use-cases/run-database-migration-use-case');

describe('db-migration Lambda Handler', () => {
    let originalEnv;
    let mockContext;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };

        // Setup mock context
        mockContext = {
            requestId: 'test-request-id',
            functionName: 'test-function',
            getRemainingTimeInMillis: jest.fn(() => 300000), // 5 minutes
        };

        // Reset all mocks
        jest.clearAllMocks();

        // Set default environment variables
        process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/test_db';
        process.env.DB_TYPE = 'postgresql';
        process.env.STAGE = 'production';

        // Setup default mock implementation - successful migration
        mockExecute.mockResolvedValue({
            success: true,
            dbType: 'postgresql',
            stage: 'production',
            command: 'deploy',
            message: 'Database migration completed successfully',
        });
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('Successful Migrations', () => {
        test('should successfully run PostgreSQL migration in production', async () => {
            process.env.STAGE = 'production';
            mockExecute.mockResolvedValue({
                success: true,
                dbType: 'postgresql',
                stage: 'production',
                command: 'deploy',
                message: 'Database migration completed successfully',
            });

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('Database migration completed successfully');
            expect(body.dbType).toBe('postgresql');
            expect(body.stage).toBe('production');
            expect(body.migrationCommand).toBe('deploy');

            // Verify use case was called with correct parameters
            expect(mockExecute).toHaveBeenCalledWith({
                dbType: 'postgresql',
                stage: 'production',
                verbose: true,
            });
        });

        test('should successfully run PostgreSQL migration in development', async () => {
            process.env.STAGE = 'dev';
            mockExecute.mockResolvedValue({
                success: true,
                dbType: 'postgresql',
                stage: 'dev',
                command: 'dev',
                message: 'Database migration completed successfully',
            });

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.migrationCommand).toBe('dev');

            expect(mockExecute).toHaveBeenCalledWith({
                dbType: 'postgresql',
                stage: 'dev',
                verbose: true,
            });
        });

        test('should successfully run MongoDB migration', async () => {
            process.env.DB_TYPE = 'mongodb';
            process.env.DATABASE_URL = 'mongodb://localhost:27017/test_db';
            mockExecute.mockResolvedValue({
                success: true,
                dbType: 'mongodb',
                stage: 'production',
                command: 'db push',
                message: 'Database migration completed successfully',
            });

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(true);
            expect(body.dbType).toBe('mongodb');
            expect(body.migrationCommand).toBe('db push');

            expect(mockExecute).toHaveBeenCalledWith({
                dbType: 'mongodb',
                stage: 'production',
                verbose: true,
            });
        });

        test('should use default values when environment variables are missing', async () => {
            delete process.env.DB_TYPE;
            delete process.env.STAGE;
            mockExecute.mockResolvedValue({
                success: true,
                dbType: 'postgresql',
                stage: 'production',
                command: 'deploy',
                message: 'Database migration completed successfully',
            });

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(200);
            const body = JSON.parse(result.body);
            expect(body.dbType).toBe('postgresql'); // Default
            expect(body.stage).toBe('production'); // Default

            expect(mockExecute).toHaveBeenCalledWith({
                dbType: 'postgresql', // Default
                stage: 'production',  // Default
                verbose: true,
            });
        });
    });

    describe('Error Handling', () => {
        test('should fail when DATABASE_URL is not set', async () => {
            delete process.env.DATABASE_URL;

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toContain('DATABASE_URL environment variable is not set');

            // Verify use case was not called
            expect(mockExecute).not.toHaveBeenCalled();
        });

        test('should fail when Prisma generate fails (MigrationError)', async () => {
            mockExecute.mockRejectedValue(
                new MigrationError('Failed to generate Prisma client: Schema file not found', {
                    dbType: 'postgresql',
                    stage: 'production',
                    step: 'generate',
                })
            );

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toContain('Failed to generate Prisma client');
            expect(body.error).toContain('Schema file not found');
            expect(body.errorType).toBe('MigrationError');
        });

        test('should fail when PostgreSQL migration fails', async () => {
            mockExecute.mockRejectedValue(
                new MigrationError('PostgreSQL migration failed: Migration conflict detected', {
                    dbType: 'postgresql',
                    stage: 'production',
                    command: 'deploy',
                    step: 'migrate',
                })
            );

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toContain('PostgreSQL migration failed');
            expect(body.error).toContain('Migration conflict detected');
            expect(body.errorType).toBe('MigrationError');
        });

        test('should fail when MongoDB push fails', async () => {
            process.env.DB_TYPE = 'mongodb';
            mockExecute.mockRejectedValue(
                new MigrationError('MongoDB push failed: Connection timeout', {
                    dbType: 'mongodb',
                    stage: 'production',
                    command: 'db push',
                    step: 'push',
                })
            );

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toContain('MongoDB push failed');
            expect(body.error).toContain('Connection timeout');
            expect(body.errorType).toBe('MigrationError');
        });

        test('should fail for unsupported database type (ValidationError)', async () => {
            process.env.DB_TYPE = 'mysql';
            mockExecute.mockRejectedValue(
                new ValidationError("Unsupported database type: mysql. Must be 'postgresql' or 'mongodb'.")
            );

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(400); // Validation errors return 400
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toContain('Unsupported database type: mysql');
            expect(body.errorType).toBe('ValidationError');
        });

        test('should handle unexpected errors gracefully', async () => {
            mockExecute.mockRejectedValue(new Error('Unexpected error'));

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            expect(body.error).toContain('Unexpected error');
            expect(body.errorType).toBe('Error');
            expect(body.stack).toBeUndefined(); // Stack NOT included in production (default stage)
        });

        test('should sanitize error messages containing credentials', async () => {
            mockExecute.mockRejectedValue(
                new MigrationError(
                    'Connection failed to postgresql://user:password@host:5432/db',
                    { dbType: 'postgresql', stage: 'production' }
                )
            );

            const result = await handler({}, mockContext);

            expect(result.statusCode).toBe(500);
            const body = JSON.parse(result.body);
            expect(body.success).toBe(false);
            // Credentials should be sanitized
            expect(body.error).toContain('postgresql://***:***@***');
            expect(body.error).not.toContain('user:password');
        });

        test('should only include stack traces in development stages', async () => {
            process.env.STAGE = 'dev';
            mockExecute.mockRejectedValue(new Error('Test error'));

            const result = await handler({}, mockContext);

            const body = JSON.parse(result.body);
            expect(body.stack).toBeDefined();
        });

        test('should not include stack traces in production stage', async () => {
            process.env.STAGE = 'production';
            mockExecute.mockRejectedValue(new Error('Test error'));

            const result = await handler({}, mockContext);

            const body = JSON.parse(result.body);
            expect(body.stack).toBeUndefined();
        });
    });

    describe('Environment Variable Handling', () => {
        test('should sanitize DATABASE_URL in logs', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            process.env.DATABASE_URL = 'postgresql://user:password@very-long-host.amazonaws.com:5432/database';

            await handler({}, mockContext);

            // Verify URL credentials are masked in logs
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('postgresql://***:***@')
            );
            expect(consoleSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('user:password')
            );

            consoleSpy.mockRestore();
        });

        test('should handle different stage values correctly', async () => {
            const stages = ['dev', 'test', 'local', 'staging', 'production'];

            for (const stage of stages) {
                process.env.STAGE = stage;
                const command = ['dev', 'test', 'local'].includes(stage) ? 'dev' : 'deploy';

                jest.clearAllMocks();
                mockExecute.mockResolvedValue({
                    success: true,
                    dbType: 'postgresql',
                    stage,
                    command,
                    message: 'Database migration completed successfully',
                });

                const result = await handler({}, mockContext);

                expect(result.statusCode).toBe(200);
                const body = JSON.parse(result.body);
                expect(body.stage).toBe(stage);
                expect(mockExecute).toHaveBeenCalledWith({
                    dbType: 'postgresql',
                    stage,
                    verbose: true,
                });
            }
        });
    });

    describe('Response Format', () => {
        test('should return properly formatted success response', async () => {
            const result = await handler({}, mockContext);

            expect(result).toHaveProperty('statusCode', 200);
            expect(result).toHaveProperty('body');

            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('success', true);
            expect(body).toHaveProperty('message');
            expect(body).toHaveProperty('dbType');
            expect(body).toHaveProperty('stage');
            expect(body).toHaveProperty('migrationCommand');
            expect(body).toHaveProperty('timestamp');

            // Verify timestamp is valid ISO string
            expect(() => new Date(body.timestamp)).not.toThrow();
        });

        test('should return properly formatted error response', async () => {
            delete process.env.DATABASE_URL;

            const result = await handler({}, mockContext);

            expect(result).toHaveProperty('statusCode', 500);
            expect(result).toHaveProperty('body');

            const body = JSON.parse(result.body);
            expect(body).toHaveProperty('success', false);
            expect(body).toHaveProperty('error');
            expect(typeof body.error).toBe('string');
        });
    });

    describe('Logging', () => {
        test('should log migration progress', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await handler({}, mockContext);

            // Verify key log messages
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Database Migration Lambda Started'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Executing Database Migration'));
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Migration Summary'));

            consoleSpy.mockRestore();
        });

        test('should log errors with details', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const testError = new MigrationError('Test migration error', {
                dbType: 'postgresql',
                stage: 'production',
            });
            mockExecute.mockRejectedValue(testError);

            await handler({}, mockContext);

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Migration Failed'));
            expect(consoleSpy).toHaveBeenCalledWith('Error:', 'MigrationError', 'Test migration error');

            consoleSpy.mockRestore();
        });
    });
});
