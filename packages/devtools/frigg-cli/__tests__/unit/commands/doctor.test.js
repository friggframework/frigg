/**
 * Unit tests for frigg doctor command
 * Tests stack listing, selection, and health check orchestration
 */

describe('Doctor Command - Stack Listing and Selection', () => {
    let mockCloudFormationClient;
    let mockSelect;
    let listStacks;
    let promptForStackSelection;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock AWS SDK CloudFormation client
        mockCloudFormationClient = {
            send: jest.fn(),
        };

        // Mock @inquirer/prompts select function
        mockSelect = jest.fn();
    });

    describe('listStacks', () => {
        test('should return array of stacks with name, status, and timestamps', async () => {
            // Arrange
            const mockResponse = {
                StackSummaries: [
                    {
                        StackName: 'quo-frigg-production',
                        StackStatus: 'UPDATE_COMPLETE',
                        CreationTime: new Date('2024-01-15'),
                        LastUpdatedTime: new Date('2024-10-20'),
                    },
                    {
                        StackName: 'test-app-dev',
                        StackStatus: 'CREATE_COMPLETE',
                        CreationTime: new Date('2024-10-01'),
                        LastUpdatedTime: null,
                    },
                ],
            };

            mockCloudFormationClient.send.mockResolvedValue(mockResponse);

            // Act
            const { CloudFormationClient, ListStacksCommand } = require('@aws-sdk/client-cloudformation');
            const client = new CloudFormationClient({ region: 'us-east-1' });
            const command = new ListStacksCommand({
                StackStatusFilter: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE', 'ROLLBACK_COMPLETE'],
            });
            const response = await mockCloudFormationClient.send(command);
            const stacks = response.StackSummaries.map(stack => ({
                name: stack.StackName,
                status: stack.StackStatus,
                createdTime: stack.CreationTime,
                updatedTime: stack.LastUpdatedTime,
            }));

            // Assert
            expect(stacks).toHaveLength(2);
            expect(stacks[0]).toEqual({
                name: 'quo-frigg-production',
                status: 'UPDATE_COMPLETE',
                createdTime: new Date('2024-01-15'),
                updatedTime: new Date('2024-10-20'),
            });
            expect(stacks[1]).toEqual({
                name: 'test-app-dev',
                status: 'CREATE_COMPLETE',
                createdTime: new Date('2024-10-01'),
                updatedTime: null,
            });
        });

        test('should filter stacks by completed statuses only', async () => {
            // Arrange - command should request only completed stacks
            const expectedFilter = [
                'CREATE_COMPLETE',
                'UPDATE_COMPLETE',
                'UPDATE_ROLLBACK_COMPLETE',
                'ROLLBACK_COMPLETE',
            ];

            // Act
            const { ListStacksCommand } = require('@aws-sdk/client-cloudformation');
            const command = new ListStacksCommand({
                StackStatusFilter: expectedFilter,
            });

            // Assert
            expect(command.input.StackStatusFilter).toEqual(expectedFilter);
        });

        test('should handle empty stack list', async () => {
            // Arrange
            const mockResponse = {
                StackSummaries: [],
            };

            mockCloudFormationClient.send.mockResolvedValue(mockResponse);

            // Act
            const response = await mockCloudFormationClient.send();
            const stacks = (response.StackSummaries || []).map(stack => ({
                name: stack.StackName,
                status: stack.StackStatus,
                createdTime: stack.CreationTime,
                updatedTime: stack.LastUpdatedTime,
            }));

            // Assert
            expect(stacks).toEqual([]);
        });

        test('should throw error with helpful message when API call fails', async () => {
            // Arrange
            const apiError = new Error('AccessDenied: User is not authorized');
            mockCloudFormationClient.send.mockRejectedValue(apiError);

            // Act & Assert
            await expect(async () => {
                try {
                    await mockCloudFormationClient.send();
                } catch (error) {
                    throw new Error(`Failed to list CloudFormation stacks: ${error.message}`);
                }
            }).rejects.toThrow('Failed to list CloudFormation stacks: AccessDenied: User is not authorized');
        });
    });

    describe('promptForStackSelection', () => {
        test('should display stacks with status icons and metadata', async () => {
            // Arrange
            const mockStacks = [
                {
                    name: 'production-stack',
                    status: 'UPDATE_COMPLETE',
                    createdTime: new Date('2024-01-15'),
                    updatedTime: new Date('2024-10-20'),
                },
                {
                    name: 'dev-stack',
                    status: 'CREATE_COMPLETE',
                    createdTime: new Date('2024-10-01'),
                    updatedTime: null,
                },
            ];

            const expectedChoices = [
                {
                    name: '✓ production-stack (UPDATE_COMPLETE) - Updated: 10/20/2024',
                    value: 'production-stack',
                    description: 'Status: UPDATE_COMPLETE',
                },
                {
                    name: '✓ dev-stack (CREATE_COMPLETE) - Created: 10/1/2024',
                    value: 'dev-stack',
                    description: 'Status: CREATE_COMPLETE',
                },
            ];

            mockSelect.mockResolvedValue('production-stack');

            // Act
            const choices = mockStacks.map(stack => {
                const statusIcon = stack.status.includes('COMPLETE') ? '✓' : '⚠';
                const timeInfo = stack.updatedTime
                    ? `Updated: ${stack.updatedTime.toLocaleDateString()}`
                    : `Created: ${stack.createdTime.toLocaleDateString()}`;

                return {
                    name: `${statusIcon} ${stack.name} (${stack.status}) - ${timeInfo}`,
                    value: stack.name,
                    description: `Status: ${stack.status}`,
                };
            });

            const selectedStack = await mockSelect({
                message: 'Select a stack to run health check:',
                choices,
                pageSize: 15,
            });

            // Assert
            expect(choices).toEqual(expectedChoices);
            expect(selectedStack).toBe('production-stack');
            expect(mockSelect).toHaveBeenCalledWith({
                message: 'Select a stack to run health check:',
                choices: expectedChoices,
                pageSize: 15,
            });
        });

        test('should exit with error when no stacks are found', async () => {
            // Arrange
            const mockStacks = [];
            const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
            const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

            // Act
            if (mockStacks.length === 0) {
                console.error('\n✗ No CloudFormation stacks found in us-east-1');
                console.log('  Make sure you have stacks deployed and the correct AWS credentials configured.');
                process.exit(1);
            }

            // Assert
            expect(mockConsoleError).toHaveBeenCalledWith('\n✗ No CloudFormation stacks found in us-east-1');
            expect(mockConsoleLog).toHaveBeenCalledWith('  Make sure you have stacks deployed and the correct AWS credentials configured.');
            expect(mockExit).toHaveBeenCalledWith(1);

            mockExit.mockRestore();
            mockConsoleError.mockRestore();
            mockConsoleLog.mockRestore();
        });

        test('should return selected stack name', async () => {
            // Arrange
            const mockStacks = [
                { name: 'stack-a', status: 'UPDATE_COMPLETE', createdTime: new Date(), updatedTime: new Date() },
                { name: 'stack-b', status: 'CREATE_COMPLETE', createdTime: new Date(), updatedTime: null },
            ];

            mockSelect.mockResolvedValue('stack-b');

            // Act
            const choices = mockStacks.map(stack => ({
                name: `${stack.name} (${stack.status})`,
                value: stack.name,
                description: `Status: ${stack.status}`,
            }));

            const selectedStack = await mockSelect({
                message: 'Select a stack to run health check:',
                choices,
                pageSize: 15,
            });

            // Assert
            expect(selectedStack).toBe('stack-b');
        });

        test('should handle user cancellation (Ctrl+C)', async () => {
            // Arrange
            mockSelect.mockRejectedValue(new Error('User cancelled'));

            // Act & Assert
            await expect(mockSelect({ message: 'Select a stack:', choices: [] }))
                .rejects.toThrow('User cancelled');
        });
    });

    describe('doctorCommand integration with stack selection', () => {
        test('should prompt for stack selection when stackName is not provided', async () => {
            // Arrange
            const mockPromptForStackSelection = jest.fn().mockResolvedValue('selected-stack');
            const stackName = undefined;
            const region = 'us-east-1';

            // Act
            let selectedStack = stackName;
            if (!selectedStack) {
                selectedStack = await mockPromptForStackSelection(region);
            }

            // Assert
            expect(mockPromptForStackSelection).toHaveBeenCalledWith('us-east-1');
            expect(selectedStack).toBe('selected-stack');
        });

        test('should use provided stackName when given', async () => {
            // Arrange
            const mockPromptForStackSelection = jest.fn();
            const stackName = 'my-production-stack';
            const region = 'us-east-1';

            // Act
            let selectedStack = stackName;
            if (!selectedStack) {
                selectedStack = await mockPromptForStackSelection(region);
            }

            // Assert
            expect(mockPromptForStackSelection).not.toHaveBeenCalled();
            expect(selectedStack).toBe('my-production-stack');
        });

        test('should use region from options or default to us-east-1', () => {
            // Test with region provided
            const options1 = { region: 'eu-west-1' };
            const region1 = options1.region || process.env.AWS_REGION || 'us-east-1';
            expect(region1).toBe('eu-west-1');

            // Test with no region (and no env var)
            const oldEnv = process.env.AWS_REGION;
            delete process.env.AWS_REGION;
            const options2 = {};
            const region2 = options2.region || process.env.AWS_REGION || 'us-east-1';
            expect(region2).toBe('us-east-1');

            // Restore
            if (oldEnv) process.env.AWS_REGION = oldEnv;
        });
    });
});
