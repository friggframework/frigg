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
            fs.existsSync = jest.fn().mockReturnValue(true);

            await ensurePrismaLayerExists();

            expect(fs.existsSync).toHaveBeenCalledWith('/project/layers/prisma');
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
            fs.existsSync = jest.fn().mockReturnValue(true);

            await ensurePrismaLayerExists();

            expect(fs.existsSync).toHaveBeenCalledWith('/custom/project/path/layers/prisma');
        });

        it('should log success when layer already exists', async () => {
            fs.existsSync = jest.fn().mockReturnValue(true);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await ensurePrismaLayerExists();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('already exists')
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

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to build')
            );

            consoleErrorSpy.mockRestore();
        });
    });
});

