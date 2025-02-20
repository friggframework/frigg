const { Command } = require('commander');
const { installCommand } = require('./index');
const { validatePackageExists } = require('./install-command/validate-package');
const { findNearestBackendPackageJson, validateBackendPath } = require('@friggframework/core');
const { installPackage } = require('./install-command/install-package');
const { createIntegrationFile } = require('./install-command/integration-file');
const { updateBackendJsFile } = require('./install-command/backend-js');
const { commitChanges } = require('./install-command/commit-changes');
const { logInfo, logError } = require('./install-command/logger');

describe('CLI Command Tests', () => {
    it('should successfully install an API module when all steps complete without errors', async () => {
        const mockApiModuleName = 'testModule';
        const mockPackageName = `@friggframework/api-module-${mockApiModuleName}`;
        const mockBackendPath = '/mock/backend/path';

        jest.mock('./install-command/validate-package', () => ({
            validatePackageExists: jest.fn().mockResolvedValue(true),
        }));
        jest.mock('./utils/backend-path', () => ({
            findNearestBackendPackageJson: jest
                .fn()
                .mockReturnValue(mockBackendPath),
            validateBackendPath: jest.fn().mockReturnValue(true),
        }));
        jest.mock('./install-command/install-package', () => ({
            installPackage: jest.fn().mockReturnValue(true),
        }));
        jest.mock('./install-command/integration-file', () => ({
            createIntegrationFile: jest.fn().mockReturnValue(true),
        }));
        jest.mock('./install-command/backend-js', () => ({
            updateBackendJsFile: jest.fn().mockReturnValue(true),
        }));
        jest.mock('./install-command/commit-changes', () => ({
            commitChanges: jest.fn().mockReturnValue(true),
        }));
        jest.mock('./install-command/logger', () => ({
            logInfo: jest.fn(),
            logError: jest.fn(),
        }));

        const program = new Command();
        program
            .command('install <apiModuleName>')
            .description('Install an API module')
            .action(installCommand);

        await program.parseAsync(['node', 'install', mockApiModuleName]);

        expect(validatePackageExists).toHaveBeenCalledWith(mockPackageName);
        expect(findNearestBackendPackageJson).toHaveBeenCalled();
        expect(validateBackendPath).toHaveBeenCalledWith(mockBackendPath);
        expect(installPackage).toHaveBeenCalledWith(
            mockBackendPath,
            mockPackageName
        );
        expect(createIntegrationFile).toHaveBeenCalledWith(
            mockBackendPath,
            mockApiModuleName
        );
        expect(updateBackendJsFile).toHaveBeenCalledWith(
            mockBackendPath,
            mockApiModuleName
        );
        expect(commitChanges).toHaveBeenCalledWith(
            mockBackendPath,
            mockApiModuleName
        );
        expect(logInfo).toHaveBeenCalledWith(
            `Successfully installed ${mockPackageName} and updated the project.`
        );
    });

    it('should log an error and exit with code 1 if the package does not exist', async () => {
        const mockExit = jest
            .spyOn(process, 'exit')
            .mockImplementation(() => {});
        const mockLogError = jest
            .spyOn(require('./install-command/logger'), 'logError')
            .mockImplementation(() => {});
        const mockValidatePackageExists = jest
            .spyOn(
                require('./install-command/validate-package'),
                'validatePackageExists'
            )
            .mockImplementation(() => {
                throw new Error('Package not found');
            });

        const program = new Command();
        program
            .command('install <apiModuleName>')
            .description('Install an API module')
            .action(installCommand);

        await program.parseAsync(['node', 'install', 'nonexistent-package']);

        expect(mockValidatePackageExists).toHaveBeenCalledWith(
            '@friggframework/api-module-nonexistent-package'
        );
        expect(mockLogError).toHaveBeenCalledWith(
            'An error occurred:',
            expect.any(Error)
        );
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockRestore();
        mockLogError.mockRestore();
        mockValidatePackageExists.mockRestore();
    });

    it('should log an error and exit with code 1 if the backend path is invalid', async () => {
        const mockLogError = jest
            .spyOn(require('./install-command/logger'), 'logError')
            .mockImplementation(() => {});
        const mockProcessExit = jest
            .spyOn(process, 'exit')
            .mockImplementation(() => {});
        const mockValidatePackageExists = jest
            .spyOn(
                require('./install-command/validate-package'),
                'validatePackageExists'
            )
            .mockResolvedValue(true);
        const mockFindNearestBackendPackageJson = jest
            .spyOn(
                require('./utils/backend-path'),
                'findNearestBackendPackageJson'
            )
            .mockReturnValue('/invalid/path');
        const mockValidateBackendPath = jest
            .spyOn(require('./utils/backend-path'), 'validateBackendPath')
            .mockImplementation(() => {
                throw new Error('Invalid backend path');
            });

        const program = new Command();
        program
            .command('install <apiModuleName>')
            .description('Install an API module')
            .action(installCommand);

        await program.parseAsync(['node', 'install', 'test-module']);

        expect(mockLogError).toHaveBeenCalledWith(
            'An error occurred:',
            expect.any(Error)
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);

        mockLogError.mockRestore();
        mockProcessExit.mockRestore();
        mockValidatePackageExists.mockRestore();
        mockFindNearestBackendPackageJson.mockRestore();
        mockValidateBackendPath.mockRestore();
    });
});
