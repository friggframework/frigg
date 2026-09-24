const path = require('path');
const fs = require('fs-extra');
const { initCommand } = require('../init-command');
const BackendFirstHandler = require('../init-command/backend-first-handler');

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
jest.mock('../init-command/backend-first-handler');
jest.mock('validate-npm-package-name');

describe('Init Command', () => {
    const mockProjectPath = '/test/project/path';
    const mockProjectName = 'test-project';
    let mockExit;
    let mockConsoleLog;
    const validateProjectName = require('validate-npm-package-name');
    
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Mock process.exit
        mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit');
        });
        
        // Mock console.log and console.error
        mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        
        // Reset fs mocks
        const fs = require('fs-extra');
        fs.ensureDirSync.mockImplementation(() => {});
        fs.pathExists.mockResolvedValue(false);
        fs.readdir.mockResolvedValue([]);
        fs.readdirSync.mockReturnValue([]);
        fs.writeFileSync.mockImplementation(() => {});
        fs.lstatSync.mockReturnValue({ isDirectory: () => false });
        
        // Mock BackendFirstHandler
        BackendFirstHandler.mockImplementation(() => ({
            initialize: jest.fn().mockResolvedValue()
        }));
        
        // Mock validate-npm-package-name
        validateProjectName.mockReturnValue({
            validForNewPackages: true,
            errors: [],
            warnings: []
        });
    });
    
    afterEach(() => {
        mockExit.mockRestore();
        mockConsoleLog.mockRestore();
    });

    describe('Validation', () => {
        it('should validate project name', async () => {
            validateProjectName.mockReturnValue({
                validForNewPackages: false,
                errors: ['Invalid name'],
                warnings: []
            });
            
            await expect(initCommand('invalid-name', {})).rejects.toThrow('process.exit');
            expect(mockExit).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('npm naming restrictions'));
        });

        it('should accept valid project names', async () => {
            validateProjectName.mockReturnValue({
                validForNewPackages: true,
                errors: [],
                warnings: []
            });
            
            await initCommand('valid-name', {});
            expect(BackendFirstHandler).toHaveBeenCalled();
        });

        it('should check Node.js version compatibility', async () => {
            const originalVersion = process.version;
            Object.defineProperty(process, 'version', {
                value: 'v12.0.0',
                configurable: true
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            await initCommand(mockProjectName, {});
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Node 14 or higher'));
            
            Object.defineProperty(process, 'version', {
                value: originalVersion,
                configurable: true
            });
            consoleSpy.mockRestore();
        });
    });

    describe('Project Creation Modes', () => {
        it('should use BackendFirstHandler by default', async () => {
            await initCommand(mockProjectName, {});
            
            expect(BackendFirstHandler).toHaveBeenCalledWith(
                expect.stringContaining(mockProjectName),
                expect.objectContaining({
                    force: false,
                    verbose: false
                })
            );
        });

        it('should pass options to BackendFirstHandler', async () => {
            const options = {
                force: true,
                verbose: true,
                mode: 'standalone',
                frontend: false
            };
            
            await initCommand(mockProjectName, options);
            
            expect(BackendFirstHandler).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining(options)
            );
        });

        it('should handle initialization errors gracefully', async () => {
            const mockError = new Error('Initialization failed');
            BackendFirstHandler.mockImplementation(() => ({
                initialize: jest.fn().mockRejectedValue(mockError)
            }));
            
            await expect(initCommand(mockProjectName, {})).rejects.toThrow('process.exit');
            
            expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Aborting'));
            expect(mockExit).toHaveBeenCalledWith(1);
        });
    });

    describe('Directory Safety', () => {
        it('should check if directory is safe to use', async () => {
            BackendFirstHandler.mockImplementation(() => ({
                initialize: jest.fn().mockRejectedValue(new Error('Directory not empty'))
            }));
            
            await expect(initCommand(mockProjectName, {})).rejects.toThrow('process.exit');
            
            expect(mockExit).toHaveBeenCalledWith(1);
        });

        it('should allow safe files in directory', async () => {
            await initCommand(mockProjectName, {});
            expect(BackendFirstHandler).toHaveBeenCalled();
        });

        it('should force overwrite when --force flag is used', async () => {
            await initCommand(mockProjectName, { force: true });
            expect(BackendFirstHandler).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ force: true })
            );
        });
    });

});