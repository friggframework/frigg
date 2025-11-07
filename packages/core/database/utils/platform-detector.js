const os = require('os');
const fs = require('fs');

/**
 * Platform Detector Service
 * Detects the current platform and determines the required Prisma binary target
 *
 * Domain Service following hexagonal architecture patterns
 */

/**
 * Maps Node.js platform and architecture to Prisma binary targets
 * Based on Prisma's supported platforms: https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#binarytargets-options
 */
const PLATFORM_BINARY_TARGET_MAP = {
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin',
    'linux-x64-glibc': 'linux-musl', // Default for most Linux
    'linux-arm64-glibc': 'linux-arm64-openssl-1.1.x',
    'linux-x64-musl': 'linux-musl',
    'win32-x64': 'windows',
    'win32-ia32': 'windows'
};

/**
 * Detects the current platform and architecture
 * @returns {Object} { platform: string, arch: string }
 */
function detectPlatform() {
    const platform = os.platform();
    const arch = os.arch();

    return {
        platform,
        arch,
        // Composite key for mapping
        platformKey: `${platform}-${arch}`
    };
}

/**
 * Detects the Linux libc variant (glibc vs musl)
 * This is important for Linux as Prisma has different binaries for each
 * @returns {'glibc'|'musl'|null}
 */
function detectLinuxLibc() {
    if (os.platform() !== 'linux') {
        return null;
    }

    try {
        // Check for musl by looking at ldd
        const lddPath = '/usr/bin/ldd';
        if (fs.existsSync(lddPath)) {
            const lddContent = fs.readFileSync(lddPath, 'utf8');
            if (lddContent.includes('musl')) {
                return 'musl';
            }
        }

        // Check for musl-specific paths
        if (fs.existsSync('/lib/ld-musl-x86_64.so.1') ||
            fs.existsSync('/lib/ld-musl-aarch64.so.1')) {
            return 'musl';
        }

        // Default to glibc on Linux
        return 'glibc';
    } catch (error) {
        // If we can't determine, assume glibc (most common)
        return 'glibc';
    }
}

/**
 * Gets the refined platform key including libc for Linux
 * @returns {string} Platform key (e.g., 'darwin-arm64', 'linux-x64-glibc')
 */
function getRefinedPlatformKey() {
    const { platform, arch } = detectPlatform();

    if (platform === 'linux') {
        const libc = detectLinuxLibc();
        return `${platform}-${arch}-${libc}`;
    }

    return `${platform}-${arch}`;
}

/**
 * Gets the Prisma binary target for the current platform
 * @returns {string|null} Prisma binary target (e.g., 'darwin-arm64', 'linux-musl') or null if unknown
 */
function getPrismaBinaryTarget() {
    const platformKey = getRefinedPlatformKey();

    // Try exact match first
    if (PLATFORM_BINARY_TARGET_MAP[platformKey]) {
        return PLATFORM_BINARY_TARGET_MAP[platformKey];
    }

    // Fallback logic for unmapped platforms
    const { platform, arch } = detectPlatform();

    if (platform === 'darwin') {
        // macOS: use darwin for x64, darwin-arm64 for arm64
        return arch === 'arm64' ? 'darwin-arm64' : 'darwin';
    }

    if (platform === 'linux') {
        // Linux: default to linux-musl for x64, linux-arm64 for arm64
        return arch === 'arm64' ? 'linux-arm64-openssl-1.1.x' : 'linux-musl';
    }

    if (platform === 'win32') {
        return 'windows';
    }

    // Unknown platform
    return null;
}

/**
 * Checks if the current platform is supported by Prisma
 * @returns {boolean}
 */
function isPlatformSupported() {
    return getPrismaBinaryTarget() !== null;
}

/**
 * Gets a human-readable platform description
 * @returns {string}
 */
function getPlatformDescription() {
    const { platform, arch } = detectPlatform();
    const binaryTarget = getPrismaBinaryTarget();

    const platformNames = {
        'darwin': 'macOS',
        'linux': 'Linux',
        'win32': 'Windows'
    };

    const platformName = platformNames[platform] || platform;

    return `${platformName} (${arch}) [${binaryTarget || 'unsupported'}]`;
}

module.exports = {
    detectPlatform,
    detectLinuxLibc,
    getRefinedPlatformKey,
    getPrismaBinaryTarget,
    isPlatformSupported,
    getPlatformDescription
};
