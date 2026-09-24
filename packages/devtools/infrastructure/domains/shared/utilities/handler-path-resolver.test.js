/**
 * Tests for Handler Path Resolver Utility
 * 
 * Tests offline mode handler path resolution
 */

const path = require('path');
const fs = require('fs');
const { findNodeModulesPath, modifyHandlerPaths } = require('./handler-path-resolver');

// Mock fs and child_process
jest.mock('fs');
jest.mock('node:child_process', () => ({
    execSync: jest.fn(),
}));

describe('Handler Path Resolver', () => {
    let originalArgv;
    let originalCwd;

    beforeEach(() => {
        originalArgv = process.argv;
        originalCwd = process.cwd;
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.argv = originalArgv;
        process.cwd = originalCwd;
    });

    describe('findNodeModulesPath()', () => {
        it('should find node_modules in current directory (method 1)', () => {
            const mockCwd = '/project';
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === path.join(mockCwd, 'node_modules')
            );

            const result = findNodeModulesPath();

            expect(result).toBe(path.join(mockCwd, 'node_modules'));
        });

        it('should search parent directories if not found in current (method 1)', () => {
            const mockCwd = '/project/nested/deep';
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === '/project/node_modules'
            );

            const result = findNodeModulesPath();

            expect(result).toBe('/project/node_modules');
            expect(fs.existsSync).toHaveBeenCalledWith('/project/nested/deep/node_modules');
            expect(fs.existsSync).toHaveBeenCalledWith('/project/nested/node_modules');
            expect(fs.existsSync).toHaveBeenCalledWith('/project/node_modules');
        });

        it('should use npm root if directory search fails (method 2)', () => {
            process.cwd = jest.fn().mockReturnValue('/some/unusual/directory');
            
            const { execSync } = require('node:child_process');
            // npm root returns a different path
            execSync.mockReturnValue('/usr/local/lib/node_modules\n');

            // Mock to fail directory searches but succeed for npm root result
            fs.existsSync = jest.fn().mockImplementation((p) => {
                // Only succeed for the npm root path (not under /some/unusual/directory)
                return p === '/usr/local/lib/node_modules';
            });

            const result = findNodeModulesPath();

            expect(result).toBe('/usr/local/lib/node_modules');
            expect(execSync).toHaveBeenCalledWith('npm root', { encoding: 'utf8' });
        });

        it('should handle npm root errors gracefully', () => {
            process.cwd = jest.fn().mockReturnValue('/project');
            fs.existsSync = jest.fn().mockReturnValue(false);

            const { execSync } = require('node:child_process');
            execSync.mockImplementation(() => {
                throw new Error('npm not found');
            });

            const result = findNodeModulesPath();

            // Should fall back to default
            expect(result).toBe(path.resolve('/project', '../node_modules'));
        });

        it('should search from package.json locations (method 3)', () => {
            process.cwd = jest.fn().mockReturnValue('/project/workspace');

            let callCount = 0;
            fs.existsSync = jest.fn().mockImplementation((p) => {
                callCount++;
                // First 5 calls fail (directory search)
                if (callCount <= 5) return false;
                // Package.json search
                if (p === '/project/package.json') return true;
                if (p === '/project/node_modules') return true;
                return false;
            });

            const { execSync } = require('node:child_process');
            execSync.mockImplementation(() => {
                throw new Error('npm root failed');
            });

            const result = findNodeModulesPath();

            expect(result).toBe('/project/node_modules');
        });

        it('should fall back to default path if all methods fail', () => {
            process.cwd = jest.fn().mockReturnValue('/project');
            fs.existsSync = jest.fn().mockReturnValue(false);

            const { execSync } = require('node:child_process');
            execSync.mockImplementation(() => {
                throw new Error('npm root failed');
            });

            const result = findNodeModulesPath();

            expect(result).toBe(path.resolve('/project', '../node_modules'));
        });

        it('should handle errors during search', () => {
            process.cwd = jest.fn().mockReturnValue('/project');
            // Mock fs.existsSync to throw an error
            fs.existsSync = jest.fn().mockImplementation(() => {
                throw new Error('fs error');
            });

            const { execSync } = require('node:child_process');
            execSync.mockImplementation(() => {
                throw new Error('npm error');
            });

            const result = findNodeModulesPath();

            // Should fallback to default path even when search methods fail
            expect(result).toBe(path.resolve('/project', '../node_modules'));
        });
    });

    describe('modifyHandlerPaths()', () => {
        it('should not modify paths when not in offline mode', () => {
            process.argv = ['node', 'test'];

            const functions = {
                auth: {
                    handler: 'node_modules/@friggframework/core/handlers/routers/auth.handler',
                },
            };

            const result = modifyHandlerPaths(functions);

            expect(result.auth.handler).toBe('node_modules/@friggframework/core/handlers/routers/auth.handler');
        });

        it('should modify handler paths in offline mode', () => {
            process.argv = ['node', 'test', 'offline'];
            process.cwd = jest.fn().mockReturnValue('/project');
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === '/project/node_modules'
            );

            const functions = {
                auth: {
                    handler: 'node_modules/@friggframework/core/handlers/routers/auth.handler',
                },
            };

            const result = modifyHandlerPaths(functions);

            expect(result.auth.handler).toBe('node_modules/@friggframework/core/handlers/routers/auth.handler');
        });

        it('should handle functions without handlers', () => {
            process.argv = ['node', 'test', 'offline'];

            const functions = {
                noHandler: {
                    events: [{ http: { path: '/test' } }],
                },
            };

            const result = modifyHandlerPaths(functions);

            expect(result.noHandler.handler).toBeUndefined();
        });

        it('should only modify handlers with node_modules path', () => {
            process.argv = ['node', 'test', 'offline'];
            process.cwd = jest.fn().mockReturnValue('/project');
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === '/project/node_modules'
            );

            const functions = {
                coreHandler: {
                    handler: 'node_modules/@friggframework/core/handlers/auth.handler',
                },
                customHandler: {
                    handler: 'src/handlers/custom.handler',
                },
            };

            const result = modifyHandlerPaths(functions);

            expect(result.coreHandler.handler).toContain('node_modules');
            expect(result.customHandler.handler).toBe('src/handlers/custom.handler');
        });

        it('should not mutate original functions object', () => {
            process.argv = ['node', 'test', 'offline'];
            process.cwd = jest.fn().mockReturnValue('/project');
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === '/project/node_modules'
            );

            const original = {
                auth: {
                    handler: 'node_modules/@friggframework/core/handlers/auth.handler',
                },
            };

            const result = modifyHandlerPaths(original);

            // Result should be a copy
            expect(result).not.toBe(original);
            expect(result.auth).not.toBe(original.auth);
        });

        it('should handle multiple functions', () => {
            process.argv = ['node', 'test', 'offline'];
            process.cwd = jest.fn().mockReturnValue('/project');
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === '/project/node_modules'
            );

            const functions = {
                auth: {
                    handler: 'node_modules/@friggframework/core/handlers/auth.handler',
                },
                user: {
                    handler: 'node_modules/@friggframework/core/handlers/user.handler',
                },
                health: {
                    handler: 'node_modules/@friggframework/core/handlers/health.handler',
                },
            };

            const result = modifyHandlerPaths(functions);

            expect(Object.keys(result)).toHaveLength(3);
            expect(result.auth.handler).toContain('node_modules');
            expect(result.user.handler).toContain('node_modules');
            expect(result.health.handler).toContain('node_modules');
        });
    });
});

