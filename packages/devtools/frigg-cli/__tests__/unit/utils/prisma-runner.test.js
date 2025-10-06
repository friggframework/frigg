// Mock dependencies BEFORE requiring modules
jest.mock('child_process', () => ({
    execSync: jest.fn(),
    spawn: jest.fn()
}));
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn()
}));

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const {
    getPrismaSchemaPath,
    runPrismaGenerate,
    checkDatabaseState,
    runPrismaMigrate,
    runPrismaDbPush,
    getMigrationCommand
} = require('../../../utils/prisma-runner');

describe('Prisma Runner Utility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        delete process.env.STAGE;
        delete process.env.PRISMA_HIDE_UPDATE_MESSAGE;
    });

    afterEach(() => {
        delete process.env.STAGE;
        delete process.env.PRISMA_HIDE_UPDATE_MESSAGE;
    });

    describe('getPrismaSchemaPath()', () => {
        it('should return correct path for MongoDB', () => {
            fs.existsSync.mockReturnValue(true);

            const path = getPrismaSchemaPath('mongodb');

            expect(path).toContain('prisma-mongodb');
            expect(path).toContain('schema.prisma');
            expect(path).toContain('@friggframework/core');
        });

        it('should return correct path for PostgreSQL', () => {
            fs.existsSync.mockReturnValue(true);

            const path = getPrismaSchemaPath('postgresql');

            expect(path).toContain('prisma-postgresql');
            expect(path).toContain('schema.prisma');
            expect(path).toContain('@friggframework/core');
        });

        it('should throw error when schema file does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            expect(() => getPrismaSchemaPath('mongodb')).toThrow('Prisma schema not found');
        });

        it('should include helpful error message when schema missing', () => {
            fs.existsSync.mockReturnValue(false);

            expect(() => getPrismaSchemaPath('mongodb')).toThrow('@friggframework/core');
        });

        it('should use process.cwd() for base path', () => {
            fs.existsSync.mockReturnValue(true);
            const originalCwd = process.cwd();

            const path = getPrismaSchemaPath('mongodb');

            expect(path).toContain(originalCwd);
        });

        it('should accept custom project root', () => {
            fs.existsSync.mockReturnValue(true);
            const customRoot = '/custom/project';

            const path = getPrismaSchemaPath('mongodb', customRoot);

            expect(path).toContain(customRoot);
        });
    });

    describe('runPrismaGenerate()', () => {
        beforeEach(() => {
            fs.existsSync.mockReturnValue(true);
        });

        it('should execute prisma generate successfully', async () => {
            execSync.mockReturnValue('Generated successfully');

            const result = await runPrismaGenerate('mongodb');

            expect(result.success).toBe(true);
            expect(execSync).toHaveBeenCalled();
        });

        it('should use correct schema path for MongoDB', async () => {
            execSync.mockReturnValue('');

            await runPrismaGenerate('mongodb');

            const call = execSync.mock.calls[0][0];
            expect(call).toContain('prisma generate');
            expect(call).toContain('--schema');
            expect(call).toContain('prisma-mongodb');
        });

        it('should use correct schema path for PostgreSQL', async () => {
            execSync.mockReturnValue('');

            await runPrismaGenerate('postgresql');

            const call = execSync.mock.calls[0][0];
            expect(call).toContain('prisma-postgresql');
        });

        it('should suppress telemetry when verbose false', async () => {
            execSync.mockReturnValue('');

            await runPrismaGenerate('mongodb', false);

            const options = execSync.mock.calls[0][1];
            expect(options.env.PRISMA_HIDE_UPDATE_MESSAGE).toBe('1');
        });

        it('should show output when verbose true', async () => {
            execSync.mockReturnValue('Generated successfully');

            await runPrismaGenerate('mongodb', true);

            const options = execSync.mock.calls[0][1];
            expect(options.stdio).toBe('inherit');
        });

        it('should hide output when verbose false', async () => {
            execSync.mockReturnValue('');

            await runPrismaGenerate('mongodb', false);

            const options = execSync.mock.calls[0][1];
            expect(options.stdio).toBe('pipe');
        });

        it('should handle generation failures with error details', async () => {
            const error = new Error('Generation failed');
            error.stdout = 'Schema validation error';
            execSync.mockImplementation(() => {
                throw error;
            });

            const result = await runPrismaGenerate('mongodb');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Generation failed');
        });

        it('should include stdout in error output', async () => {
            const error = new Error('Failed');
            error.stdout = Buffer.from('Detailed error info');
            execSync.mockImplementation(() => {
                throw error;
            });

            const result = await runPrismaGenerate('mongodb');

            expect(result.output).toContain('Detailed error info');
        });

        it('should handle schema syntax errors', async () => {
            execSync.mockImplementation(() => {
                throw new Error('Schema parsing failed');
            });

            const result = await runPrismaGenerate('mongodb');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('checkDatabaseState()', () => {
        beforeEach(() => {
            fs.existsSync.mockReturnValue(true);
        });

        it('should return upToDate: true when migrations current (PostgreSQL)', async () => {
            execSync.mockReturnValue('Database schema is up to date');

            const result = await checkDatabaseState('postgresql');

            expect(result.upToDate).toBe(true);
        });

        it('should return upToDate: true for MongoDB (N/A)', async () => {
            const result = await checkDatabaseState('mongodb');

            expect(result.upToDate).toBe(true);
        });

        it('should return pendingMigrations count when migrations pending', async () => {
            execSync.mockReturnValue('3 migrations have not been applied');

            const result = await checkDatabaseState('postgresql');

            expect(result.upToDate).toBe(false);
            expect(result.pendingMigrations).toBe(3);
        });

        it('should handle uninitialized database', async () => {
            execSync.mockImplementation(() => {
                throw new Error('No migrations found');
            });

            const result = await checkDatabaseState('postgresql');

            expect(result.upToDate).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle migrate status command errors', async () => {
            execSync.mockImplementation(() => {
                throw new Error('Migration status failed');
            });

            const result = await checkDatabaseState('postgresql');

            expect(result.upToDate).toBe(false);
            expect(result.error).toContain('Migration status failed');
        });

        it('should not run migrate status for MongoDB', async () => {
            await checkDatabaseState('mongodb');

            expect(execSync).not.toHaveBeenCalled();
        });
    });

    describe('runPrismaMigrate()', () => {
        let mockChildProcess;

        beforeEach(() => {
            fs.existsSync.mockReturnValue(true);
            mockChildProcess = {
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0);
                    }
                }),
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() }
            };
            spawn.mockReturnValue(mockChildProcess);
        });

        it('should run migrate dev successfully', async () => {
            const result = await runPrismaMigrate('dev');

            expect(result.success).toBe(true);
            expect(spawn).toHaveBeenCalled();
        });

        it('should run migrate deploy successfully', async () => {
            const result = await runPrismaMigrate('deploy');

            expect(result.success).toBe(true);
            expect(spawn).toHaveBeenCalled();
        });

        it('should use correct command for dev mode', async () => {
            await runPrismaMigrate('dev');

            const args = spawn.mock.calls[0][1];
            expect(args).toContain('migrate');
            expect(args).toContain('dev');
        });

        it('should use correct command for deploy mode', async () => {
            await runPrismaMigrate('deploy');

            const args = spawn.mock.calls[0][1];
            expect(args).toContain('migrate');
            expect(args).toContain('deploy');
        });

        it('should handle migration failures with error', async () => {
            mockChildProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(1); // Exit code 1
                }
            });

            const result = await runPrismaMigrate('dev');

            expect(result.success).toBe(false);
            expect(result.error).toContain('exited with code 1');
        });

        it('should respect verbose flag', async () => {
            await runPrismaMigrate('dev', true);

            const options = spawn.mock.calls[0][2];
            expect(options.stdio).toBe('inherit');
        });

        it('should handle process spawn errors', async () => {
            mockChildProcess.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    callback(new Error('Spawn failed'));
                }
            });

            const result = await runPrismaMigrate('dev');

            expect(result.success).toBe(false);
        });

        it('should hide telemetry messages', async () => {
            await runPrismaMigrate('dev');

            const options = spawn.mock.calls[0][2];
            expect(options.env.PRISMA_HIDE_UPDATE_MESSAGE).toBe('1');
        });
    });

    describe('runPrismaDbPush()', () => {
        let mockChildProcess;

        beforeEach(() => {
            fs.existsSync.mockReturnValue(true);
            mockChildProcess = {
                on: jest.fn((event, callback) => {
                    if (event === 'close') {
                        callback(0);
                    }
                }),
                stdout: { on: jest.fn() },
                stderr: { on: jest.fn() }
            };
            spawn.mockReturnValue(mockChildProcess);
        });

        it('should push schema successfully for MongoDB', async () => {
            const result = await runPrismaDbPush();

            expect(result.success).toBe(true);
            expect(spawn).toHaveBeenCalled();
        });

        it('should use --skip-generate flag', async () => {
            await runPrismaDbPush();

            const args = spawn.mock.calls[0][1];
            expect(args).toContain('--skip-generate');
        });

        it('should use db push command', async () => {
            await runPrismaDbPush();

            const args = spawn.mock.calls[0][1];
            expect(args).toContain('db');
            expect(args).toContain('push');
        });

        it('should handle push failures with error', async () => {
            mockChildProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(1);
                }
            });

            const result = await runPrismaDbPush();

            expect(result.success).toBe(false);
            expect(result.error).toContain('exited with code 1');
        });

        it('should respect verbose flag', async () => {
            await runPrismaDbPush(true);

            const options = spawn.mock.calls[0][2];
            expect(options.stdio).toBe('inherit');
        });

        it('should use interactive mode (stdio: inherit)', async () => {
            await runPrismaDbPush();

            const options = spawn.mock.calls[0][2];
            expect(options.stdio).toBe('inherit');
        });

        it('should handle schema validation errors', async () => {
            mockChildProcess.on.mockImplementation((event, callback) => {
                if (event === 'close') {
                    callback(1);
                }
            });

            const result = await runPrismaDbPush();

            expect(result.success).toBe(false);
        });
    });

    describe('getMigrationCommand()', () => {
        it('should return dev for development stage', () => {
            const command = getMigrationCommand('development');

            expect(command).toBe('dev');
        });

        it('should return dev for dev stage', () => {
            const command = getMigrationCommand('dev');

            expect(command).toBe('dev');
        });

        it('should return dev for local stage', () => {
            const command = getMigrationCommand('local');

            expect(command).toBe('dev');
        });

        it('should return dev for test stage', () => {
            const command = getMigrationCommand('test');

            expect(command).toBe('dev');
        });

        it('should return deploy for production stage', () => {
            const command = getMigrationCommand('production');

            expect(command).toBe('deploy');
        });

        it('should return deploy for prod stage', () => {
            const command = getMigrationCommand('prod');

            expect(command).toBe('deploy');
        });

        it('should return deploy for staging stage', () => {
            const command = getMigrationCommand('staging');

            expect(command).toBe('deploy');
        });

        it('should default to dev when stage undefined', () => {
            const command = getMigrationCommand();

            expect(command).toBe('dev');
        });

        it('should read from STAGE environment variable when no argument', () => {
            process.env.STAGE = 'production';

            const command = getMigrationCommand();

            expect(command).toBe('deploy');
        });

        it('should prioritize argument over STAGE env var', () => {
            process.env.STAGE = 'production';

            const command = getMigrationCommand('development');

            expect(command).toBe('dev');
        });

        it('should handle case-insensitive stage names', () => {
            expect(getMigrationCommand('DEVELOPMENT')).toBe('dev');
            expect(getMigrationCommand('PRODUCTION')).toBe('deploy');
            expect(getMigrationCommand('Dev')).toBe('dev');
            expect(getMigrationCommand('Prod')).toBe('deploy');
        });

        it('should return deploy for unknown stages', () => {
            const command = getMigrationCommand('unknown-stage');

            expect(command).toBe('deploy');
        });
    });
});
