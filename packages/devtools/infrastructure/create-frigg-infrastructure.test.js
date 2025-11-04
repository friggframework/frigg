/**
 * Tests for Infrastructure Creation with Caching
 *
 * Tests the caching mechanism to prevent duplicate infrastructure composition
 * during deployment and health check flows.
 */

const path = require('path');
const fs = require('fs-extra');
const { createFriggInfrastructure } = require('./create-frigg-infrastructure');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('./infrastructure-composer');
jest.mock('@friggframework/core', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));

const { composeServerlessDefinition } = require('./infrastructure-composer');
const { findNearestBackendPackageJson } = require('@friggframework/core');

describe('createFriggInfrastructure with Caching', () => {
    const mockBackendPath = '/project/backend/package.json';
    const mockBackendDir = '/project/backend';
    const mockBackendFile = path.join(mockBackendDir, 'index.js');
    const mockCachePath = path.join(mockBackendDir, '.frigg', 'cache', 'infrastructure.json');
    const mockLockPath = path.join(mockBackendDir, '.frigg', 'cache', '.lock');

    const mockAppDefinition = {
        name: 'test-app',
        integrations: []
    };

    const mockComposedDefinition = {
        service: 'test-app',
        provider: { name: 'aws' },
        functions: {}
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));

        // Setup default mocks
        findNearestBackendPackageJson.mockReturnValue(mockBackendPath);
        fs.existsSync.mockReturnValue(false); // No cache by default
        composeServerlessDefinition.mockResolvedValue(mockComposedDefinition);

        // Mock require for backend/index.js
        jest.mock(mockBackendFile, () => ({
            Definition: mockAppDefinition
        }), { virtual: true });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.unmock(mockBackendFile);
    });

    describe('Cache Management', () => {
        it('should compose infrastructure when no cache exists', async () => {
            fs.existsSync.mockReturnValue(false);

            await createFriggInfrastructure();

            expect(composeServerlessDefinition).toHaveBeenCalledWith(mockAppDefinition);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                mockCachePath,
                expect.stringContaining('"definition"'),
                'utf-8'
            );
        });

        it('should use cached infrastructure when cache is fresh (< 15 minutes)', async () => {
            const cachedData = {
                timestamp: Date.now(),
                definition: mockComposedDefinition
            };

            fs.existsSync.mockImplementation((p) => p === mockCachePath);
            fs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

            const result = await createFriggInfrastructure();

            expect(result).toEqual(mockComposedDefinition);
            expect(composeServerlessDefinition).not.toHaveBeenCalled();
        });

        it('should recompose when cache is expired (> 15 minutes)', async () => {
            const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000 + 1000);
            const cachedData = {
                timestamp: fifteenMinutesAgo,
                definition: { old: 'definition' }
            };

            fs.existsSync.mockImplementation((p) => p === mockCachePath);
            fs.readFileSync.mockReturnValue(JSON.stringify(cachedData));

            await createFriggInfrastructure();

            expect(composeServerlessDefinition).toHaveBeenCalled();
            expect(fs.removeSync).toHaveBeenCalledWith(mockCachePath);
        });

        it('should handle corrupted cache file gracefully', async () => {
            fs.existsSync.mockImplementation((p) => p === mockCachePath);
            fs.readFileSync.mockReturnValue('{ invalid json }');

            await createFriggInfrastructure();

            expect(composeServerlessDefinition).toHaveBeenCalled();
            expect(fs.removeSync).toHaveBeenCalledWith(mockCachePath);
        });

        it('should clean up cache on composition error', async () => {
            fs.existsSync.mockReturnValue(false);
            composeServerlessDefinition.mockRejectedValue(new Error('Composition failed'));

            await expect(createFriggInfrastructure()).rejects.toThrow('Composition failed');

            expect(fs.removeSync).toHaveBeenCalledWith(mockCachePath);
        });
    });

    describe('Lock Mechanism', () => {
        it('should create lock file during composition', async () => {
            fs.existsSync.mockReturnValue(false);

            await createFriggInfrastructure();

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                mockLockPath,
                process.pid.toString()
            );
        });

        it('should remove lock file after successful composition', async () => {
            fs.existsSync.mockReturnValue(false);

            await createFriggInfrastructure();

            expect(fs.removeSync).toHaveBeenCalledWith(mockLockPath);
        });

        it('should remove lock file after failed composition', async () => {
            fs.existsSync.mockReturnValue(false);
            composeServerlessDefinition.mockRejectedValue(new Error('Failed'));

            await expect(createFriggInfrastructure()).rejects.toThrow('Failed');

            expect(fs.removeSync).toHaveBeenCalledWith(mockLockPath);
        });

        it('should wait for concurrent composition to complete', async () => {
            const otherPid = 12345;

            // Mock lock file exists with different PID
            fs.existsSync.mockImplementation((p) => {
                if (p === mockLockPath) return true;
                if (p === mockCachePath) {
                    // Simulate other process creating cache after 2 seconds
                    const elapsed = jest.now() - new Date('2025-01-01T00:00:00Z').getTime();
                    return elapsed >= 2000;
                }
                return false;
            });

            fs.readFileSync.mockImplementation((p) => {
                if (p === mockLockPath) return otherPid.toString();
                if (p === mockCachePath) {
                    return JSON.stringify({
                        timestamp: Date.now(),
                        definition: mockComposedDefinition
                    });
                }
                throw new Error('File not found');
            });

            // Mock process.kill to simulate process is running
            const originalKill = process.kill;
            process.kill = jest.fn((pid, signal) => {
                if (pid === otherPid && signal === 0) return;
                throw new Error('Process not found');
            });

            // Advance timers to simulate waiting
            setTimeout(() => {
                jest.advanceTimersByTime(2000);
            }, 0);

            const result = await createFriggInfrastructure();

            expect(result).toEqual(mockComposedDefinition);
            expect(composeServerlessDefinition).not.toHaveBeenCalled();

            process.kill = originalKill;
        });

        it('should clean up stale lock file if process not running', async () => {
            const stalePid = 99999;

            fs.existsSync.mockImplementation((p) => p === mockLockPath);
            fs.readFileSync.mockReturnValue(stalePid.toString());

            // Mock process.kill to indicate process not running
            const originalKill = process.kill;
            process.kill = jest.fn((pid, signal) => {
                if (pid === stalePid && signal === 0) {
                    throw new Error('ESRCH');
                }
            });

            await createFriggInfrastructure();

            expect(fs.removeSync).toHaveBeenCalledWith(mockLockPath);
            expect(composeServerlessDefinition).toHaveBeenCalled();

            process.kill = originalKill;
        });
    });

    describe('Cache Directory Management', () => {
        it('should ensure .frigg/cache directory exists before writing', async () => {
            fs.existsSync.mockReturnValue(false);

            await createFriggInfrastructure();

            expect(fs.ensureDirSync).toHaveBeenCalledWith(
                path.join(mockBackendDir, '.frigg', 'cache')
            );
        });
    });

    describe('Error Handling', () => {
        it('should throw error if backend package.json not found', async () => {
            findNearestBackendPackageJson.mockReturnValue(null);

            await expect(createFriggInfrastructure()).rejects.toThrow(
                'Could not find backend package.json'
            );
        });

        it('should throw error if index.js not found', async () => {
            fs.existsSync.mockImplementation((p) => {
                if (p === mockBackendFile) return false;
                return false;
            });

            await expect(createFriggInfrastructure()).rejects.toThrow(
                'Could not find index.js'
            );
        });

        it('should handle lock file write error gracefully', async () => {
            fs.existsSync.mockReturnValue(false);
            fs.writeFileSync.mockImplementation((p) => {
                if (p === mockLockPath) {
                    throw new Error('Permission denied');
                }
            });

            // Should continue despite lock error
            await createFriggInfrastructure();

            expect(composeServerlessDefinition).toHaveBeenCalled();
        });

        it('should handle cache write error gracefully', async () => {
            fs.existsSync.mockReturnValue(false);
            fs.writeFileSync.mockImplementation((p) => {
                if (p === mockCachePath) {
                    throw new Error('Disk full');
                }
            });

            // Should still return the definition
            const result = await createFriggInfrastructure();

            expect(result).toEqual(mockComposedDefinition);
        });
    });
});
