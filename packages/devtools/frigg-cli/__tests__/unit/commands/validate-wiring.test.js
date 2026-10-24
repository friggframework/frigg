/**
 * build and deploy validate the app definition first and stop on errors;
 * start validates and only warns (ADR-051).
 */

// child_process and node:child_process are one module to jest: one mock.
const mockChildProcess = {
    spawnSync: jest.fn(() => ({ status: 0 })),
    spawn: jest.fn(),
};
jest.mock('child_process', () => mockChildProcess);
jest.mock('node:child_process', () => mockChildProcess);
jest.mock('../../../validate-command', () => ({
    preflightValidation: jest.fn(),
}));
jest.mock('../../../doctor-command', () => ({ doctorCommand: jest.fn() }));
jest.mock('../../../utils/database-validator', () => ({
    validateDatabaseUrl: jest.fn(() => ({ valid: true })),
    getDatabaseType: jest.fn(() => ({ dbType: 'postgresql' })),
    checkPrismaClientGenerated: jest.fn(() => ({ generated: true })),
}));
jest.mock('dotenv', () => ({ config: jest.fn() }));

const childProcess = mockChildProcess;
const nodeChildProcess = mockChildProcess;
const { preflightValidation } = require('../../../validate-command');
const { buildCommand } = require('../../../build-command');
const { deployCommand } = require('../../../deploy-command');
const { startCommand } = require('../../../start-command');

describe('validation before build, deploy and start', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(process, 'exit').mockImplementation(() => {});
    });

    afterEach(() => jest.restoreAllMocks());

    it('build validates first and fails on errors', async () => {
        preflightValidation.mockReturnValue(false);

        await buildCommand({ stage: 'prod' });

        expect(preflightValidation).toHaveBeenCalledWith({
            command: 'build',
            options: { stage: 'prod' },
            failOnErrors: true,
        });
        expect(childProcess.spawnSync).not.toHaveBeenCalled();
    });

    it('build packages after a passing validation', async () => {
        preflightValidation.mockReturnValue(true);

        await buildCommand({ stage: 'prod' });

        expect(childProcess.spawnSync).toHaveBeenCalled();
    });

    it('deploy validates first and fails on errors', async () => {
        preflightValidation.mockReturnValue(false);

        await deployCommand({ stage: 'prod', skipValidate: false });

        expect(preflightValidation).toHaveBeenCalledWith({
            command: 'deploy',
            options: { stage: 'prod', skipValidate: false },
            failOnErrors: true,
        });
        expect(childProcess.spawn).not.toHaveBeenCalled();
    });

    it('start validates and only warns', async () => {
        preflightValidation.mockReturnValue(true);
        nodeChildProcess.spawn.mockReturnValue({ on: jest.fn() });
        const previous = process.env.DATABASE_URL;
        process.env.DATABASE_URL = 'postgresql://localhost/frigg';

        await startCommand({ stage: 'dev' });

        process.env.DATABASE_URL = previous;
        expect(preflightValidation).toHaveBeenCalledWith({
            command: 'start',
            options: { stage: 'dev' },
            failOnErrors: false,
        });
        expect(nodeChildProcess.spawn).toHaveBeenCalled();
    });
});
