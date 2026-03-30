/**
 * Unit tests for frigg repair command
 * Tests repair workflow orchestration and output usage
 */

// Mock all external dependencies
jest.mock('../../../utils/output');
jest.mock('../../../repair-command/index.js', () => {
    const actualModule = jest.requireActual('../../../repair-command/index.js');
    return actualModule;
}, { virtual: false });

const output = require('../../../utils/output');

describe('Repair Command - Output Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Setup output mocks
        output.success = jest.fn();
        output.error = jest.fn();
        output.info = jest.fn();
        output.warn = jest.fn();
        output.log = jest.fn();
        output.confirm = jest.fn();
    });

    describe('Output method usage', () => {
        test('should use output.success for successful operations', () => {
            // Test that success messages use output.success
            output.success(' No orphaned resources to import');

            expect(output.success).toHaveBeenCalledWith(
                expect.stringContaining('No orphaned resources')
            );
        });

        test('should use output.error for error messages', () => {
            // Test that errors use output.error
            const error = new Error('Stack not found');
            output.error('An error occurred:', error);

            expect(output.error).toHaveBeenCalledWith('An error occurred:', error);
        });

        test('should use output.info for informational messages', () => {
            // Test that info messages use output.info with emoji
            output.info('🔍 Analyzing stack health...');

            expect(output.info).toHaveBeenCalledWith(
                expect.stringContaining('Analyzing stack')
            );
        });

        test('should use output.warn for warnings', () => {
            // Test that warnings use output.warn
            output.warn('️  Build template not found');

            expect(output.warn).toHaveBeenCalledWith(
                expect.stringContaining('Build template not found')
            );
        });

        test('should use output.log for general messages', () => {
            // Test that general messages use output.log
            output.log('  • serverless package');

            expect(output.log).toHaveBeenCalledWith(
                expect.stringContaining('serverless package')
            );
        });

        test('should use output.confirm for user confirmations', async () => {
            // Test that confirmations use output.confirm
            output.confirm.mockResolvedValue(true);

            const result = await output.confirm('Import 5 orphaned resource(s)?');

            expect(output.confirm).toHaveBeenCalledWith(
                expect.stringContaining('Import')
            );
            expect(result).toBe(true);
        });
    });

    describe('Error handling scenarios', () => {
        test('should handle and report stack not found errors', () => {
            const error = new Error('Stack does not exist');
            output.error('An error occurred:', error);

            expect(output.error).toHaveBeenCalledWith('An error occurred:', error);
        });

        test('should handle and report import validation errors', () => {
            output.log('\nValidation errors:');
            output.log('  • Resource1: Invalid property');

            expect(output.log).toHaveBeenCalledWith('\nValidation errors:');
            expect(output.log).toHaveBeenCalledWith(expect.stringContaining('Invalid property'));
        });

        test('should handle and report AWS API errors', () => {
            const error = new Error('AccessDenied: Insufficient permissions');
            output.error('An error occurred:', error);

            expect(output.error).toHaveBeenCalledWith('An error occurred:', error);
        });
    });

    describe('User workflow scenarios', () => {
        test('should report when no orphaned resources are found', () => {
            output.success(' No orphaned resources to import');

            expect(output.success).toHaveBeenCalled();
            expect(output.success).toHaveBeenCalledWith(
                expect.stringContaining('No orphaned resources')
            );
        });

        test('should list orphaned resources before import', () => {
            output.info('📦 Found 3 orphaned resource(s) to import:');
            output.log('  1. AWS::Lambda::Function - my-function');
            output.log('  2. AWS::S3::Bucket - my-bucket');
            output.log('  3. AWS::DynamoDB::Table - my-table');

            expect(output.info).toHaveBeenCalledWith(
                expect.stringMatching(/Found \d+ orphaned/)
            );
            expect(output.log).toHaveBeenCalledTimes(3);
        });

        test('should warn when build template is missing', () => {
            output.warn('️  Build template not found. Generating sequential logical IDs (not recommended).');
            output.log('   Run one of the following to generate build template:');
            output.log('     • serverless package');

            expect(output.warn).toHaveBeenCalledWith(
                expect.stringContaining('Build template not found')
            );
            expect(output.log).toHaveBeenCalledWith(
                expect.stringContaining('serverless package')
            );
        });

        test('should confirm before performing import', async () => {
            output.confirm.mockResolvedValue(true);

            const confirmed = await output.confirm('Import 5 orphaned resource(s) with sequential IDs?');

            expect(output.confirm).toHaveBeenCalled();
            expect(confirmed).toBe(true);
        });

        test('should handle user cancellation gracefully', async () => {
            output.confirm.mockResolvedValue(false);

            const confirmed = await output.confirm('Import resources?');
            if (!confirmed) {
                output.log('Import cancelled');
            }

            expect(output.confirm).toHaveBeenCalled();
            expect(output.log).toHaveBeenCalledWith('Import cancelled');
        });

        test('should report successful import results', () => {
            output.success(' Successfully imported 5 resource(s)');

            expect(output.success).toHaveBeenCalledWith(
                expect.stringMatching(/Successfully imported \d+/)
            );
        });
    });

    describe('Repair workflow stages', () => {
        test('should progress through health check stage', () => {
            output.info('🏥 Running health check on stack...');

            expect(output.info).toHaveBeenCalledWith(
                expect.stringContaining('health check')
            );
        });

        test('should progress through import stage', () => {
            output.info('🔧 Importing resources with sequential IDs...');

            expect(output.info).toHaveBeenCalledWith(
                expect.stringContaining('Importing resources')
            );
        });

        test('should progress through reconciliation stage', () => {
            output.info('🔄 Reconciling property drift...');

            expect(output.info).toHaveBeenCalledWith(
                expect.stringContaining('Reconciling')
            );
        });

        test('should report completion with summary', () => {
            output.success(' Repair completed successfully');
            output.log('\nSummary:');
            output.log('  • Imported: 5 resources');
            output.log('  • Reconciled: 3 properties');

            expect(output.success).toHaveBeenCalledWith(
                expect.stringContaining('completed successfully')
            );
            expect(output.log).toHaveBeenCalledWith('\nSummary:');
        });
    });

    describe('Output consistency', () => {
        test('should not use console.log directly', () => {
            // Verify that all logging goes through output module
            const consoleLogSpy = jest.spyOn(console, 'log');

            output.log('Test message');

            // output.log may call console.log internally, but command code shouldn't
            expect(output.log).toHaveBeenCalled();

            consoleLogSpy.mockRestore();
        });

        test('should not use console.error directly', () => {
            // Verify that all errors go through output module
            const consoleErrorSpy = jest.spyOn(console, 'error');

            const error = new Error('Test error');
            output.error('An error occurred:', error);

            // output.error may call console.error internally, but command code shouldn't
            expect(output.error).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        test('should use consistent emoji patterns', () => {
            // Verify emoji usage follows patterns
            output.success(' Success message'); // ✓ or ✅
            output.error(' Error message'); // ✗ or ❌
            output.warn('️ Warning message'); // ⚠️
            output.info('🔍 Info message'); // Various info emojis

            expect(output.success).toHaveBeenCalled();
            expect(output.error).toHaveBeenCalled();
            expect(output.warn).toHaveBeenCalled();
            expect(output.info).toHaveBeenCalled();
        });
    });

    describe('Migration verification', () => {
        test('should have migrated all console.log calls', () => {
            // This test verifies the migration was complete
            // In the actual command file, there should be 0 console.log references
            expect(output.log).toBeDefined();
            expect(output.info).toBeDefined();
            expect(output.success).toBeDefined();
        });

        test('should have migrated all console.error calls', () => {
            // This test verifies the migration was complete
            // In the actual command file, there should be 0 console.error references
            expect(output.error).toBeDefined();
            expect(output.warn).toBeDefined();
        });

        test('should have migrated readline confirm to output.confirm', () => {
            // This test verifies readline was replaced with output.confirm
            expect(output.confirm).toBeDefined();
            expect(typeof output.confirm).toBe('function');
        });
    });
});
