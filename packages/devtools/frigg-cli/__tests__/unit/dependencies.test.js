/**
 * Dependencies Test
 *
 * Ensures that required runtime dependencies are properly declared
 * in package.json to avoid deployment issues.
 *
 * Issue #481 - Missing osls Dependency
 */

const path = require('path');
const packageJson = require('../../package.json');

describe('frigg-cli dependencies', () => {
    describe('osls dependency', () => {
        it('should have osls declared as a dependency', () => {
            expect(packageJson.dependencies).toBeDefined();
            expect(packageJson.dependencies.osls).toBeDefined();
        });

        it('should specify a valid osls version', () => {
            const oslsVersion = packageJson.dependencies.osls;

            // Should be a semver range or specific version
            expect(oslsVersion).toMatch(/^[\^~]?\d+\.\d+\.\d+/);
        });

        it('should use osls version 3.40.1 or higher', () => {
            const oslsVersion = packageJson.dependencies.osls;

            // Extract version number (remove ^ or ~ prefix)
            const versionNumber = oslsVersion.replace(/^[\^~]/, '');
            const [major, minor] = versionNumber.split('.').map(Number);

            expect(major).toBeGreaterThanOrEqual(3);
            if (major === 3) {
                expect(minor).toBeGreaterThanOrEqual(40);
            }
        });
    });

    describe('critical runtime dependencies', () => {
        it('should have cross-spawn for spawning osls subprocess', () => {
            expect(packageJson.dependencies['cross-spawn']).toBeDefined();
        });

        it('should have chalk for CLI output formatting', () => {
            expect(packageJson.dependencies.chalk).toBeDefined();
        });

        it('should have commander for CLI command parsing', () => {
            expect(packageJson.dependencies.commander).toBeDefined();
        });

        it('should have @friggframework/devtools as a peer dependency', () => {
            expect(packageJson.peerDependencies['@friggframework/devtools']).toBeDefined();
        });
    });

    describe('package.json structure', () => {
        it('should have a bin entry for frigg command', () => {
            expect(packageJson.bin).toBeDefined();
            expect(packageJson.bin.frigg).toBe('./index.js');
        });

        it('should specify Node.js version requirement', () => {
            expect(packageJson.engines).toBeDefined();
            expect(packageJson.engines.node).toBeDefined();
        });

        it('should be published as @friggframework/frigg-cli', () => {
            expect(packageJson.name).toBe('@friggframework/frigg-cli');
        });
    });
});
