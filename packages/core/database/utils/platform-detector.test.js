const os = require('os');
const fs = require('fs');

// Mock os and fs modules before importing the module under test
jest.mock('os');
jest.mock('fs');

const {
    detectPlatform,
    detectLinuxLibc,
    getRefinedPlatformKey,
    getPrismaBinaryTarget,
    isPlatformSupported,
    getPlatformDescription
} = require('./platform-detector');

describe('PlatformDetector', () => {
    describe('detectPlatform', () => {
        it('should detect macOS ARM64 platform', () => {
            os.platform.mockReturnValue('darwin');
            os.arch.mockReturnValue('arm64');

            const result = detectPlatform();

            expect(result).toEqual({
                platform: 'darwin',
                arch: 'arm64',
                platformKey: 'darwin-arm64'
            });
        });

        it('should detect macOS x64 platform', () => {
            os.platform.mockReturnValue('darwin');
            os.arch.mockReturnValue('x64');

            const result = detectPlatform();

            expect(result).toEqual({
                platform: 'darwin',
                arch: 'x64',
                platformKey: 'darwin-x64'
            });
        });

        it('should detect Linux x64 platform', () => {
            os.platform.mockReturnValue('linux');
            os.arch.mockReturnValue('x64');

            const result = detectPlatform();

            expect(result).toEqual({
                platform: 'linux',
                arch: 'x64',
                platformKey: 'linux-x64'
            });
        });

        it('should detect Windows platform', () => {
            os.platform.mockReturnValue('win32');
            os.arch.mockReturnValue('x64');

            const result = detectPlatform();

            expect(result).toEqual({
                platform: 'win32',
                arch: 'x64',
                platformKey: 'win32-x64'
            });
        });
    });

    describe('detectLinuxLibc', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should return null for non-Linux platforms', () => {
            os.platform.mockReturnValue('darwin');

            const result = detectLinuxLibc();

            expect(result).toBeNull();
        });

        it('should detect musl from ldd content', () => {
            os.platform.mockReturnValue('linux');
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('musl libc (x86_64)');

            const result = detectLinuxLibc();

            expect(result).toBe('musl');
            expect(fs.readFileSync).toHaveBeenCalledWith('/usr/bin/ldd', 'utf8');
        });

        it('should detect musl from musl-specific paths (x86_64)', () => {
            os.platform.mockReturnValue('linux');
            fs.existsSync.mockImplementation((path) => {
                return path === '/lib/ld-musl-x86_64.so.1';
            });
            fs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            const result = detectLinuxLibc();

            expect(result).toBe('musl');
        });

        it('should detect musl from musl-specific paths (aarch64)', () => {
            os.platform.mockReturnValue('linux');
            fs.existsSync.mockImplementation((path) => {
                return path === '/lib/ld-musl-aarch64.so.1';
            });
            fs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            const result = detectLinuxLibc();

            expect(result).toBe('musl');
        });

        it('should default to glibc when no musl indicators found', () => {
            os.platform.mockReturnValue('linux');
            fs.existsSync.mockImplementation((path) => {
                // ldd exists but musl paths don't
                return path === '/usr/bin/ldd';
            });
            fs.readFileSync.mockReturnValue('GNU C Library');

            const result = detectLinuxLibc();

            expect(result).toBe('glibc');
        });

        it('should default to glibc on error', () => {
            os.platform.mockReturnValue('linux');
            fs.existsSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            const result = detectLinuxLibc();

            expect(result).toBe('glibc');
        });
    });

    describe('getRefinedPlatformKey', () => {
        it('should include libc for Linux platforms', () => {
            os.platform.mockReturnValue('linux');
            os.arch.mockReturnValue('x64');
            fs.existsSync.mockImplementation((path) => {
                // ldd exists but musl paths don't
                return path === '/usr/bin/ldd';
            });
            fs.readFileSync.mockReturnValue('GNU C Library');

            const result = getRefinedPlatformKey();

            expect(result).toBe('linux-x64-glibc');
        });

        it('should not include libc for non-Linux platforms', () => {
            os.platform.mockReturnValue('darwin');
            os.arch.mockReturnValue('arm64');

            const result = getRefinedPlatformKey();

            expect(result).toBe('darwin-arm64');
        });

        it('should detect Linux musl correctly', () => {
            os.platform.mockReturnValue('linux');
            os.arch.mockReturnValue('x64');
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('musl libc');

            const result = getRefinedPlatformKey();

            expect(result).toBe('linux-x64-musl');
        });
    });

    describe('getPrismaBinaryTarget', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        describe('macOS platforms', () => {
            it('should return darwin-arm64 for macOS ARM64', () => {
                os.platform.mockReturnValue('darwin');
                os.arch.mockReturnValue('arm64');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('darwin-arm64');
            });

            it('should return darwin for macOS x64', () => {
                os.platform.mockReturnValue('darwin');
                os.arch.mockReturnValue('x64');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('darwin');
            });
        });

        describe('Linux platforms', () => {
            it('should return linux-musl for Linux x64 with glibc', () => {
                os.platform.mockReturnValue('linux');
                os.arch.mockReturnValue('x64');
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue('GNU C Library');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('linux-musl');
            });

            it('should return linux-musl for Linux x64 with musl', () => {
                os.platform.mockReturnValue('linux');
                os.arch.mockReturnValue('x64');
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue('musl libc');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('linux-musl');
            });

            it('should return linux-arm64-openssl-1.1.x for Linux ARM64', () => {
                os.platform.mockReturnValue('linux');
                os.arch.mockReturnValue('arm64');
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue('GNU C Library');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('linux-arm64-openssl-1.1.x');
            });
        });

        describe('Windows platforms', () => {
            it('should return windows for Windows x64', () => {
                os.platform.mockReturnValue('win32');
                os.arch.mockReturnValue('x64');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('windows');
            });

            it('should return windows for Windows ia32', () => {
                os.platform.mockReturnValue('win32');
                os.arch.mockReturnValue('ia32');

                const result = getPrismaBinaryTarget();

                expect(result).toBe('windows');
            });
        });

        describe('unsupported platforms', () => {
            it('should return null for unsupported platform', () => {
                os.platform.mockReturnValue('freebsd');
                os.arch.mockReturnValue('x64');

                const result = getPrismaBinaryTarget();

                expect(result).toBeNull();
            });
        });
    });

    describe('isPlatformSupported', () => {
        it('should return true for macOS', () => {
            os.platform.mockReturnValue('darwin');
            os.arch.mockReturnValue('arm64');

            const result = isPlatformSupported();

            expect(result).toBe(true);
        });

        it('should return true for Linux', () => {
            os.platform.mockReturnValue('linux');
            os.arch.mockReturnValue('x64');
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('GNU C Library');

            const result = isPlatformSupported();

            expect(result).toBe(true);
        });

        it('should return true for Windows', () => {
            os.platform.mockReturnValue('win32');
            os.arch.mockReturnValue('x64');

            const result = isPlatformSupported();

            expect(result).toBe(true);
        });

        it('should return false for unsupported platform', () => {
            os.platform.mockReturnValue('freebsd');
            os.arch.mockReturnValue('x64');

            const result = isPlatformSupported();

            expect(result).toBe(false);
        });
    });

    describe('getPlatformDescription', () => {
        it('should return description for macOS ARM64', () => {
            os.platform.mockReturnValue('darwin');
            os.arch.mockReturnValue('arm64');

            const result = getPlatformDescription();

            expect(result).toBe('macOS (arm64) [darwin-arm64]');
        });

        it('should return description for macOS x64', () => {
            os.platform.mockReturnValue('darwin');
            os.arch.mockReturnValue('x64');

            const result = getPlatformDescription();

            expect(result).toBe('macOS (x64) [darwin]');
        });

        it('should return description for Linux', () => {
            os.platform.mockReturnValue('linux');
            os.arch.mockReturnValue('x64');
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('GNU C Library');

            const result = getPlatformDescription();

            expect(result).toBe('Linux (x64) [linux-musl]');
        });

        it('should return description for Windows', () => {
            os.platform.mockReturnValue('win32');
            os.arch.mockReturnValue('x64');

            const result = getPlatformDescription();

            expect(result).toBe('Windows (x64) [windows]');
        });

        it('should indicate unsupported platform', () => {
            os.platform.mockReturnValue('freebsd');
            os.arch.mockReturnValue('x64');

            const result = getPlatformDescription();

            expect(result).toBe('freebsd (x64) [unsupported]');
        });
    });
});
