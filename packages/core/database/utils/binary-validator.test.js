const path = require('path');
const fs = require('fs');

// Mock dependencies before importing module under test
jest.mock('fs');
jest.mock('./platform-detector');

const {
    checkPlatformBinary,
    listAvailableBinaries,
    validatePrismaClient,
    needsRegeneration
} = require('./binary-validator');

const { getPrismaBinaryTarget } = require('./platform-detector');

describe('BinaryValidator', () => {
    const mockClientPath = '/path/to/generated/prisma-mongodb';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkPlatformBinary', () => {
        describe('happy path', () => {
            it('should find binary for darwin-arm64 platform', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === path.join(mockClientPath, 'libquery_engine-darwin-arm64.so.node');
                });

                const result = checkPlatformBinary(mockClientPath);

                expect(result).toEqual({
                    exists: true,
                    binaryPath: path.join(mockClientPath, 'libquery_engine-darwin-arm64.so.node'),
                    target: 'darwin-arm64'
                });
            });

            it('should find binary for darwin platform', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin');
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === path.join(mockClientPath, 'libquery_engine-darwin.so.node');
                });

                const result = checkPlatformBinary(mockClientPath);

                expect(result.exists).toBe(true);
                expect(result.target).toBe('darwin');
            });

            it('should find binary with .dll.node extension for Windows', () => {
                getPrismaBinaryTarget.mockReturnValue('windows');
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === path.join(mockClientPath, 'libquery_engine-windows.dll.node');
                });

                const result = checkPlatformBinary(mockClientPath);

                expect(result.exists).toBe(true);
                expect(result.target).toBe('windows');
                expect(result.binaryPath).toContain('libquery_engine-windows.dll.node');
            });

            it('should find binary with alternative extension', () => {
                getPrismaBinaryTarget.mockReturnValue('linux-musl');
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === path.join(mockClientPath, 'libquery_engine-linux-musl.node');
                });

                const result = checkPlatformBinary(mockClientPath);

                expect(result.exists).toBe(true);
                expect(result.binaryPath).toContain('.node');
            });
        });

        describe('error cases', () => {
            it('should return error when platform target cannot be determined', () => {
                getPrismaBinaryTarget.mockReturnValue(null);

                const result = checkPlatformBinary(mockClientPath);

                expect(result).toEqual({
                    exists: false,
                    error: 'Unable to determine platform binary target'
                });
            });

            it('should return error when binary is not found', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
                fs.existsSync.mockReturnValue(false);

                const result = checkPlatformBinary(mockClientPath);

                expect(result).toEqual({
                    exists: false,
                    target: 'darwin-arm64',
                    error: 'Query engine binary not found for platform: darwin-arm64'
                });
            });

            it('should handle fs.existsSync throwing an error', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
                fs.existsSync.mockImplementation(() => {
                    throw new Error('Permission denied');
                });

                const result = checkPlatformBinary(mockClientPath);

                expect(result.exists).toBe(false);
                expect(result.error).toContain('Error checking platform binary');
            });
        });

        describe('custom target parameter', () => {
            it('should check for custom binary target when provided', () => {
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === path.join(mockClientPath, 'libquery_engine-rhel-openssl-3.0.x.so.node');
                });

                const result = checkPlatformBinary(mockClientPath, 'rhel-openssl-3.0.x');

                expect(result.exists).toBe(true);
                expect(result.target).toBe('rhel-openssl-3.0.x');
            });
        });
    });

    describe('listAvailableBinaries', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should list all available binary targets', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                'libquery_engine-darwin-arm64.so.node',
                'libquery_engine-rhel-openssl-3.0.x.so.node',
                'index.js',
                'schema.prisma',
                'libquery_engine-linux-musl.so.node'
            ]);

            const result = listAvailableBinaries(mockClientPath);

            expect(result).toEqual([
                'darwin-arm64',
                'rhel-openssl-3.0.x',
                'linux-musl'
            ]);
        });

        it('should handle .dll.node extension for Windows', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                'libquery_engine-windows.dll.node',
                'index.js'
            ]);

            const result = listAvailableBinaries(mockClientPath);

            expect(result).toEqual(['windows']);
        });

        it('should return empty array when client directory does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            const result = listAvailableBinaries(mockClientPath);

            expect(result).toEqual([]);
        });

        it('should return empty array when no binaries found', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue([
                'index.js',
                'schema.prisma'
            ]);

            const result = listAvailableBinaries(mockClientPath);

            expect(result).toEqual([]);
        });

        it('should handle readdirSync throwing an error', () => {
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = listAvailableBinaries(mockClientPath);

            expect(result).toEqual([]);
        });
    });

    describe('validatePrismaClient', () => {
        const clientIndexPath = path.join(mockClientPath, 'index.js');

        beforeEach(() => {
            jest.clearAllMocks();
        });

        describe('happy path', () => {
            it('should return valid when client exists with platform binary', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === mockClientPath ||
                        filePath === clientIndexPath ||
                        filePath === path.join(mockClientPath, 'libquery_engine-darwin-arm64.so.node');
                });

                const result = validatePrismaClient(mockClientPath);

                expect(result).toEqual({
                    valid: true,
                    clientExists: true,
                    platformBinaryExists: true,
                    requiredTarget: 'darwin-arm64',
                    binaryPath: path.join(mockClientPath, 'libquery_engine-darwin-arm64.so.node'),
                    clientPath: mockClientPath
                });
            });
        });

        describe('error cases', () => {
            it('should return error when client directory does not exist', () => {
                fs.existsSync.mockReturnValue(false);

                const result = validatePrismaClient(mockClientPath);

                expect(result).toEqual({
                    valid: false,
                    clientExists: false,
                    platformBinaryExists: false,
                    error: 'Prisma client directory not found',
                    clientPath: mockClientPath
                });
            });

            it('should return error when index.js does not exist', () => {
                fs.existsSync.mockImplementation((filePath) => {
                    return filePath === mockClientPath;
                });

                const result = validatePrismaClient(mockClientPath);

                expect(result).toEqual({
                    valid: false,
                    clientExists: false,
                    platformBinaryExists: false,
                    error: 'Prisma client index.js not found',
                    clientPath: mockClientPath
                });
            });

            it('should provide suggestion when client exists but platform binary is missing', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
                fs.existsSync.mockImplementation((filePath) => {
                    // Client directory and index exist, but not the platform binary
                    if (filePath === mockClientPath || filePath === clientIndexPath) {
                        return true;
                    }
                    // No darwin-arm64 binary exists
                    return false;
                });
                fs.readdirSync.mockReturnValue([
                    'libquery_engine-rhel-openssl-3.0.x.so.node',
                    'index.js'
                ]);

                const result = validatePrismaClient(mockClientPath);

                expect(result).toEqual({
                    valid: false,
                    clientExists: true,
                    platformBinaryExists: false,
                    requiredTarget: 'darwin-arm64',
                    availableTargets: ['rhel-openssl-3.0.x'],
                    error: 'Query engine binary not found for platform: darwin-arm64',
                    clientPath: mockClientPath,
                    suggestion: "Found binaries for: rhel-openssl-3.0.x. Run 'frigg db:setup' to regenerate for your platform."
                });
            });

            it('should provide suggestion when no binaries found at all', () => {
                getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
                fs.existsSync.mockImplementation((filePath) => {
                    // Client directory and index exist, but no binaries
                    if (filePath === mockClientPath || filePath === clientIndexPath) {
                        return true;
                    }
                    // No platform binaries exist
                    return false;
                });
                fs.readdirSync.mockReturnValue(['index.js', 'schema.prisma']);

                const result = validatePrismaClient(mockClientPath);

                expect(result.valid).toBe(false);
                expect(result.clientExists).toBe(true);
                expect(result.platformBinaryExists).toBe(false);
                expect(result.availableTargets).toEqual([]);
                expect(result.suggestion).toBe("No query engine binaries found. Run 'frigg db:setup' to generate the client.");
            });
        });
    });

    describe('needsRegeneration', () => {
        const clientIndexPath = path.join(mockClientPath, 'index.js');

        it('should return true when client exists but platform binary is missing', () => {
            getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
            fs.existsSync.mockImplementation((filePath) => {
                return filePath === mockClientPath ||
                    filePath === clientIndexPath;
            });
            fs.readdirSync.mockReturnValue(['index.js']);

            const result = needsRegeneration(mockClientPath);

            expect(result).toBe(true);
        });

        it('should return false when client does not exist', () => {
            fs.existsSync.mockReturnValue(false);

            const result = needsRegeneration(mockClientPath);

            expect(result).toBe(false);
        });

        it('should return false when client exists with platform binary', () => {
            getPrismaBinaryTarget.mockReturnValue('darwin-arm64');
            fs.existsSync.mockImplementation((filePath) => {
                return filePath === mockClientPath ||
                    filePath === clientIndexPath ||
                    filePath === path.join(mockClientPath, 'libquery_engine-darwin-arm64.so.node');
            });

            const result = needsRegeneration(mockClientPath);

            expect(result).toBe(false);
        });
    });
});
