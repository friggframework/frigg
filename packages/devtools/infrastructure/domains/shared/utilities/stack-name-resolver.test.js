/**
 * Tests for Stack Name Resolver Utility
 *
 * Domain Utility - Hexagonal Architecture
 *
 * Resolves CloudFormation stack names consistently across deploy and discovery flows
 */

const path = require('path');
const fs = require('fs');
const { resolveStackName } = require('./stack-name-resolver');

// Mock fs
jest.mock('fs');

describe('Stack Name Resolver', () => {
    let originalCwd;

    beforeEach(() => {
        originalCwd = process.cwd;
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.cwd = originalCwd;
    });

    describe('resolveStackName()', () => {
        it('should use appDefinition.name when available', () => {
            const appDefinition = { name: 'my-app' };
            const options = { stage: 'prod' };

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('my-app-prod');
        });

        it('should default to "dev" stage when not specified', () => {
            const appDefinition = { name: 'my-app' };
            const options = {};

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('my-app-dev');
        });

        // Note: Testing infrastructure.js service name resolution is complex with jest.mock
        // This is covered by integration tests and real-world usage
        // The implementation follows the same pattern as package.json resolution

        it('should try package.json name when appDefinition.name and infrastructure.js service missing', () => {
            const mockCwd = '/project/backend';
            process.cwd = jest.fn().mockReturnValue(mockCwd);

            const appDefinition = {};
            const options = { stage: 'test' };

            // Mock infrastructure.js doesn't exist or has no service
            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === path.join(mockCwd, 'package.json')
            );

            fs.readFileSync = jest.fn().mockReturnValue(
                JSON.stringify({ name: 'backend-package' })
            );

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('backend-package-test');
        });

        it('should use "create-frigg-app" as final fallback', () => {
            const mockCwd = '/project/backend';
            process.cwd = jest.fn().mockReturnValue(mockCwd);

            const appDefinition = {};
            const options = { stage: 'prod' };

            // Mock nothing exists
            fs.existsSync = jest.fn().mockReturnValue(false);

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('create-frigg-app-prod');
        });

        it('should handle appDefinition.name being null', () => {
            const appDefinition = { name: null };
            const options = { stage: 'dev' };

            const mockCwd = '/project/backend';
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            fs.existsSync = jest.fn().mockReturnValue(false);

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('create-frigg-app-dev');
        });

        it('should handle appDefinition.name being empty string', () => {
            const appDefinition = { name: '' };
            const options = { stage: 'dev' };

            const mockCwd = '/project/backend';
            process.cwd = jest.fn().mockReturnValue(mockCwd);
            fs.existsSync = jest.fn().mockReturnValue(false);

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('create-frigg-app-dev');
        });

        it('should handle missing appDefinition gracefully', () => {
            const result = resolveStackName(null, { stage: 'prod' });

            expect(result).toBe('create-frigg-app-prod');
        });

        it('should handle missing options gracefully', () => {
            const appDefinition = { name: 'my-app' };

            const result = resolveStackName(appDefinition, null);

            expect(result).toBe('my-app-dev');
        });

        it('should handle package.json without name field', () => {
            const mockCwd = '/project/backend';
            process.cwd = jest.fn().mockReturnValue(mockCwd);

            const appDefinition = {};
            const options = { stage: 'prod' };

            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === path.join(mockCwd, 'package.json')
            );

            fs.readFileSync = jest.fn().mockReturnValue(
                JSON.stringify({ version: '1.0.0' }) // no name field
            );

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('create-frigg-app-prod');
        });

        it('should handle corrupted package.json gracefully', () => {
            const mockCwd = '/project/backend';
            process.cwd = jest.fn().mockReturnValue(mockCwd);

            const appDefinition = {};
            const options = { stage: 'prod' };

            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === path.join(mockCwd, 'package.json')
            );

            fs.readFileSync = jest.fn().mockReturnValue('{ invalid json }');

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('create-frigg-app-prod');
        });

        it('should sanitize stack names with invalid characters', () => {
            const appDefinition = { name: 'my@app#name' };
            const options = { stage: 'prod' };

            const result = resolveStackName(appDefinition, options);

            // Stack names should only contain alphanumeric and hyphens
            expect(result).toBe('my-app-name-prod');
        });

        it('should use custom working directory when provided', () => {
            const customCwd = '/custom/path/backend';
            const appDefinition = {};
            const options = { stage: 'prod', workingDirectory: customCwd };

            fs.existsSync = jest.fn().mockImplementation((p) =>
                p === path.join(customCwd, 'package.json')
            );

            fs.readFileSync = jest.fn().mockReturnValue(
                JSON.stringify({ name: 'custom-backend' })
            );

            const result = resolveStackName(appDefinition, options);

            expect(result).toBe('custom-backend-prod');
            expect(fs.existsSync).toHaveBeenCalledWith(
                path.join(customCwd, 'package.json')
            );
        });
    });
});
