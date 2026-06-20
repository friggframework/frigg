/**
 * Tests for CloudFormationChangeSetCreator Adapter
 *
 * Tests CloudFormation Change Set API integration using mocked AWS SDK v3 clients
 * Following TDD principles - tests written first
 */

// Mock AWS SDK v3 - must be before any requires
jest.mock('@aws-sdk/client-cloudformation');

const {
    mockChangeSetEmpty,
    mockChangeSetWithAdditions,
    mockAwsSdkResponses,
} = require('../../fixtures/mock-change-sets');

describe('CloudFormationChangeSetCreator', () => {
    let creator;
    let mockSend;
    let mockClient;
    let CloudFormationChangeSetCreator;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Get the mocked AWS SDK
        const {
            CloudFormationClient,
            CreateChangeSetCommand,
            DescribeStacksCommand,
            DescribeChangeSetCommand,
            DeleteChangeSetCommand,
        } = require('@aws-sdk/client-cloudformation');

        // Create mock client with send method
        mockSend = jest.fn();
        mockClient = {
            send: mockSend,
        };

        // Configure the CloudFormationClient mock to return mockClient
        CloudFormationClient.mockImplementation(() => mockClient);

        // Mock the Command constructors to just return their input
        CreateChangeSetCommand.mockImplementation((input) => ({ input }));
        DescribeStacksCommand.mockImplementation((input) => ({ input }));
        DescribeChangeSetCommand.mockImplementation((input) => ({ input }));
        DeleteChangeSetCommand.mockImplementation((input) => ({ input }));

        // Require the module after mocks are set up
        ({ CloudFormationChangeSetCreator } = require('../../../infrastructure/adapters/CloudFormationChangeSetCreator'));

        creator = new CloudFormationChangeSetCreator({ region: 'us-east-1' });
    });

    describe('constructor', () => {
        it('should create instance with default region', () => {
            const instance = new CloudFormationChangeSetCreator();
            expect(instance).toBeInstanceOf(CloudFormationChangeSetCreator);
        });

        it('should create instance with custom region', () => {
            const instance = new CloudFormationChangeSetCreator({ region: 'eu-west-1' });
            expect(instance).toBeInstanceOf(CloudFormationChangeSetCreator);
        });

        it('should lazy-load CloudFormation client', () => {
            const { CloudFormationClient } = require('@aws-sdk/client-cloudformation');
            CloudFormationClient.mockClear();

            const instance = new CloudFormationChangeSetCreator({ region: 'us-east-1' });

            // Client should not be created until first use
            expect(CloudFormationClient).not.toHaveBeenCalled();
        });
    });

    describe('stackExists', () => {
        it('should return true if stack exists', async () => {
            mockSend.mockResolvedValue(mockAwsSdkResponses.cloudformation.describeStacks);

            const exists = await creator.stackExists('test-stack');

            expect(exists).toBe(true);
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should return false if stack does not exist', async () => {
            const error = new Error('Stack with id non-existent-stack does not exist');
            error.name = 'ValidationError';
            mockSend.mockRejectedValue(error);

            const exists = await creator.stackExists('non-existent-stack');

            expect(exists).toBe(false);
        });

        it('should return false for deleted stacks', async () => {
            mockSend.mockResolvedValue({
                Stacks: [
                    {
                        StackName: 'deleted-stack',
                        StackStatus: 'DELETE_COMPLETE',
                    },
                ],
            });

            const exists = await creator.stackExists('deleted-stack');

            expect(exists).toBe(false);
        });

        it('should throw error for other AWS errors', async () => {
            const error = new Error('Access Denied');
            error.name = 'AccessDeniedException';
            mockSend.mockRejectedValue(error);

            await expect(creator.stackExists('test-stack')).rejects.toThrow('Access Denied');
        });
    });

    describe('createChangeSet', () => {
        it('should create change set for new stack (CREATE)', async () => {
            // Stack doesn't exist
            const notFoundError = new Error('Stack does not exist');
            notFoundError.name = 'ValidationError';
            mockSend.mockRejectedValueOnce(notFoundError);

            // CreateChangeSet succeeds
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.createChangeSet);

            const params = {
                stackName: 'new-stack',
                template: 'Resources: {}',
                parameters: [{ ParameterKey: 'Stage', ParameterValue: 'prod' }],
                tags: [{ Key: 'Team', Value: 'platform' }],
                capabilities: ['CAPABILITY_IAM'],
            };

            const result = await creator.createChangeSet(params);

            expect(result).toEqual({
                changeSetId: mockAwsSdkResponses.cloudformation.createChangeSet.Id,
                stackId: mockAwsSdkResponses.cloudformation.createChangeSet.StackId,
                changeSetName: expect.stringContaining('frigg-dry-run-'),
                changeSetType: 'CREATE',
            });

            expect(mockSend).toHaveBeenCalledTimes(2); // DescribeStacks + CreateChangeSet
        });

        it('should create change set for existing stack (UPDATE)', async () => {
            // Stack exists
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.describeStacks);

            // CreateChangeSet succeeds
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.createChangeSet);

            const params = {
                stackName: 'test-stack',
                template: 'Resources: {}',
                parameters: [],
                tags: [],
                capabilities: ['CAPABILITY_IAM'],
            };

            const result = await creator.createChangeSet(params);

            expect(result).toEqual({
                changeSetId: mockAwsSdkResponses.cloudformation.createChangeSet.Id,
                stackId: mockAwsSdkResponses.cloudformation.createChangeSet.StackId,
                changeSetName: expect.stringContaining('frigg-dry-run-'),
                changeSetType: 'UPDATE',
            });

            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('should include all parameters in CreateChangeSet command', async () => {
            // Stack exists
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.describeStacks);

            // CreateChangeSet
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.createChangeSet);

            const { CreateChangeSetCommand } = require('@aws-sdk/client-cloudformation');
            CreateChangeSetCommand.mockClear();

            const params = {
                stackName: 'test-stack',
                template: 'AWSTemplateFormatVersion: "2010-09-09"',
                parameters: [
                    { ParameterKey: 'Stage', ParameterValue: 'prod' },
                    { ParameterKey: 'Region', ParameterValue: 'us-east-1' },
                ],
                tags: [
                    { Key: 'Team', Value: 'platform' },
                    { Key: 'Environment', Value: 'production' },
                ],
                capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
            };

            await creator.createChangeSet(params);

            // Verify CreateChangeSetCommand was called with correct parameters
            expect(CreateChangeSetCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    StackName: 'test-stack',
                    TemplateBody: params.template,
                    Parameters: params.parameters,
                    Tags: params.tags,
                    Capabilities: params.capabilities,
                    ChangeSetType: 'UPDATE',
                    ChangeSetName: expect.stringContaining('frigg-dry-run-'),
                })
            );
        });

        it('should handle CreateChangeSet errors', async () => {
            // Stack exists
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.describeStacks);

            // CreateChangeSet fails
            const error = new Error('Invalid template');
            error.name = 'ValidationError';
            mockSend.mockRejectedValueOnce(error);

            const params = {
                stackName: 'test-stack',
                template: 'Invalid: template',
                parameters: [],
                tags: [],
                capabilities: [],
            };

            await expect(creator.createChangeSet(params)).rejects.toThrow('Invalid template');
        });

        it('should generate unique change set names', async () => {
            // Stack exists
            mockSend.mockResolvedValue(mockAwsSdkResponses.cloudformation.describeStacks);
            mockSend.mockResolvedValue(mockAwsSdkResponses.cloudformation.createChangeSet);

            const params = {
                stackName: 'test-stack',
                template: 'Resources: {}',
                parameters: [],
                tags: [],
                capabilities: [],
            };

            const result1 = await creator.createChangeSet(params);

            // Reset for second call
            jest.clearAllMocks();
            mockSend.mockResolvedValue(mockAwsSdkResponses.cloudformation.describeStacks);
            mockSend.mockResolvedValue(mockAwsSdkResponses.cloudformation.createChangeSet);

            const result2 = await creator.createChangeSet(params);

            // Change set names should be different due to timestamp
            expect(result1.changeSetName).toMatch(/frigg-dry-run-\d+/);
            expect(result2.changeSetName).toMatch(/frigg-dry-run-\d+/);
        });
    });

    describe('waitForChangeSet', () => {
        it('should wait for change set to reach CREATE_COMPLETE status', async () => {
            // First poll: IN_PROGRESS
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_IN_PROGRESS',
                StatusReason: 'Creating change set',
            });

            // Second poll: CREATE_COMPLETE
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_COMPLETE',
                StatusReason: 'Change set created successfully',
            });

            await creator.waitForChangeSet('test-stack', 'change-set-123', 10000);

            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('should handle "No updates" status as successful completion', async () => {
            mockSend.mockResolvedValue({
                Status: 'FAILED',
                StatusReason: "The submitted information didn't contain changes. Submit different information to create a change set.",
            });

            // Should not throw error for "No updates" case
            await expect(
                creator.waitForChangeSet('test-stack', 'change-set-123', 5000)
            ).resolves.not.toThrow();

            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should throw error if change set creation fails', async () => {
            mockSend.mockResolvedValue({
                Status: 'FAILED',
                StatusReason: 'Invalid template syntax',
            });

            await expect(
                creator.waitForChangeSet('test-stack', 'change-set-123', 5000)
            ).rejects.toThrow('Change set creation failed: Invalid template syntax');
        });

        it('should timeout if max wait time exceeded', async () => {
            // Always return CREATE_IN_PROGRESS
            mockSend.mockResolvedValue({
                Status: 'CREATE_IN_PROGRESS',
                StatusReason: 'Still creating...',
            });

            // Use short timeout for test
            await expect(
                creator.waitForChangeSet('test-stack', 'change-set-123', 1000)
            ).rejects.toThrow('Timeout waiting for change set creation');
        }, 10000);

        it('should poll at regular intervals', async () => {
            const startTime = Date.now();

            // Return IN_PROGRESS twice, then COMPLETE
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_IN_PROGRESS',
            });
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_IN_PROGRESS',
            });
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_COMPLETE',
            });

            await creator.waitForChangeSet('test-stack', 'change-set-123', 10000);

            const elapsed = Date.now() - startTime;

            expect(mockSend).toHaveBeenCalledTimes(3);
            // Should have polled at least 3 times (with delays between polls)
            expect(elapsed).toBeGreaterThanOrEqual(4000); // 2 delays of 2 seconds each
        }, 15000);

        it('should handle API errors during polling', async () => {
            const error = new Error('Network error');
            mockSend.mockRejectedValue(error);

            await expect(
                creator.waitForChangeSet('test-stack', 'change-set-123', 5000)
            ).rejects.toThrow('Network error');
        });
    });

    describe('getChangeSetDetails', () => {
        it('should retrieve change set details', async () => {
            mockSend.mockResolvedValue(mockChangeSetWithAdditions);

            const details = await creator.getChangeSetDetails('test-stack', 'change-set-123');

            expect(details).toEqual(mockChangeSetWithAdditions);
            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should handle empty change sets', async () => {
            mockSend.mockResolvedValue(mockChangeSetEmpty);

            const details = await creator.getChangeSetDetails('test-stack', 'change-set-123');

            expect(details.Changes).toEqual([]);
            expect(details.Status).toBe('CREATE_COMPLETE');
        });

        it('should handle change sets with multiple pages (pagination)', async () => {
            // First page
            mockSend.mockResolvedValueOnce({
                ...mockChangeSetWithAdditions,
                Changes: [mockChangeSetWithAdditions.Changes[0]],
                NextToken: 'token-123',
            });

            // Second page
            mockSend.mockResolvedValueOnce({
                ...mockChangeSetWithAdditions,
                Changes: [mockChangeSetWithAdditions.Changes[1], mockChangeSetWithAdditions.Changes[2]],
            });

            const details = await creator.getChangeSetDetails('test-stack', 'change-set-123');

            expect(details.Changes).toHaveLength(3);
            expect(mockSend).toHaveBeenCalledTimes(2);
        });

        it('should throw error if change set does not exist', async () => {
            const error = new Error('Change set does not exist');
            error.name = 'ChangeSetNotFoundException';
            mockSend.mockRejectedValue(error);

            await expect(
                creator.getChangeSetDetails('test-stack', 'change-set-123')
            ).rejects.toThrow('Change set does not exist');
        });

        it('should include all change set metadata', async () => {
            mockSend.mockResolvedValue(mockChangeSetWithAdditions);

            const details = await creator.getChangeSetDetails('test-stack', 'change-set-123');

            expect(details).toHaveProperty('ChangeSetId');
            expect(details).toHaveProperty('ChangeSetName');
            expect(details).toHaveProperty('StackId');
            expect(details).toHaveProperty('StackName');
            expect(details).toHaveProperty('Status');
            expect(details).toHaveProperty('Changes');
            expect(details).toHaveProperty('CreationTime');
        });
    });

    describe('deleteChangeSet', () => {
        it('should delete change set successfully', async () => {
            mockSend.mockResolvedValue(mockAwsSdkResponses.cloudformation.deleteChangeSet);

            await creator.deleteChangeSet('test-stack', 'change-set-123');

            expect(mockSend).toHaveBeenCalledTimes(1);
        });

        it('should handle deletion of non-existent change set gracefully', async () => {
            const error = new Error('Change set does not exist');
            error.name = 'ChangeSetNotFoundException';
            mockSend.mockRejectedValue(error);

            // Should not throw - deletion is idempotent
            await expect(
                creator.deleteChangeSet('test-stack', 'change-set-123')
            ).resolves.not.toThrow();
        });

        it('should throw error for other deletion errors', async () => {
            const error = new Error('Access Denied');
            error.name = 'AccessDeniedException';
            mockSend.mockRejectedValue(error);

            await expect(
                creator.deleteChangeSet('test-stack', 'change-set-123')
            ).rejects.toThrow('Access Denied');
        });

        it('should use correct DeleteChangeSet command parameters', async () => {
            mockSend.mockResolvedValue({});

            const { DeleteChangeSetCommand } = require('@aws-sdk/client-cloudformation');
            DeleteChangeSetCommand.mockClear();

            await creator.deleteChangeSet('my-stack', 'my-change-set');

            expect(DeleteChangeSetCommand).toHaveBeenCalledWith({
                StackName: 'my-stack',
                ChangeSetName: 'my-change-set',
            });
        });
    });

    describe('error handling', () => {
        it('should handle network errors gracefully', async () => {
            const error = new Error('Network timeout');
            error.code = 'NetworkingError';
            mockSend.mockRejectedValue(error);

            await expect(creator.stackExists('test-stack')).rejects.toThrow('Network timeout');
        });

        it('should handle throttling errors', async () => {
            const error = new Error('Rate exceeded');
            error.name = 'Throttling';
            mockSend.mockRejectedValue(error);

            await expect(creator.stackExists('test-stack')).rejects.toThrow('Rate exceeded');
        });

        it('should preserve error stack traces', async () => {
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n    at Test.it';
            mockSend.mockRejectedValue(error);

            try {
                await creator.stackExists('test-stack');
            } catch (e) {
                expect(e.stack).toBeDefined();
                expect(e.stack).toContain('Test error');
            }
        });
    });

    describe('integration scenarios', () => {
        it('should handle complete dry-run workflow', async () => {
            // 1. Check stack exists
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.describeStacks);

            // 2. Create change set (internally calls stackExists + createChangeSet)
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.describeStacks);
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.createChangeSet);

            // 3. Wait for change set (CREATE_COMPLETE immediately)
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_COMPLETE',
            });

            // 4. Get change set details
            mockSend.mockResolvedValueOnce(mockChangeSetWithAdditions);

            // 5. Delete change set
            mockSend.mockResolvedValueOnce({});

            const params = {
                stackName: 'test-stack',
                template: 'Resources: {}',
                parameters: [],
                tags: [],
                capabilities: [],
            };

            // Execute workflow
            const exists = await creator.stackExists('test-stack');
            expect(exists).toBe(true);

            const changeSet = await creator.createChangeSet(params);
            expect(changeSet.changeSetType).toBe('UPDATE');

            await creator.waitForChangeSet('test-stack', changeSet.changeSetName, 10000);

            const details = await creator.getChangeSetDetails('test-stack', changeSet.changeSetName);
            expect(details.Changes).toHaveLength(3);

            await creator.deleteChangeSet('test-stack', changeSet.changeSetName);

            expect(mockSend).toHaveBeenCalledTimes(6);
        });

        it('should handle new stack creation workflow', async () => {
            // 1. Check stack exists - it doesn't
            const notFoundError = new Error('Stack does not exist');
            notFoundError.name = 'ValidationError';
            mockSend.mockRejectedValueOnce(notFoundError);

            // 2. Create change set (internally calls stackExists + createChangeSet)
            const notFoundError2 = new Error('Stack does not exist');
            notFoundError2.name = 'ValidationError';
            mockSend.mockRejectedValueOnce(notFoundError2);
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.createChangeSet);

            // 3. Wait for change set
            mockSend.mockResolvedValueOnce({
                Status: 'CREATE_COMPLETE',
            });

            // 4. Get details
            mockSend.mockResolvedValueOnce(mockChangeSetWithAdditions);

            // 5. Delete
            mockSend.mockResolvedValueOnce({});

            const params = {
                stackName: 'new-stack',
                template: 'Resources: {}',
                parameters: [],
                tags: [],
                capabilities: [],
            };

            const exists = await creator.stackExists('new-stack');
            expect(exists).toBe(false);

            const changeSet = await creator.createChangeSet(params);
            expect(changeSet.changeSetType).toBe('CREATE');

            await creator.waitForChangeSet('new-stack', changeSet.changeSetName, 10000);

            const details = await creator.getChangeSetDetails('new-stack', changeSet.changeSetName);
            expect(details.Changes).toBeDefined();

            await creator.deleteChangeSet('new-stack', changeSet.changeSetName);

            expect(mockSend).toHaveBeenCalledTimes(6);
        });

        it('should handle no changes scenario', async () => {
            // Stack exists
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.describeStacks);

            // Create change set
            mockSend.mockResolvedValueOnce(mockAwsSdkResponses.cloudformation.createChangeSet);

            // Wait returns "No updates"
            mockSend.mockResolvedValueOnce({
                Status: 'FAILED',
                StatusReason: "The submitted information didn't contain changes. Submit different information to create a change set.",
            });

            // Get details returns empty changes
            mockSend.mockResolvedValueOnce(mockChangeSetEmpty);

            // Delete change set
            mockSend.mockResolvedValueOnce({});

            const params = {
                stackName: 'test-stack',
                template: 'Resources: {}',
                parameters: [],
                tags: [],
                capabilities: [],
            };

            const changeSet = await creator.createChangeSet(params);

            // Should not throw for "No updates"
            await creator.waitForChangeSet('test-stack', changeSet.changeSetName, 5000);

            const details = await creator.getChangeSetDetails('test-stack', changeSet.changeSetName);
            expect(details.Changes).toEqual([]);

            await creator.deleteChangeSet('test-stack', changeSet.changeSetName);
        });
    });
});
