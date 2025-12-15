/**
 * RunPreflightChecksUseCase Tests
 * Orchestrates pre-flight checks before starting Frigg
 *
 * Tests follow TDD pattern - written BEFORE implementation
 */

const { RunPreflightChecksUseCase } = require('../../../../start-command/application/RunPreflightChecksUseCase');

describe('RunPreflightChecksUseCase', () => {
    let useCase;
    let mockDockerAdapter;
    let mockDatabaseAdapter;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset environment
        delete process.env.DATABASE_URL;

        mockDockerAdapter = {
            isDockerInstalled: jest.fn(),
            isDockerRunning: jest.fn(),
            findDockerComposeFile: jest.fn(),
            startDockerDesktop: jest.fn(),
            startDockerCompose: jest.fn(),
            waitForDockerReady: jest.fn(),
            waitForLocalStack: jest.fn()
        };

        mockDatabaseAdapter = {
            getDatabaseType: jest.fn(),
            isDatabaseReachable: jest.fn(),
            getConnectionDetails: jest.fn()
        };

        useCase = new RunPreflightChecksUseCase({
            dockerAdapter: mockDockerAdapter,
            databaseAdapter: mockDatabaseAdapter
        });
    });

    describe('execute() - All checks pass', () => {
        beforeEach(() => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(true);
            mockDockerAdapter.findDockerComposeFile.mockResolvedValue('/test/docker-compose.yml');
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({ reachable: true });
            mockDatabaseAdapter.getConnectionDetails.mockReturnValue({
                type: 'mongodb',
                host: 'localhost',
                port: 27017,
                database: 'frigg'
            });
        });

        it('should return all checks passed when everything is ready', async () => {
            const result = await useCase.execute({ projectPath: '/test/project' });

            expect(result.allPassed).toBe(true);
            // 5 checks: DATABASE_URL, docker_installed, docker_running, database_reachable, localstack_reachable
            expect(result.checks).toHaveLength(5);
        });

        it('should include DATABASE_URL check result', async () => {
            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbUrlCheck = result.checks.find(c => c.name === 'database_url');
            expect(dbUrlCheck.status).toBe('passed');
        });

        it('should include Docker installed check result', async () => {
            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerCheck = result.checks.find(c => c.name === 'docker_installed');
            expect(dockerCheck.status).toBe('passed');
        });

        it('should include Docker running check result', async () => {
            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerRunningCheck = result.checks.find(c => c.name === 'docker_running');
            expect(dockerRunningCheck.status).toBe('passed');
        });

        it('should include database reachable check result', async () => {
            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbCheck = result.checks.find(c => c.name === 'database_reachable');
            expect(dbCheck.status).toBe('passed');
        });
    });

    describe('execute() - DATABASE_URL check', () => {
        it('should fail when DATABASE_URL is not set', async () => {
            delete process.env.DATABASE_URL;

            const result = await useCase.execute({ projectPath: '/test/project' });

            expect(result.allPassed).toBe(false);
            const dbUrlCheck = result.checks.find(c => c.name === 'database_url');
            expect(dbUrlCheck.status).toBe('failed');
            expect(dbUrlCheck.message).toContain('DATABASE_URL');
        });

        it('should provide resolution option for missing DATABASE_URL', async () => {
            delete process.env.DATABASE_URL;

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbUrlCheck = result.checks.find(c => c.name === 'database_url');
            expect(dbUrlCheck.canResolve).toBe(true);
            expect(dbUrlCheck.resolution.type).toBe('create_env');
        });

        it('should pass when DATABASE_URL is set', async () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbUrlCheck = result.checks.find(c => c.name === 'database_url');
            expect(dbUrlCheck.status).toBe('passed');
        });
    });

    describe('execute() - Docker installed check', () => {
        beforeEach(() => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
        });

        it('should fail when Docker is not installed', async () => {
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(false);

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerCheck = result.checks.find(c => c.name === 'docker_installed');
            expect(dockerCheck.status).toBe('failed');
            expect(dockerCheck.message).toContain('Docker is not installed');
        });

        it('should not provide auto-resolution for Docker not installed', async () => {
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(false);

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerCheck = result.checks.find(c => c.name === 'docker_installed');
            expect(dockerCheck.canResolve).toBe(false);
            expect(dockerCheck.resolution.type).toBe('manual');
            expect(dockerCheck.resolution.instructions).toBeDefined();
        });

        it('should pass when Docker is installed', async () => {
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(true);
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({ reachable: true });

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerCheck = result.checks.find(c => c.name === 'docker_installed');
            expect(dockerCheck.status).toBe('passed');
        });
    });

    describe('execute() - Docker running check', () => {
        beforeEach(() => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });
        });

        it('should fail when Docker daemon is not running', async () => {
            mockDockerAdapter.isDockerRunning.mockResolvedValue(false);

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerRunningCheck = result.checks.find(c => c.name === 'docker_running');
            expect(dockerRunningCheck.status).toBe('failed');
            expect(dockerRunningCheck.message).toContain('Docker is not running');
        });

        it('should provide resolution option to start Docker', async () => {
            mockDockerAdapter.isDockerRunning.mockResolvedValue(false);

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerRunningCheck = result.checks.find(c => c.name === 'docker_running');
            expect(dockerRunningCheck.canResolve).toBe(true);
            expect(dockerRunningCheck.resolution.type).toBe('start_docker');
        });

        it('should pass when Docker is running', async () => {
            mockDockerAdapter.isDockerRunning.mockResolvedValue(true);
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({ reachable: true });

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dockerRunningCheck = result.checks.find(c => c.name === 'docker_running');
            expect(dockerRunningCheck.status).toBe('passed');
        });
    });

    describe('execute() - Database reachable check', () => {
        beforeEach(() => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(true);
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });
        });

        it('should fail when database is not reachable', async () => {
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({
                reachable: false,
                error: 'ECONNREFUSED'
            });
            mockDockerAdapter.findDockerComposeFile.mockResolvedValue('/test/docker-compose.yml');

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbCheck = result.checks.find(c => c.name === 'database_reachable');
            expect(dbCheck.status).toBe('failed');
            expect(dbCheck.message).toContain('Database is not reachable');
        });

        it('should provide docker-compose resolution when file exists', async () => {
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({
                reachable: false,
                error: 'ECONNREFUSED'
            });
            mockDockerAdapter.findDockerComposeFile.mockResolvedValue('/test/docker-compose.yml');

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbCheck = result.checks.find(c => c.name === 'database_reachable');
            expect(dbCheck.canResolve).toBe(true);
            expect(dbCheck.resolution.type).toBe('start_docker_compose');
            expect(dbCheck.resolution.composePath).toBe('/test/docker-compose.yml');
        });

        it('should suggest manual setup when no docker-compose exists', async () => {
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({
                reachable: false,
                error: 'ECONNREFUSED'
            });
            mockDockerAdapter.findDockerComposeFile.mockResolvedValue(null);

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbCheck = result.checks.find(c => c.name === 'database_reachable');
            expect(dbCheck.canResolve).toBe(false);
            expect(dbCheck.resolution.type).toBe('manual');
        });

        it('should pass when database is reachable', async () => {
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({ reachable: true });

            const result = await useCase.execute({ projectPath: '/test/project' });

            const dbCheck = result.checks.find(c => c.name === 'database_reachable');
            expect(dbCheck.status).toBe('passed');
        });
    });

    describe('execute() - LocalStack reachable check', () => {
        beforeEach(() => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(true);
            mockDatabaseAdapter.isDatabaseReachable.mockResolvedValue({ reachable: true });
        });

        it('should fail when LocalStack is not reachable', async () => {
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: false });
            mockDockerAdapter.findDockerComposeFile.mockResolvedValue('/test/docker-compose.yml');

            const result = await useCase.execute({ projectPath: '/test/project' });

            const localstackCheck = result.checks.find(c => c.name === 'localstack_reachable');
            expect(localstackCheck.status).toBe('failed');
            expect(localstackCheck.message).toContain('LocalStack is not reachable');
        });

        it('should provide docker-compose resolution when LocalStack is not reachable', async () => {
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: false });
            mockDockerAdapter.findDockerComposeFile.mockResolvedValue('/test/docker-compose.yml');

            const result = await useCase.execute({ projectPath: '/test/project' });

            const localstackCheck = result.checks.find(c => c.name === 'localstack_reachable');
            expect(localstackCheck.canResolve).toBe(true);
            expect(localstackCheck.resolution.type).toBe('start_docker_compose');
        });

        it('should pass when LocalStack is reachable', async () => {
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });

            const result = await useCase.execute({ projectPath: '/test/project' });

            const localstackCheck = result.checks.find(c => c.name === 'localstack_reachable');
            expect(localstackCheck.status).toBe('passed');
        });

        it('should skip LocalStack check when AWS_ENDPOINT points to real AWS', async () => {
            process.env.AWS_ENDPOINT = 'https://sqs.us-east-1.amazonaws.com';
            mockDockerAdapter.waitForLocalStack.mockResolvedValue({ ready: true });

            const result = await useCase.execute({ projectPath: '/test/project' });

            // Should not include LocalStack check when using real AWS
            const localstackCheck = result.checks.find(c => c.name === 'localstack_reachable');
            expect(localstackCheck).toBeUndefined();

            delete process.env.AWS_ENDPOINT;
        });
    });

    describe('execute() - Short-circuit behavior', () => {
        it('should skip Docker checks if DATABASE_URL is missing', async () => {
            delete process.env.DATABASE_URL;

            await useCase.execute({ projectPath: '/test/project' });

            // Docker checks should not be called since DATABASE_URL failed
            expect(mockDockerAdapter.isDockerInstalled).not.toHaveBeenCalled();
        });

        it('should skip Docker running check if Docker not installed', async () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(false);

            await useCase.execute({ projectPath: '/test/project' });

            expect(mockDockerAdapter.isDockerRunning).not.toHaveBeenCalled();
        });

        it('should skip database reachable check if Docker not running', async () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(false);

            await useCase.execute({ projectPath: '/test/project' });

            expect(mockDatabaseAdapter.isDatabaseReachable).not.toHaveBeenCalled();
        });
    });

    describe('getFailedChecks()', () => {
        it('should return only failed checks', async () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(false);

            const result = await useCase.execute({ projectPath: '/test/project' });
            const failed = useCase.getFailedChecks(result);

            expect(failed).toHaveLength(1);
            expect(failed[0].name).toBe('docker_running');
        });
    });

    describe('getResolvableChecks()', () => {
        it('should return only checks that can be auto-resolved', async () => {
            process.env.DATABASE_URL = 'mongodb://localhost:27017/frigg';
            mockDatabaseAdapter.getDatabaseType.mockReturnValue('mongodb');
            mockDockerAdapter.isDockerInstalled.mockResolvedValue(true);
            mockDockerAdapter.isDockerRunning.mockResolvedValue(false);

            const result = await useCase.execute({ projectPath: '/test/project' });
            const resolvable = useCase.getResolvableChecks(result);

            expect(resolvable).toHaveLength(1);
            expect(resolvable[0].canResolve).toBe(true);
        });
    });

    describe('Check result structure', () => {
        it('should include all required fields in check results', async () => {
            delete process.env.DATABASE_URL;

            const result = await useCase.execute({ projectPath: '/test/project' });

            const check = result.checks[0];
            expect(check).toHaveProperty('name');
            expect(check).toHaveProperty('status');
            expect(check).toHaveProperty('message');
            expect(check).toHaveProperty('canResolve');
            expect(check).toHaveProperty('resolution');
        });

        it('should include resolution details for failed checks', async () => {
            delete process.env.DATABASE_URL;

            const result = await useCase.execute({ projectPath: '/test/project' });

            const check = result.checks.find(c => c.name === 'database_url');
            expect(check.resolution).toHaveProperty('type');
        });
    });
});
