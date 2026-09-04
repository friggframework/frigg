/**
 * Tests for Prisma Layer Manager
 * 
 * Tests Prisma Lambda Layer existence checking and building
 */

const path = require('path');
const fs = require('fs');
const { ensurePrismaLayerExists } = require('./prisma-layer-manager');

// Mock fs and buildPrismaLayer
jest.mock('fs');
jest.mock('../../../scripts/build-prisma-layer', () => ({
    buildPrismaLayer: jest.fn(),
}));

const { buildPrismaLayer } = require('../../../scripts/build-prisma-layer');

// Helper to mock fs methods for different scenarios
const mockFs = {
    completedBuild: () => {
        fs.existsSync = jest.fn((path) => {
            if (path.endsWith('.build-complete')) return true;
            if (path.endsWith('layers/prisma')) return true;
            return false;
        });
        fs.writeFileSync = jest.fn();
        fs.rmSync = jest.fn();
    },
    incompleteBuild: () => {
        fs.existsSync = jest.fn((path) => {
            if (path.endsWith('.build-complete')) return false;
            if (path.endsWith('layers/prisma')) return true;
            return false;
        });
        fs.writeFileSync = jest.fn();
        fs.rmSync = jest.fn();
    },
    noBuild: () => {
        fs.existsSync = jest.fn().mockReturnValue(false);
        fs.writeFileSync = jest.fn();
        fs.rmSync = jest.fn();
    },
};

describe('Prisma Layer Manager', () => {
    let originalCwd;

    beforeEach(() => {
        originalCwd = process.cwd;
        process.cwd = jest.fn().mockReturnValue('/project');
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.cwd = originalCwd;
    });

    describe('ensurePrismaLayerExists()', () => {
        it('should skip build if layer already exists', async () => {
            fs.existsSync = jest.fn((path) => {
                // Completion marker exists
                if (path.endsWith('.build-complete')) return true;
                return false;
            });

            await ensurePrismaLayerExists();

            expect(fs.existsSync).toHaveBeenCalledWith('/project/layers/prisma/.build-complete');
            expect(buildPrismaLayer).not.toHaveBeenCalled();
        });

        it('should build layer if it does not exist', async () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            buildPrismaLayer.mockResolvedValue();

            await ensurePrismaLayerExists();

            expect(buildPrismaLayer).toHaveBeenCalledTimes(1);
        });

        it('should pass database config to buildPrismaLayer', async () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            buildPrismaLayer.mockResolvedValue();

            const databaseConfig = {
                postgres: { enable: true },
            };

            await ensurePrismaLayerExists(databaseConfig);

            expect(buildPrismaLayer).toHaveBeenCalledWith(databaseConfig);
        });

        it('should handle build errors and rethrow', async () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            buildPrismaLayer.mockRejectedValue(new Error('Build failed'));

            await expect(ensurePrismaLayerExists()).rejects.toThrow('Build failed');
        });

        it('should default to empty database config', async () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            buildPrismaLayer.mockResolvedValue();

            await ensurePrismaLayerExists();

            expect(buildPrismaLayer).toHaveBeenCalledWith({});
        });

        it('should use correct layer path relative to project root', async () => {
            process.cwd = jest.fn().mockReturnValue('/custom/project/path');
            fs.existsSync = jest.fn((path) => {
                // Completion marker exists
                if (path.endsWith('.build-complete')) return true;
                return false;
            });

            await ensurePrismaLayerExists();

            expect(fs.existsSync).toHaveBeenCalledWith('/custom/project/path/layers/prisma/.build-complete');
        });

        it('should log success when layer already exists', async () => {
            fs.existsSync = jest.fn().mockReturnValue(true);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await ensurePrismaLayerExists();

            // console.log is called with 2 args: message + path
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('already exists'),
                expect.any(String)
            );

            consoleSpy.mockRestore();
        });

        it('should log build progress when building layer', async () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            buildPrismaLayer.mockResolvedValue();
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await ensurePrismaLayerExists();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('building automatically')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('built successfully')
            );

            consoleSpy.mockRestore();
        });

        it('should log error message on build failure', async () => {
            fs.existsSync = jest.fn().mockReturnValue(false);
            buildPrismaLayer.mockRejectedValue(new Error('Build error'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            await expect(ensurePrismaLayerExists()).rejects.toThrow();

            // console.error is called with 2 args: message + error
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to build'),
                expect.any(String)
            );

            consoleErrorSpy.mockRestore();
        });

        describe('Concurrent Build Protection', () => {
            it('should skip build if completion marker exists (TDD)', async () => {
                mockFs.completedBuild();

                await ensurePrismaLayerExists();

                expect(fs.existsSync).toHaveBeenCalledWith('/project/layers/prisma/.build-complete');
                expect(buildPrismaLayer).not.toHaveBeenCalled();
            });

            it('should wait for active build process to complete (TDD)', async () => {
                jest.useFakeTimers();

                // Mock active lock file with running process
                const activePid = 12345;
                let completionMarkerExists = false;
                fs.existsSync = jest.fn((path) => {
                    if (path.endsWith('.build-complete')) return completionMarkerExists;
                    if (path.endsWith('.build-lock')) return true;
                    if (path.endsWith('layers/prisma')) return true;
                    return false;
                });
                fs.readFileSync = jest.fn().mockReturnValue(activePid.toString());
                fs.writeFileSync = jest.fn();
                fs.rmSync = jest.fn();

                // Mock process.kill to simulate running process, then completion
                let killCallCount = 0;
                const originalKill = process.kill;
                process.kill = jest.fn((pid, signal) => {
                    killCallCount++;
                    if (killCallCount >= 3) {
                        // After 3 seconds, build completes
                        completionMarkerExists = true;
                    }
                    return true; // Process is running
                });

                const promise = ensurePrismaLayerExists();

                // Fast-forward through the wait loop
                for (let i = 0; i < 5; i++) {
                    jest.advanceTimersByTime(1000);
                    await Promise.resolve();
                }

                await promise;

                // Should not rebuild (waited for concurrent build)
                expect(buildPrismaLayer).not.toHaveBeenCalled();

                process.kill = originalKill;
                jest.useRealTimers();
            });

            it('should clean stale lock file if process not running (TDD)', async () => {
                // Mock stale lock file (process not running)
                fs.existsSync = jest.fn((path) => {
                    if (path.endsWith('.build-complete')) return false;
                    if (path.endsWith('.build-lock')) return true;
                    if (path.endsWith('layers/prisma')) return false;
                    return false;
                });
                fs.readFileSync = jest.fn().mockReturnValue('99999');
                fs.writeFileSync = jest.fn();
                fs.mkdirSync = jest.fn();
                fs.rmSync = jest.fn();

                // Mock process.kill to throw (process not running)
                const originalKill = process.kill;
                process.kill = jest.fn(() => {
                    throw new Error('ESRCH');
                });

                buildPrismaLayer.mockResolvedValue();

                await ensurePrismaLayerExists();

                // Should remove stale lock
                expect(fs.rmSync).toHaveBeenCalledWith('/project/layers/prisma/.build-lock', { force: true });
                // Should proceed with build
                expect(buildPrismaLayer).toHaveBeenCalled();

                process.kill = originalKill;
            });

            it('should create and remove lock file during build (TDD)', async () => {
                // Mock to simulate successful build flow
                fs.existsSync = jest.fn((path) => {
                    // Completion marker doesn't exist initially
                    if (path.endsWith('.build-complete')) return false;
                    // Lock file exists in finally block (after writeFileSync)
                    if (path.endsWith('.build-lock')) return true;
                    // Directory doesn't exist initially
                    if (path.endsWith('layers/prisma')) return false;
                    return false;
                });
                fs.writeFileSync = jest.fn();
                fs.mkdirSync = jest.fn();
                fs.rmSync = jest.fn();
                buildPrismaLayer.mockResolvedValue();

                await ensurePrismaLayerExists();

                // Should create directory for lock file
                expect(fs.mkdirSync).toHaveBeenCalledWith('/project/layers/prisma', { recursive: true });

                // Should create lock file with PID
                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    '/project/layers/prisma/.build-lock',
                    expect.any(String)
                );

                // Should create completion marker
                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    '/project/layers/prisma/.build-complete',
                    expect.any(String)
                );

                // Should remove lock file in finally block
                expect(fs.rmSync).toHaveBeenCalledWith(
                    '/project/layers/prisma/.build-lock',
                    { force: true }
                );
            });

            it('should remove lock file even if build fails (TDD)', async () => {
                mockFs.noBuild();
                fs.mkdirSync = jest.fn();
                buildPrismaLayer.mockRejectedValue(new Error('Build failed'));

                // After failure, directory exists
                fs.existsSync = jest.fn((path) => {
                    if (path.endsWith('.build-complete')) return false;
                    if (path.endsWith('.build-lock')) return true;
                    if (path.endsWith('layers/prisma')) return true;
                    return false;
                });

                await expect(ensurePrismaLayerExists()).rejects.toThrow('Build failed');

                // Should remove lock file in finally block
                expect(fs.rmSync).toHaveBeenCalledWith(
                    '/project/layers/prisma/.build-lock',
                    { force: true }
                );
            });

            it('should wait and rebuild if directory exists without completion marker (TDD)', async () => {
                jest.useFakeTimers();
                mockFs.incompleteBuild();
                buildPrismaLayer.mockResolvedValue();

                const promise = ensurePrismaLayerExists();

                // Fast-forward through the wait
                jest.advanceTimersByTime(1000);

                await promise;

                // Should NOT manually clean (buildPrismaLayer handles this)
                expect(fs.rmSync).not.toHaveBeenCalled();
                // Should rebuild
                expect(buildPrismaLayer).toHaveBeenCalled();
                // Should create completion marker
                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    '/project/layers/prisma/.build-complete',
                    expect.any(String)
                );

                jest.useRealTimers();
            });

            it('should create completion marker after successful build (TDD)', async () => {
                mockFs.noBuild();
                buildPrismaLayer.mockResolvedValue();

                await ensurePrismaLayerExists();

                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    '/project/layers/prisma/.build-complete',
                    expect.any(String)
                );
            });

            it('should clean up partial build on failure (TDD)', async () => {
                mockFs.noBuild();
                buildPrismaLayer.mockRejectedValue(new Error('Build failed'));

                // After build attempt fails, directory exists
                fs.existsSync = jest.fn((path) => {
                    if (path.endsWith('.build-complete')) return false;
                    if (path.endsWith('layers/prisma')) return true;
                    return false;
                });

                await expect(ensurePrismaLayerExists()).rejects.toThrow('Build failed');

                // Should clean up after failure
                expect(fs.rmSync).toHaveBeenCalledWith(
                    '/project/layers/prisma',
                    { recursive: true, force: true }
                );
            });

            it('should wait for potential concurrent build before rebuilding (TDD)', async () => {
                jest.useFakeTimers();
                mockFs.incompleteBuild();
                buildPrismaLayer.mockResolvedValue();

                const promise = ensurePrismaLayerExists();

                // Fast-forward through the wait
                jest.advanceTimersByTime(1000);

                await promise;

                // Should wait before rebuilding
                // Should still attempt to build
                expect(buildPrismaLayer).toHaveBeenCalled();

                jest.useRealTimers();
            });

            it('should detect when concurrent process completes during wait (TDD)', async () => {
                jest.useFakeTimers();

                // Simulate lock file existing with completion happening during wait
                let completionMarkerExists = false;
                let lockFileExists = true;
                fs.existsSync = jest.fn((path) => {
                    if (path.endsWith('.build-complete')) return completionMarkerExists;
                    if (path.endsWith('.build-lock')) return lockFileExists;
                    if (path.endsWith('layers/prisma')) return true;
                    return false;
                });
                fs.readFileSync = jest.fn().mockReturnValue('12345');
                fs.writeFileSync = jest.fn();
                fs.rmSync = jest.fn();

                // Mock process.kill to simulate active process
                let killCallCount = 0;
                const originalKill = process.kill;
                process.kill = jest.fn((pid, signal) => {
                    killCallCount++;
                    if (killCallCount >= 3) {
                        // After 3 checks, build completes
                        completionMarkerExists = true;
                        lockFileExists = false;
                    }
                    return true; // Process is running
                });

                const promise = ensurePrismaLayerExists();

                // Fast-forward through the wait loop
                for (let i = 0; i < 5; i++) {
                    jest.advanceTimersByTime(1000);
                    await Promise.resolve();
                }

                await promise;

                // Should not rebuild (concurrent process completed)
                expect(buildPrismaLayer).not.toHaveBeenCalled();

                process.kill = originalKill;
                jest.useRealTimers();
            });
        });
    });
});

