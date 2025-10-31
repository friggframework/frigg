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

                // After 1 second, completion marker appears (concurrent process finished)
                let callCount = 0;
                fs.existsSync = jest.fn((path) => {
                    callCount++;
                    if (path.endsWith('.build-complete')) {
                        return callCount > 2; // Appears after setTimeout
                    }
                    if (path.endsWith('layers/prisma')) return true;
                    return false;
                });
                fs.writeFileSync = jest.fn();
                fs.rmSync = jest.fn();

                const promise = ensurePrismaLayerExists();

                // Fast-forward through the wait
                jest.advanceTimersByTime(1000);

                await promise;

                // Should not rebuild (concurrent process completed)
                expect(buildPrismaLayer).not.toHaveBeenCalled();

                jest.useRealTimers();
            });
        });
    });
});

