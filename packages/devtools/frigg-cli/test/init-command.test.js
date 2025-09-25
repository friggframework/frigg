const path = require('path');
const fs = require('fs-extra');
const { initCommand, detectFriggProject } = require('../init-command');
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
jest.mock('@inquirer/prompts', () => ({
    input: jest.fn(),
    confirm: jest.fn(),
    select: jest.fn()
}));
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
        fs.readJSON.mockResolvedValue({});
        fs.readFile.mockResolvedValue('');

        // Mock inquirer prompts
        const { input, confirm, select } = require('@inquirer/prompts');
        input.mockResolvedValue('test-project');
        confirm.mockResolvedValue(false);
        select.mockResolvedValue('subdirectory');
        
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
        it('should validate project name when provided', async () => {
            validateProjectName.mockReturnValue({
                validForNewPackages: false,
                errors: ['Invalid name'],
                warnings: []
            });

            await expect(initCommand('invalid-name', {})).rejects.toThrow('process.exit');
            expect(mockExit).toHaveBeenCalledWith(1);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('npm naming restrictions'));
        });

        it('should prompt for project name when not provided', async () => {
            const { input, select } = require('@inquirer/prompts');
            select.mockResolvedValue('subdirectory');
            input.mockResolvedValue('prompted-project');

            await initCommand(undefined, {});

            expect(select).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Where would you like to create the project?'
            }));
            expect(input).toHaveBeenCalledWith(expect.objectContaining({
                message: 'What is your project name?'
            }));
        });

        it('should handle creating project in current directory', async () => {
            const { select } = require('@inquirer/prompts');
            select.mockResolvedValue('current');

            // Mock process.cwd() to return a known value
            const mockCwd = jest.spyOn(process, 'cwd').mockReturnValue('/current/dir');

            await initCommand(undefined, {});

            expect(BackendFirstHandler).toHaveBeenCalledWith(
                '/current/dir',
                expect.any(Object)
            );

            mockCwd.mockRestore();
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

    describe('Frigg Project Detection', () => {
        it('should detect existing Frigg project from package.json', async () => {
            const testDir = '/test/dir';
            const fs = require('fs-extra');

            fs.pathExists.mockImplementation((filePath) => {
                return filePath.includes('package.json');
            });

            fs.readJSON.mockResolvedValue({
                name: 'test-project',
                dependencies: {
                    '@friggframework/core': '^2.0.0'
                }
            });

            const result = await detectFriggProject(testDir);

            expect(result.isFriggProject).toBe(true);
            expect(result.projectType).toBe('Frigg Application');
            expect(result.projectName).toBe('test-project');
        });

        it('should detect Frigg project from index.js content', async () => {
            const testDir = '/test/dir';
            const fs = require('fs-extra');

            fs.pathExists.mockImplementation((filePath) => {
                if (filePath.includes('package.json')) return false;
                if (filePath.includes('index.js')) return true;
                return false;
            });

            fs.readFile.mockResolvedValue('const appDefinition = { /* frigg config */ };');

            const result = await detectFriggProject(testDir);

            expect(result.isFriggProject).toBe(true);
            expect(result.projectType).toBe('Frigg Application');
        });

        it('should return false for non-Frigg projects', async () => {
            const testDir = '/test/dir';
            const fs = require('fs-extra');

            fs.pathExists.mockResolvedValue(false);

            const result = await detectFriggProject(testDir);

            expect(result.isFriggProject).toBe(false);
            expect(result.projectType).toBe(null);
        });
    });

    describe('Directory Conflict Handling', () => {
        it('should prompt user when directory conflicts exist', async () => {
            const { select, input } = require('@inquirer/prompts');
            const fs = require('fs-extra');

            // Mock sequence of calls to handle the full flow
            select.mockResolvedValueOnce('subdirectory'); // Where to create project
            input.mockResolvedValueOnce('test-project');   // Project name

            // Mock directory exists with conflicting files for the specific test-project path
            fs.pathExists.mockImplementation((filePath) => {
                return filePath.includes('test-project');
            });
            fs.readdir.mockImplementation((filePath) => {
                if (filePath.includes('test-project')) {
                    return ['some-file.js', 'another-file.txt'];
                }
                return [];
            });

            select.mockResolvedValueOnce('overwrite');    // How to handle conflict

            await initCommand(undefined, {});

            expect(select).toHaveBeenCalledWith(expect.objectContaining({
                message: 'How would you like to proceed?'
            }));
        });

        it('should allow user to cancel when directory conflicts', async () => {
            const { select, input } = require('@inquirer/prompts');
            const fs = require('fs-extra');

            select.mockResolvedValueOnce('subdirectory'); // Where to create project
            input.mockResolvedValueOnce('test-project');   // Project name

            // Mock directory exists with conflicting files for the specific test-project path
            fs.pathExists.mockImplementation((filePath) => {
                return filePath.includes('test-project');
            });
            fs.readdir.mockImplementation((filePath) => {
                if (filePath.includes('test-project')) {
                    return ['conflicting-file.js'];
                }
                return [];
            });

            select.mockResolvedValueOnce('cancel');       // How to handle conflict

            await expect(initCommand(undefined, {})).rejects.toThrow('process.exit');
            expect(mockExit).toHaveBeenCalledWith(0);
        });
    });

    describe('Options Handling', () => {
        it('should use options.name when provided', async () => {
            await initCommand(undefined, { name: 'option-provided-name' });

            expect(BackendFirstHandler).toHaveBeenCalledWith(
                expect.stringContaining('option-provided-name'),
                expect.any(Object)
            );
        });

        it('should use options.directory when provided', async () => {
            await initCommand(undefined, { directory: '/custom/path' });

            expect(BackendFirstHandler).toHaveBeenCalledWith(
                '/custom/path',
                expect.any(Object)
            );
        });
    });

});