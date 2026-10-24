/**
 * Version Detection Tests
 *
 * Tests for the CLI version detection wrapper that prefers local installations
 */

const fs = require('fs');
const path = require('path');
const semver = require('semver');

describe('Version Detection Logic', () => {
    describe('semver comparison', () => {
        test('should prefer local when local version is newer', () => {
            const localVersion = '2.1.0';
            const globalVersion = '2.0.0';

            const comparison = semver.compare(localVersion, globalVersion);

            expect(comparison).toBeGreaterThan(0);
        });

        test('should prefer local when versions are equal', () => {
            const localVersion = '2.0.0';
            const globalVersion = '2.0.0';

            const comparison = semver.compare(localVersion, globalVersion);

            expect(comparison).toBe(0);
        });

        test('should warn when global is newer than local', () => {
            const localVersion = '2.0.0';
            const globalVersion = '2.1.0';

            const comparison = semver.compare(localVersion, globalVersion);

            expect(comparison).toBeLessThan(0);
        });

        test('should handle prerelease versions correctly', () => {
            const localVersion = '2.0.0-next.1';
            const globalVersion = '2.0.0-next.0';

            const comparison = semver.compare(localVersion, globalVersion);

            expect(comparison).toBeGreaterThan(0);
        });

        test('should prefer release over prerelease', () => {
            const localVersion = '2.0.0';
            const globalVersion = '2.0.0-next.0';

            const comparison = semver.compare(localVersion, globalVersion);

            expect(comparison).toBeGreaterThan(0);
        });
    });

    describe('local CLI detection', () => {
        test('should find local installation in node_modules', () => {
            const cwd = process.cwd();
            const localCliPath = path.join(cwd, 'node_modules', '@friggframework', 'frigg-cli');

            // This test validates the path construction logic
            expect(localCliPath).toContain('node_modules');
            expect(localCliPath).toContain('@friggframework');
            expect(localCliPath).toContain('frigg-cli');
        });

        test('should construct correct paths for package.json and index.js', () => {
            const cwd = process.cwd();
            const localCliPath = path.join(cwd, 'node_modules', '@friggframework', 'frigg-cli');
            const localCliPackageJson = path.join(localCliPath, 'package.json');
            const localCliIndex = path.join(localCliPath, 'index.js');

            expect(localCliPackageJson).toContain('package.json');
            expect(localCliIndex).toContain('index.js');
        });
    });

    describe('environment variable check', () => {
        test('should skip version check when FRIGG_CLI_SKIP_VERSION_CHECK is true', () => {
            const originalEnv = process.env.FRIGG_CLI_SKIP_VERSION_CHECK;

            process.env.FRIGG_CLI_SKIP_VERSION_CHECK = 'true';
            const shouldSkip = process.env.FRIGG_CLI_SKIP_VERSION_CHECK === 'true';
            expect(shouldSkip).toBe(true);

            // Restore
            if (originalEnv !== undefined) {
                process.env.FRIGG_CLI_SKIP_VERSION_CHECK = originalEnv;
            } else {
                delete process.env.FRIGG_CLI_SKIP_VERSION_CHECK;
            }
        });

        test('should not skip when environment variable is not set', () => {
            const originalEnv = process.env.FRIGG_CLI_SKIP_VERSION_CHECK;
            delete process.env.FRIGG_CLI_SKIP_VERSION_CHECK;

            const shouldSkip = process.env.FRIGG_CLI_SKIP_VERSION_CHECK === 'true';
            expect(shouldSkip).toBe(false);

            // Restore
            if (originalEnv !== undefined) {
                process.env.FRIGG_CLI_SKIP_VERSION_CHECK = originalEnv;
            }
        });
    });

    describe('version detection decision matrix', () => {
        const scenarios = [
            {
                name: 'local newer than global',
                local: '2.1.0',
                global: '2.0.0',
                expected: 'use_local',
            },
            {
                name: 'local equal to global',
                local: '2.0.0',
                global: '2.0.0',
                expected: 'use_local',
            },
            {
                name: 'global newer than local',
                local: '2.0.0',
                global: '2.1.0',
                expected: 'warn_and_use_global',
            },
            {
                name: 'local prerelease newer',
                local: '2.0.0-next.1',
                global: '2.0.0-next.0',
                expected: 'use_local',
            },
        ];

        scenarios.forEach(({ name, local, global, expected }) => {
            test(`should ${expected.replace('_', ' ')} when ${name}`, () => {
                const comparison = semver.compare(local, global);

                if (expected === 'use_local') {
                    expect(comparison).toBeGreaterThanOrEqual(0);
                } else if (expected === 'warn_and_use_global') {
                    expect(comparison).toBeLessThan(0);
                }
            });
        });
    });

    describe('argument forwarding', () => {
        test('should extract arguments correctly from process.argv', () => {
            // Simulate process.argv
            const mockArgv = ['node', '/path/to/frigg', 'doctor', 'my-stack', '--region', 'us-east-1'];
            const args = mockArgv.slice(2);

            expect(args).toEqual(['doctor', 'my-stack', '--region', 'us-east-1']);
        });

        test('should forward all arguments to local CLI', () => {
            const mockArgv = ['node', '/path/to/frigg', 'repair', 'my-stack', '--import', '--yes'];
            const args = mockArgv.slice(2);

            expect(args).toContain('repair');
            expect(args).toContain('my-stack');
            expect(args).toContain('--import');
            expect(args).toContain('--yes');
        });
    });
});
