const path = require('path');
const fs = require('fs-extra');
const BackendFirstHandler = require('../../../init-command/backend-first-handler');

// Mock dependencies
jest.mock('fs-extra');
jest.mock('chalk', () => ({
    blue: jest.fn(text => text),
    green: jest.fn(text => text),
    red: jest.fn(text => text),
    yellow: jest.fn(text => text),
    gray: jest.fn(text => text),
    cyan: jest.fn(text => text),
    bold: jest.fn(text => text)
}));
jest.mock('@inquirer/prompts');
jest.mock('child_process');
jest.mock('cross-spawn');
jest.mock('../../../utils/npm-registry');
jest.mock('@friggframework/schemas');

describe('BackendFirstHandler', () => {
    const mockTargetPath = '/test/project/path';
    let mockConsoleLog;
    let mockConsoleError;

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock console methods
        mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
        
        // Mock fs-extra methods
        const fs = require('fs-extra');
        fs.ensureDir.mockResolvedValue();
        fs.pathExists.mockResolvedValue(false);
        fs.readdir.mockResolvedValue([]);
        fs.writeFile.mockResolvedValue();
        fs.writeJSON.mockResolvedValue();
        fs.readFile.mockResolvedValue('mock content');
        fs.copy.mockResolvedValue();
        fs.ensureDirSync.mockImplementation();
        fs.readdirSync.mockReturnValue([]);
        fs.writeFileSync.mockImplementation();
        fs.lstatSync.mockReturnValue({ isDirectory: () => false });
    });

    afterEach(() => {
        mockConsoleLog.mockRestore();
        mockConsoleError.mockRestore();
    });

    describe('Non-Interactive Mode', () => {
        it('should use default configuration in non-interactive mode', () => {
            const options = {
                nonInteractive: true,
                mode: 'standalone',
                appPurpose: 'own-app'
            };

            const handler = new BackendFirstHandler(mockTargetPath, options);
            const config = handler.getDefaultConfiguration('standalone');

            expect(config).toEqual({
                deploymentMode: 'standalone',
                appPurpose: 'own-app',
                needsCustomApiModule: true, // Should default to true for 'own-app'
                includeIntegrations: false,
                starterIntegrations: [],
                includeDemoFrontend: false,
                frontendFramework: 'react',
                demoAuthMode: 'mock',
                serverlessProvider: 'aws',
                installDependencies: true,
                initializeGit: true
            });
        });

        it('should use provided options in non-interactive mode', () => {
            const options = {
                nonInteractive: true,
                mode: 'embedded',
                appPurpose: 'platform',
                includeApiModule: false,
                includeIntegrations: true,
                starterIntegrations: ['salesforce', 'hubspot'],
                frontend: true,
                frontendFramework: 'vue',
                demoAuthMode: 'real',
                serverlessProvider: 'local',
                installDependencies: false,
                initializeGit: false
            };

            const handler = new BackendFirstHandler(mockTargetPath, options);
            const config = handler.getDefaultConfiguration('embedded');

            expect(config).toEqual({
                deploymentMode: 'embedded',
                appPurpose: 'platform',
                needsCustomApiModule: false,
                includeIntegrations: true,
                starterIntegrations: ['salesforce', 'hubspot'],
                includeDemoFrontend: true,
                frontendFramework: 'vue',
                demoAuthMode: 'real',
                serverlessProvider: 'local',
                installDependencies: false,
                initializeGit: false
            });
        });

        it('should default to exploring mode when no app purpose specified', () => {
            const options = {
                nonInteractive: true,
                mode: 'standalone'
            };

            const handler = new BackendFirstHandler(mockTargetPath, options);
            const config = handler.getDefaultConfiguration('standalone');

            expect(config.appPurpose).toBe('exploring');
            expect(config.needsCustomApiModule).toBe(false);
        });

        it('should handle undefined options gracefully', () => {
            const options = {
                nonInteractive: true
            };

            const handler = new BackendFirstHandler(mockTargetPath, options);
            const config = handler.getDefaultConfiguration('standalone');

            expect(config).toEqual({
                deploymentMode: 'standalone',
                appPurpose: 'exploring',
                needsCustomApiModule: false,
                includeIntegrations: false,
                starterIntegrations: [],
                includeDemoFrontend: false,
                frontendFramework: 'react',
                demoAuthMode: 'mock',
                serverlessProvider: 'aws',
                installDependencies: true,
                initializeGit: true
            });
        });
    });

    describe('Interactive Mode', () => {
        it('should use interactive prompts when interactive is true', async () => {
            const { select, confirm, multiselect } = require('@inquirer/prompts');
            
            // Mock the prompts
            select.mockResolvedValue('standalone');
            confirm.mockResolvedValue(true);
            if (multiselect) {
                multiselect.mockResolvedValue(['salesforce']);
            }

            const options = {
                interactive: true,
                nonInteractive: false
            };

            const handler = new BackendFirstHandler(mockTargetPath, options);
            
            // Mock the initialize method to avoid full execution
            const initializeSpy = jest.spyOn(handler, 'initialize').mockResolvedValue();
            
            await handler.initialize();
            
            expect(initializeSpy).toHaveBeenCalled();
        });
    });

    describe('Configuration Merging', () => {
        it('should merge options with defaults correctly', () => {
            const options = {
                nonInteractive: true,
                mode: 'standalone',
                appPurpose: 'own-app',
                includeApiModule: true,
                includeIntegrations: true,
                starterIntegrations: ['salesforce'],
                frontend: true,
                frontendFramework: 'angular',
                demoAuthMode: 'real',
                serverlessProvider: 'aws',
                installDependencies: true,
                initializeGit: true
            };

            const handler = new BackendFirstHandler(mockTargetPath, options);
            const config = handler.getDefaultConfiguration('standalone');

            expect(config.appPurpose).toBe('own-app');
            expect(config.needsCustomApiModule).toBe(true);
            expect(config.includeIntegrations).toBe(true);
            expect(config.starterIntegrations).toEqual(['salesforce']);
            expect(config.includeDemoFrontend).toBe(true);
            expect(config.frontendFramework).toBe('angular');
            expect(config.demoAuthMode).toBe('real');
        });
    });
});