const {IntegrationJsUpdater} = require('../../../infrastructure/adapters/IntegrationJsUpdater');

describe('IntegrationJsUpdater', () => {
    let updater;
    let mockFileSystemAdapter;
    let backendPath;

    beforeEach(() => {
        backendPath = '/test/project/backend';
        mockFileSystemAdapter = {
            exists: jest.fn(),
            updateFile: jest.fn(),
        };
        updater = new IntegrationJsUpdater(mockFileSystemAdapter, backendPath);
    });

    describe('addModuleToIntegration', () => {
        it('should add a local module with correct import and definition', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
            // Add your API modules here
        },
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModuleToIntegration('test-integration', 'salesforce', 'local');

            expect(mockFileSystemAdapter.updateFile).toHaveBeenCalledWith(
                '/test/project/backend/src/integrations/TestIntegrationIntegration.js',
                expect.any(Function)
            );

            // Verify the callback produces correct output
            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            expect(result).toContain("const salesforce = require('../api-modules/salesforce');");
            expect(result).toContain('salesforce: {');
            expect(result).toContain('definition: salesforce.Definition,');
        });

        it('should add an npm module with correct import path', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
        },
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModuleToIntegration('test-integration', 'stripe', 'npm');

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            expect(result).toContain("const stripe = require('@friggframework/api-module-stripe');");
            expect(result).toContain('stripe: {');
            expect(result).toContain('definition: stripe.Definition,');
        });

        it('should handle kebab-case module names and convert to camelCase', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
        },
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModuleToIntegration('test-integration', 'my-api-module', 'local');

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            expect(result).toContain("const myApiModule = require('../api-modules/my-api-module');");
            expect(result).toContain('myApiModule: {');
            expect(result).toContain('definition: myApiModule.Definition,');
        });

        it('should not add duplicate import if already exists', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');
const salesforce = require('../api-modules/salesforce');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
            salesforce: {
                definition: salesforce.Definition,
            },
        },
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModuleToIntegration('test-integration', 'salesforce', 'local');

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            // Should not add duplicate
            const importCount = (result.match(/const salesforce = require/g) || []).length;
            expect(importCount).toBe(1);

            const definitionCount = (result.match(/salesforce: {/g) || []).length;
            expect(definitionCount).toBe(1);
        });

        it('should throw error if Integration.js does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            await expect(
                updater.addModuleToIntegration('test-integration', 'salesforce', 'local')
            ).rejects.toThrow('Integration.js not found');
        });

        it('should insert import after existing requires', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');
const existingModule = require('../api-modules/existing');

class TestIntegration extends IntegrationBase {
    static Definition = {
        modules: {
            existingModule: {
                definition: existingModule.Definition,
            },
        },
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModuleToIntegration('test-integration', 'salesforce', 'local');

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            const lines = result.split('\n');
            const salesforceImportLine = lines.findIndex(l => l.includes('const salesforce'));
            const classDefLine = lines.findIndex(l => l.includes('class TestIntegration'));

            expect(salesforceImportLine).toBeGreaterThan(-1);
            expect(salesforceImportLine).toBeLessThan(classDefLine);
        });
    });

    describe('addModulesToIntegration', () => {
        it('should add multiple modules in single operation', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
        },
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModulesToIntegration('test-integration', [
                {name: 'salesforce', source: 'local'},
                {name: 'stripe', source: 'npm'},
            ]);

            expect(mockFileSystemAdapter.updateFile).toHaveBeenCalledTimes(1);

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            // Verify both modules added
            expect(result).toContain("const salesforce = require('../api-modules/salesforce');");
            expect(result).toContain("const stripe = require('@friggframework/api-module-stripe');");
            expect(result).toContain('salesforce: {');
            expect(result).toContain('stripe: {');
        });

        it('should handle empty modules array', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {},
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModulesToIntegration('test-integration', []);

            expect(mockFileSystemAdapter.updateFile).toHaveBeenCalled();

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            // Content should be unchanged
            expect(result).toBe(initialContent);
        });

        it('should default source to local if not specified', async () => {
            const initialContent = `const { IntegrationBase } = require('@friggframework/core');

class TestIntegration extends IntegrationBase {
    static Definition = {
        modules: {},
    };
}

module.exports = TestIntegration;
`;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.updateFile.mockImplementation(async (path, callback) => {
                const result = callback(initialContent);
                return result;
            });

            await updater.addModulesToIntegration('test-integration', [
                {name: 'salesforce'}, // No source specified
            ]);

            const callback = mockFileSystemAdapter.updateFile.mock.calls[0][1];
            const result = callback(initialContent);

            expect(result).toContain("const salesforce = require('../api-modules/salesforce');");
        });
    });

    describe('exists', () => {
        it('should check if Integration.js exists', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);

            const result = await updater.exists('test-integration');

            expect(result).toBe(true);
            expect(mockFileSystemAdapter.exists).toHaveBeenCalledWith(
                '/test/project/backend/src/integrations/TestIntegrationIntegration.js'
            );
        });

        it('should return false if Integration.js does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            const result = await updater.exists('test-integration');

            expect(result).toBe(false);
        });
    });

    describe('_toCamelCase', () => {
        it('should convert kebab-case to camelCase', () => {
            expect(updater._toCamelCase('my-api-module')).toBe('myApiModule');
            expect(updater._toCamelCase('salesforce')).toBe('salesforce');
            expect(updater._toCamelCase('stripe-payments')).toBe('stripePayments');
            expect(updater._toCamelCase('my-long-module-name')).toBe('myLongModuleName');
        });
    });

    describe('_addModuleImport', () => {
        it('should add local import correctly', () => {
            const content = `const { IntegrationBase } = require('@friggframework/core');

class Test extends IntegrationBase {}`;

            const result = updater._addModuleImport(content, 'salesforce', 'local');

            expect(result).toContain("const salesforce = require('../api-modules/salesforce');");
        });

        it('should add npm import correctly', () => {
            const content = `const { IntegrationBase } = require('@friggframework/core');

class Test extends IntegrationBase {}`;

            const result = updater._addModuleImport(content, 'stripe', 'npm');

            expect(result).toContain("const stripe = require('@friggframework/api-module-stripe');");
        });

        it('should treat git source as local', () => {
            const content = `const { IntegrationBase } = require('@friggframework/core');

class Test extends IntegrationBase {}`;

            const result = updater._addModuleImport(content, 'custom-module', 'git');

            expect(result).toContain("const customModule = require('../api-modules/custom-module');");
        });
    });

    describe('_addModuleToDefinition', () => {
        it('should add module to existing modules object', () => {
            const content = `class Test extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
            // Add modules here
        },
    };
}`;

            const result = updater._addModuleToDefinition(content, 'salesforce');

            expect(result).toContain('salesforce: {');
            expect(result).toContain('definition: salesforce.Definition,');
        });

        it('should not add duplicate module', () => {
            const content = `class Test extends IntegrationBase {
    static Definition = {
        name: 'test',
        modules: {
            salesforce: {
                definition: salesforce.Definition,
            },
        },
    };
}`;

            const result = updater._addModuleToDefinition(content, 'salesforce');

            const occurrences = (result.match(/salesforce: {/g) || []).length;
            expect(occurrences).toBe(1);
        });

        it('should preserve existing modules when adding new one', () => {
            const content = `class Test extends IntegrationBase {
    static Definition = {
        modules: {
            existing: {
                definition: existing.Definition,
            },
        },
    };
}`;

            const result = updater._addModuleToDefinition(content, 'salesforce');

            expect(result).toContain('existing: {');
            expect(result).toContain('salesforce: {');
        });
    });
});
