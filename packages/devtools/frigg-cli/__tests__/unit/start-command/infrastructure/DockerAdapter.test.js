/**
 * DockerAdapter Tests
 * Infrastructure adapter for Docker operations - used by pre-flight checks
 *
 * Tests follow TDD pattern - written BEFORE implementation
 */

// Mock child_process before importing
jest.mock('child_process', () => ({
    exec: jest.fn(),
    spawn: jest.fn()
}));

// Mock fs for docker-compose file detection
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    promises: {
        access: jest.fn()
    }
}));

const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import after mocks are set up
const { DockerAdapter } = require('../../../../start-command/infrastructure/DockerAdapter');

describe('DockerAdapter', () => {
    let adapter;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new DockerAdapter();
    });

    describe('isDockerInstalled()', () => {
        it('should return true when docker CLI is available', async () => {
            exec.mockImplementation((cmd, callback) => {
                callback(null, 'Docker version 24.0.7, build afdd53b', '');
            });

            const result = await adapter.isDockerInstalled();

            expect(result).toBe(true);
            expect(exec).toHaveBeenCalledWith('docker --version', expect.any(Function));
        });

        it('should return false when docker CLI is not found', async () => {
            exec.mockImplementation((cmd, callback) => {
                const error = new Error('command not found: docker');
                error.code = 127;
                callback(error, '', 'command not found: docker');
            });

            const result = await adapter.isDockerInstalled();

            expect(result).toBe(false);
        });

        it('should return false when docker command fails', async () => {
            exec.mockImplementation((cmd, callback) => {
                callback(new Error('Docker not installed'), '', '');
            });

            const result = await adapter.isDockerInstalled();

            expect(result).toBe(false);
        });
    });

    describe('isDockerRunning()', () => {
        it('should return true when Docker daemon is running', async () => {
            exec.mockImplementation((cmd, callback) => {
                callback(null, '', '');
            });

            const result = await adapter.isDockerRunning();

            expect(result).toBe(true);
            expect(exec).toHaveBeenCalledWith('docker info', expect.any(Function));
        });

        it('should return false when Docker daemon is not running', async () => {
            exec.mockImplementation((cmd, callback) => {
                const error = new Error('Cannot connect to the Docker daemon');
                callback(error, '', 'Cannot connect to the Docker daemon');
            });

            const result = await adapter.isDockerRunning();

            expect(result).toBe(false);
        });

        it('should return false when docker info command times out', async () => {
            exec.mockImplementation((cmd, callback) => {
                const error = new Error('ETIMEDOUT');
                error.code = 'ETIMEDOUT';
                callback(error, '', '');
            });

            const result = await adapter.isDockerRunning();

            expect(result).toBe(false);
        });
    });

    describe('findDockerComposeFile()', () => {
        const projectPath = '/test/project';

        it('should find docker-compose.yml in project root', async () => {
            fs.existsSync.mockImplementation((filePath) => {
                return filePath === path.join(projectPath, 'docker-compose.yml');
            });

            const result = await adapter.findDockerComposeFile(projectPath);

            expect(result).toBe(path.join(projectPath, 'docker-compose.yml'));
        });

        it('should find docker-compose.yaml in project root', async () => {
            fs.existsSync.mockImplementation((filePath) => {
                return filePath === path.join(projectPath, 'docker-compose.yaml');
            });

            const result = await adapter.findDockerComposeFile(projectPath);

            expect(result).toBe(path.join(projectPath, 'docker-compose.yaml'));
        });

        it('should find compose.yml in project root', async () => {
            fs.existsSync.mockImplementation((filePath) => {
                return filePath === path.join(projectPath, 'compose.yml');
            });

            const result = await adapter.findDockerComposeFile(projectPath);

            expect(result).toBe(path.join(projectPath, 'compose.yml'));
        });

        it('should find compose.yaml in project root', async () => {
            fs.existsSync.mockImplementation((filePath) => {
                return filePath === path.join(projectPath, 'compose.yaml');
            });

            const result = await adapter.findDockerComposeFile(projectPath);

            expect(result).toBe(path.join(projectPath, 'compose.yaml'));
        });

        it('should return null when no docker-compose file exists', async () => {
            fs.existsSync.mockReturnValue(false);

            const result = await adapter.findDockerComposeFile(projectPath);

            expect(result).toBeNull();
        });

        it('should prefer docker-compose.yml over other variants', async () => {
            // All variants exist
            fs.existsSync.mockReturnValue(true);

            const result = await adapter.findDockerComposeFile(projectPath);

            // Should return the first one checked (docker-compose.yml)
            expect(result).toBe(path.join(projectPath, 'docker-compose.yml'));
        });

        it('should search in parent directory if not found in project path', async () => {
            const backendPath = '/test/project/backend';
            fs.existsSync.mockImplementation((filePath) => {
                // Only exists in parent directory
                return filePath === path.join('/test/project', 'docker-compose.yml');
            });

            const result = await adapter.findDockerComposeFile(backendPath);

            expect(result).toBe(path.join('/test/project', 'docker-compose.yml'));
        });
    });

    describe('startDockerCompose()', () => {
        const composePath = '/test/project/docker-compose.yml';

        it('should run docker compose up -d successfully', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, 'Container started', '');
            });

            const result = await adapter.startDockerCompose(composePath);

            expect(result.success).toBe(true);
            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('docker compose'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        it('should use correct docker-compose file path', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, '', '');
            });

            await adapter.startDockerCompose(composePath);

            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining(`-f ${composePath}`),
                expect.any(Object),
                expect.any(Function)
            );
        });

        it('should return error when docker compose fails', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                const error = new Error('Service failed to start');
                callback(error, '', 'Service failed to start');
            });

            const result = await adapter.startDockerCompose(composePath);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Service failed to start');
        });

        it('should run in detached mode by default', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, '', '');
            });

            await adapter.startDockerCompose(composePath);

            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('up -d'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        it('should set working directory to compose file directory', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, '', '');
            });

            await adapter.startDockerCompose(composePath);

            expect(exec).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    cwd: path.dirname(composePath)
                }),
                expect.any(Function)
            );
        });
    });

    describe('stopDockerCompose()', () => {
        const composePath = '/test/project/docker-compose.yml';

        it('should run docker compose down successfully', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, 'Containers stopped', '');
            });

            const result = await adapter.stopDockerCompose(composePath);

            expect(result.success).toBe(true);
            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('docker compose'),
                expect.any(Object),
                expect.any(Function)
            );
            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('down'),
                expect.any(Object),
                expect.any(Function)
            );
        });

        it('should return error when docker compose down fails', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(new Error('Failed to stop'), '', 'Failed to stop');
            });

            const result = await adapter.stopDockerCompose(composePath);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to stop');
        });
    });

    describe('startDockerDesktop()', () => {
        it('should open Docker Desktop on macOS', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            exec.mockImplementation((cmd, callback) => {
                callback(null, '', '');
            });

            const result = await adapter.startDockerDesktop();

            expect(result.success).toBe(true);
            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('open'),
                expect.any(Function)
            );

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should start Docker Desktop on Windows', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });

            exec.mockImplementation((cmd, callback) => {
                callback(null, '', '');
            });

            const result = await adapter.startDockerDesktop();

            expect(result.success).toBe(true);
            expect(exec).toHaveBeenCalledWith(
                expect.stringContaining('Docker Desktop'),
                expect.any(Function)
            );

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should start docker service on Linux', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'linux' });

            exec.mockImplementation((cmd, callback) => {
                callback(null, '', '');
            });

            const result = await adapter.startDockerDesktop();

            expect(result.success).toBe(true);
            expect(exec).toHaveBeenCalledWith(
                expect.stringMatching(/systemctl|service/),
                expect.any(Function)
            );

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should return error when Docker Desktop fails to start', async () => {
            exec.mockImplementation((cmd, callback) => {
                callback(new Error('Failed to start Docker Desktop'), '', '');
            });

            const result = await adapter.startDockerDesktop();

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('getDockerComposeServices()', () => {
        const composePath = '/test/project/docker-compose.yml';

        it('should list running services', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, 'mongodb\nredis\n', '');
            });

            const result = await adapter.getDockerComposeServices(composePath);

            expect(result).toEqual(['mongodb', 'redis']);
        });

        it('should return empty array when no services running', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, '', '');
            });

            const result = await adapter.getDockerComposeServices(composePath);

            expect(result).toEqual([]);
        });

        it('should handle docker compose ps command failure', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(new Error('Failed'), '', '');
            });

            const result = await adapter.getDockerComposeServices(composePath);

            expect(result).toEqual([]);
        });
    });

    describe('isServiceRunning()', () => {
        const composePath = '/test/project/docker-compose.yml';

        it('should return true when specific service is running', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                // docker compose ps --services --filter "status=running"
                callback(null, 'mongodb\nredis\n', '');
            });

            const result = await adapter.isServiceRunning(composePath, 'mongodb');

            expect(result).toBe(true);
        });

        it('should return false when service is not running', async () => {
            exec.mockImplementation((cmd, opts, callback) => {
                if (typeof opts === 'function') {
                    callback = opts;
                }
                callback(null, 'redis\n', '');
            });

            const result = await adapter.isServiceRunning(composePath, 'mongodb');

            expect(result).toBe(false);
        });
    });

    describe('waitForDockerReady()', () => {
        it('should resolve when Docker becomes ready', async () => {
            let callCount = 0;
            exec.mockImplementation((cmd, callback) => {
                callCount++;
                if (callCount >= 3) {
                    // Docker is ready on third try
                    callback(null, '', '');
                } else {
                    callback(new Error('Not ready'), '', '');
                }
            });

            const result = await adapter.waitForDockerReady({ maxAttempts: 5, intervalMs: 10 });

            expect(result).toBe(true);
            expect(callCount).toBe(3);
        });

        it('should return false after max attempts exceeded', async () => {
            exec.mockImplementation((cmd, callback) => {
                callback(new Error('Not ready'), '', '');
            });

            const result = await adapter.waitForDockerReady({ maxAttempts: 3, intervalMs: 10 });

            expect(result).toBe(false);
        });

        it('should use default options when not specified', async () => {
            exec.mockImplementation((cmd, callback) => {
                callback(null, '', '');
            });

            const result = await adapter.waitForDockerReady();

            expect(result).toBe(true);
        });
    });
});
