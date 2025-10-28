/**
 * ExecuteResourceImportUseCase Tests
 *
 * TDD tests for the application layer use case orchestrating CloudFormation
 * import execution for the `frigg repair --import` command.
 *
 * Application Layer - Use Case Tests
 * Following TDD, DDD, and Hexagonal Architecture principles
 *
 * Based on: SPEC-IMPORT-EXECUTION.md (lines 712-867)
 */

const ExecuteResourceImportUseCase = require('../execute-resource-import-use-case');

describe('ExecuteResourceImportUseCase', () => {
  let useCase;
  let mockImportTemplateGenerator;
  let mockImportProgressMonitor;
  let mockCloudFormationRepository;
  let mockStackRepository;

  beforeEach(() => {
    // Mock ImportTemplateGenerator
    mockImportTemplateGenerator = {
      generateImportTemplate: jest.fn(),
    };

    // Mock ImportProgressMonitor
    mockImportProgressMonitor = {
      monitorImport: jest.fn(),
    };

    // Mock CloudFormationRepository
    mockCloudFormationRepository = {
      createChangeSet: jest.fn(),
      waitForChangeSet: jest.fn(),
      executeChangeSet: jest.fn(),
      getStackStatus: jest.fn(),
      getStackResources: jest.fn(),
    };

    // Mock StackRepository
    mockStackRepository = {
      getTemplate: jest.fn(),
    };

    // Create use case with mocked dependencies
    useCase = new ExecuteResourceImportUseCase({
      importTemplateGenerator: mockImportTemplateGenerator,
      importProgressMonitor: mockImportProgressMonitor,
      cloudFormationRepository: mockCloudFormationRepository,
      stackRepository: mockStackRepository,
    });
  });

  describe('execute', () => {
    const stackIdentifier = {
      stackName: 'acme-integrations-dev',
      region: 'us-east-1',
    };

    const resourcesToImport = [
      {
        logicalId: 'FriggVPC',
        physicalId: 'vpc-12345678',
        resourceType: 'AWS::EC2::VPC',
      },
      {
        logicalId: 'FriggPrivateSubnet1',
        physicalId: 'subnet-11111111',
        resourceType: 'AWS::EC2::Subnet',
      },
      {
        logicalId: 'FriggLambdaSecurityGroup',
        physicalId: 'sg-0123456789abcdef0',
        resourceType: 'AWS::EC2::SecurityGroup',
      },
    ];

    const buildTemplatePath = '/path/to/build-template.json';

    it('should execute complete import workflow successfully', async () => {
      // Arrange: Mock all dependencies to succeed
      const mockTemplate = {
        Resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC', Properties: { CidrBlock: '10.0.0.0/16' } },
          FriggPrivateSubnet1: { Type: 'AWS::EC2::Subnet', Properties: { VpcId: 'vpc-12345678' } },
          FriggLambdaSecurityGroup: { Type: 'AWS::EC2::SecurityGroup', Properties: { VpcId: 'vpc-12345678' } },
        },
      };

      const mockResourceIdentifiers = [
        { ResourceType: 'AWS::EC2::VPC', LogicalResourceId: 'FriggVPC', ResourceIdentifier: { VpcId: 'vpc-12345678' } },
        { ResourceType: 'AWS::EC2::Subnet', LogicalResourceId: 'FriggPrivateSubnet1', ResourceIdentifier: { SubnetId: 'subnet-11111111' } },
        { ResourceType: 'AWS::EC2::SecurityGroup', LogicalResourceId: 'FriggLambdaSecurityGroup', ResourceIdentifier: { Id: 'sg-0123456789abcdef0' } },
      ];

      const mockChangeSet = { Id: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/import-orphaned-resources-1234567890000/12345678-1234-1234-1234-123456789012' };

      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: mockTemplate,
        resourceIdentifiers: mockResourceIdentifiers,
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue(mockChangeSet);
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      mockImportProgressMonitor.monitorImport.mockResolvedValue({
        success: true,
        importedCount: 3,
        failedCount: 0,
        failedResources: [],
      });

      const mockStackResources = [
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-12345678', ResourceType: 'AWS::EC2::VPC' },
        { LogicalResourceId: 'FriggPrivateSubnet1', PhysicalResourceId: 'subnet-11111111', ResourceType: 'AWS::EC2::Subnet' },
        { LogicalResourceId: 'FriggLambdaSecurityGroup', PhysicalResourceId: 'sg-0123456789abcdef0', ResourceType: 'AWS::EC2::SecurityGroup' },
      ];

      mockCloudFormationRepository.getStackResources.mockResolvedValue(mockStackResources);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      const progressCallback = jest.fn();

      // Act: Execute import
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Check all steps were called in order
      expect(mockImportTemplateGenerator.generateImportTemplate).toHaveBeenCalledWith({
        resourcesToImport,
        buildTemplatePath,
        stackIdentifier,
      });

      expect(mockCloudFormationRepository.createChangeSet).toHaveBeenCalledWith(
        expect.objectContaining({
          stackIdentifier,
          changeSetType: 'IMPORT',
          template: mockTemplate,
          resourcesToImport: mockResourceIdentifiers,
        })
      );

      expect(mockCloudFormationRepository.waitForChangeSet).toHaveBeenCalled();
      expect(mockCloudFormationRepository.executeChangeSet).toHaveBeenCalled();

      expect(mockImportProgressMonitor.monitorImport).toHaveBeenCalledWith({
        stackIdentifier,
        resourceLogicalIds: ['FriggVPC', 'FriggPrivateSubnet1', 'FriggLambdaSecurityGroup'],
        onProgress: expect.any(Function),
      });

      expect(mockCloudFormationRepository.getStackResources).toHaveBeenCalledWith(stackIdentifier);
      expect(mockCloudFormationRepository.getStackStatus).toHaveBeenCalledWith(stackIdentifier);

      // Assert: Check result
      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(3);
      expect(result.failedCount).toBe(0);
      expect(result.stackStatus).toBe('UPDATE_COMPLETE');
      expect(result.verifiedResources).toHaveLength(3);
      expect(result.verifiedResources.every(r => r.verified)).toBe(true);

      // Assert: Check progress callback was called for each step
      expect(progressCallback).toHaveBeenCalledWith({ step: 'generate_template', status: 'in_progress' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'generate_template', status: 'complete' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'create_change_set', status: 'in_progress' });
      expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({ step: 'create_change_set', status: 'complete' }));
      expect(progressCallback).toHaveBeenCalledWith({ step: 'wait_change_set', status: 'in_progress' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'wait_change_set', status: 'complete' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'execute_import', status: 'in_progress' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'execute_import', status: 'complete' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'verify', status: 'in_progress' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'verify', status: 'complete' });
    });

    it('should handle template generation failure gracefully', async () => {
      // Arrange: Mock templateGenerator to throw
      const templateError = new Error('Failed to resolve intrinsic function !Ref VpcCidr');
      mockImportTemplateGenerator.generateImportTemplate.mockRejectedValue(templateError);

      const progressCallback = jest.fn();

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Check error is returned with step info
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to resolve intrinsic function !Ref VpcCidr');
      expect(result.step).toBeTruthy();

      // Verify only template generation was attempted
      expect(mockImportTemplateGenerator.generateImportTemplate).toHaveBeenCalled();
      expect(mockCloudFormationRepository.createChangeSet).not.toHaveBeenCalled();
      expect(mockCloudFormationRepository.executeChangeSet).not.toHaveBeenCalled();

      // Verify progress callback received in_progress but not complete
      expect(progressCallback).toHaveBeenCalledWith({ step: 'generate_template', status: 'in_progress' });
      expect(progressCallback).not.toHaveBeenCalledWith({ step: 'generate_template', status: 'complete' });
    });

    it('should handle change set creation failure gracefully', async () => {
      // Arrange: Mock template generation succeeds, change set creation fails
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      const changeSetError = new Error('Resource already managed by another stack');
      mockCloudFormationRepository.createChangeSet.mockRejectedValue(changeSetError);

      const progressCallback = jest.fn();

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Check error is returned
      expect(result.success).toBe(false);
      expect(result.error).toBe('Resource already managed by another stack');

      // Verify template generation succeeded but execution stopped
      expect(mockImportTemplateGenerator.generateImportTemplate).toHaveBeenCalled();
      expect(mockCloudFormationRepository.createChangeSet).toHaveBeenCalled();
      expect(mockCloudFormationRepository.executeChangeSet).not.toHaveBeenCalled();

      // Verify progress callbacks
      expect(progressCallback).toHaveBeenCalledWith({ step: 'generate_template', status: 'complete' });
      expect(progressCallback).toHaveBeenCalledWith({ step: 'create_change_set', status: 'in_progress' });
      expect(progressCallback).not.toHaveBeenCalledWith(expect.objectContaining({ step: 'create_change_set', status: 'complete' }));
    });

    it('should handle change set wait timeout gracefully', async () => {
      // Arrange: Mock successful template generation and change set creation, but wait fails
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: 'changeset-123' });

      const waitError = new Error('Change set creation timed out after 5 minutes');
      mockCloudFormationRepository.waitForChangeSet.mockRejectedValue(waitError);

      const progressCallback = jest.fn();

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Check error is returned
      expect(result.success).toBe(false);
      expect(result.error).toBe('Change set creation timed out after 5 minutes');

      // Verify change set was created but execution didn't proceed
      expect(mockCloudFormationRepository.createChangeSet).toHaveBeenCalled();
      expect(mockCloudFormationRepository.waitForChangeSet).toHaveBeenCalled();
      expect(mockCloudFormationRepository.executeChangeSet).not.toHaveBeenCalled();

      // Verify progress callbacks
      expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({ step: 'create_change_set', status: 'complete' }));
      expect(progressCallback).toHaveBeenCalledWith({ step: 'wait_change_set', status: 'in_progress' });
      expect(progressCallback).not.toHaveBeenCalledWith({ step: 'wait_change_set', status: 'complete' });
    });

    it('should handle execution failure during import gracefully', async () => {
      // Arrange: Mock successful setup but import monitoring fails
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: 'changeset-123' });
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      const importError = new Error('Import operation failed and rolled back');
      mockImportProgressMonitor.monitorImport.mockRejectedValue(importError);

      const progressCallback = jest.fn();

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Check error is returned
      expect(result.success).toBe(false);
      expect(result.error).toBe('Import operation failed and rolled back');

      // Verify execution started but failed during monitoring
      expect(mockCloudFormationRepository.executeChangeSet).toHaveBeenCalled();
      expect(mockImportProgressMonitor.monitorImport).toHaveBeenCalled();
      expect(mockCloudFormationRepository.getStackResources).not.toHaveBeenCalled();

      // Verify progress callbacks
      expect(progressCallback).toHaveBeenCalledWith({ step: 'execute_import', status: 'in_progress' });
      expect(progressCallback).not.toHaveBeenCalledWith({ step: 'execute_import', status: 'complete' });
    });

    it('should handle verification failure after import', async () => {
      // Arrange: Mock successful import but verification finds missing resources
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: 'changeset-123' });
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      mockImportProgressMonitor.monitorImport.mockResolvedValue({
        success: true,
        importedCount: 3,
        failedCount: 0,
        failedResources: [],
      });

      // Mock verification returning only 2 of 3 resources
      const mockStackResources = [
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-12345678', ResourceType: 'AWS::EC2::VPC' },
        { LogicalResourceId: 'FriggPrivateSubnet1', PhysicalResourceId: 'subnet-11111111', ResourceType: 'AWS::EC2::Subnet' },
        // FriggLambdaSecurityGroup is missing!
      ];

      mockCloudFormationRepository.getStackResources.mockResolvedValue(mockStackResources);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      const progressCallback = jest.fn();

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Check result shows partial success
      expect(result.success).toBe(true); // Import succeeded according to CloudFormation
      expect(result.importedCount).toBe(3);
      expect(result.verifiedResources).toHaveLength(3);

      // Check that one resource failed verification
      const unverifiedResource = result.verifiedResources.find(r => r.logicalId === 'FriggLambdaSecurityGroup');
      expect(unverifiedResource.verified).toBe(false);
      expect(unverifiedResource.physicalId).toBeUndefined();

      // Check that two resources passed verification
      const verifiedResources = result.verifiedResources.filter(r => r.verified);
      expect(verifiedResources).toHaveLength(2);

      // Verify all steps completed
      expect(progressCallback).toHaveBeenCalledWith({ step: 'verify', status: 'complete' });
    });

    it('should call onProgress callback at each step with correct status', async () => {
      // Arrange: Mock successful workflow
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [
          { ResourceType: 'AWS::EC2::VPC', LogicalResourceId: 'FriggVPC', ResourceIdentifier: { VpcId: 'vpc-123' } },
        ],
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: 'changeset-123' });
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      mockImportProgressMonitor.monitorImport.mockImplementation(async ({ onProgress }) => {
        // Simulate progress updates during import
        onProgress({ logicalId: 'FriggVPC', status: 'IN_PROGRESS', progress: 0, total: 1 });
        onProgress({ logicalId: 'FriggVPC', status: 'COMPLETE', progress: 1, total: 1 });
        return { success: true, importedCount: 1, failedCount: 0, failedResources: [] };
      });

      mockCloudFormationRepository.getStackResources.mockResolvedValue([
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-123', ResourceType: 'AWS::EC2::VPC' },
      ]);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      const progressCallback = jest.fn();

      // Act: Execute import
      await useCase.execute({
        stackIdentifier,
        resourcesToImport: [{ logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }],
        buildTemplatePath,
        onProgress: progressCallback,
      });

      // Assert: Verify progress callback sequence
      const calls = progressCallback.mock.calls.map(call => call[0]);

      // Step 1: Generate template
      expect(calls).toContainEqual({ step: 'generate_template', status: 'in_progress' });
      expect(calls).toContainEqual({ step: 'generate_template', status: 'complete' });

      // Step 2: Create change set
      expect(calls).toContainEqual({ step: 'create_change_set', status: 'in_progress' });
      expect(calls).toContainEqual(expect.objectContaining({ step: 'create_change_set', status: 'complete' }));

      // Step 3: Wait for change set
      expect(calls).toContainEqual({ step: 'wait_change_set', status: 'in_progress' });
      expect(calls).toContainEqual({ step: 'wait_change_set', status: 'complete' });

      // Step 4: Execute import with resource progress
      expect(calls).toContainEqual({ step: 'execute_import', status: 'in_progress' });
      expect(calls).toContainEqual(expect.objectContaining({
        step: 'execute_import',
        status: 'in_progress',
        resourceProgress: expect.objectContaining({ logicalId: 'FriggVPC', status: 'IN_PROGRESS' }),
      }));
      expect(calls).toContainEqual(expect.objectContaining({
        step: 'execute_import',
        status: 'in_progress',
        resourceProgress: expect.objectContaining({ logicalId: 'FriggVPC', status: 'COMPLETE' }),
      }));
      expect(calls).toContainEqual({ step: 'execute_import', status: 'complete' });

      // Step 5: Verify
      expect(calls).toContainEqual({ step: 'verify', status: 'in_progress' });
      expect(calls).toContainEqual({ step: 'verify', status: 'complete' });
    });

    it('should return detailed error information on failure', async () => {
      // Arrange: Mock failure with specific error details
      const detailedError = new Error('Template property mismatch: VPC CidrBlock expected 10.0.0.0/16 but found 172.31.0.0/16');
      detailedError.step = 'generate_template';
      detailedError.resourceType = 'AWS::EC2::VPC';
      detailedError.logicalId = 'FriggVPC';

      mockImportTemplateGenerator.generateImportTemplate.mockRejectedValue(detailedError);

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
      });

      // Assert: Check detailed error information is preserved
      expect(result.success).toBe(false);
      expect(result.error).toBe('Template property mismatch: VPC CidrBlock expected 10.0.0.0/16 but found 172.31.0.0/16');
      expect(result.step).toBe('generate_template');
    });

    it('should handle partial import success with failed resources', async () => {
      // Arrange: Mock import that succeeds for some resources but fails for others
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: 'changeset-123' });
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      mockImportProgressMonitor.monitorImport.mockResolvedValue({
        success: false, // Overall failure
        importedCount: 2,
        failedCount: 1,
        failedResources: [
          {
            logicalId: 'FriggLambdaSecurityGroup',
            reason: 'Resource property mismatch',
          },
        ],
      });

      mockCloudFormationRepository.getStackResources.mockResolvedValue([
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-12345678', ResourceType: 'AWS::EC2::VPC' },
        { LogicalResourceId: 'FriggPrivateSubnet1', PhysicalResourceId: 'subnet-11111111', ResourceType: 'AWS::EC2::Subnet' },
      ]);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_ROLLBACK_COMPLETE');

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport,
        buildTemplatePath,
      });

      // Assert: Check partial success is reported
      expect(result.success).toBe(true); // Use case completed (didn't throw)
      expect(result.importedCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.stackStatus).toBe('UPDATE_ROLLBACK_COMPLETE');
    });

    it('should work without onProgress callback', async () => {
      // Arrange: Mock successful workflow
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: 'changeset-123' });
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      mockImportProgressMonitor.monitorImport.mockResolvedValue({
        success: true,
        importedCount: 1,
        failedCount: 0,
        failedResources: [],
      });

      mockCloudFormationRepository.getStackResources.mockResolvedValue([
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-123', ResourceType: 'AWS::EC2::VPC' },
      ]);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      // Act: Call execute WITHOUT onProgress callback
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport: [{ logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }],
        buildTemplatePath,
        // NO onProgress provided
      });

      // Assert: Should not throw and should succeed
      expect(result.success).toBe(true);
      expect(mockImportTemplateGenerator.generateImportTemplate).toHaveBeenCalled();
      expect(mockCloudFormationRepository.executeChangeSet).toHaveBeenCalled();
    });

    it('should include change set name in result', async () => {
      // Arrange: Mock successful workflow
      mockImportTemplateGenerator.generateImportTemplate.mockResolvedValue({
        template: { Resources: {} },
        resourceIdentifiers: [],
      });

      const mockChangeSetId = 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/import-orphaned-resources-1234567890000/12345678-1234-1234-1234-123456789012';
      mockCloudFormationRepository.createChangeSet.mockResolvedValue({ Id: mockChangeSetId });
      mockCloudFormationRepository.waitForChangeSet.mockResolvedValue(undefined);
      mockCloudFormationRepository.executeChangeSet.mockResolvedValue(undefined);

      mockImportProgressMonitor.monitorImport.mockResolvedValue({
        success: true,
        importedCount: 1,
        failedCount: 0,
        failedResources: [],
      });

      mockCloudFormationRepository.getStackResources.mockResolvedValue([]);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      // Act: Call execute
      const result = await useCase.execute({
        stackIdentifier,
        resourcesToImport: [{ logicalId: 'FriggVPC', physicalId: 'vpc-123', resourceType: 'AWS::EC2::VPC' }],
        buildTemplatePath,
      });

      // Assert: Change set name should be in result
      expect(result.changeSetName).toMatch(/^import-orphaned-resources-\d+$/);
    });
  });

  describe('_verifyImportedResources', () => {
    it('should verify all resources are present in stack', async () => {
      // Arrange
      const stackIdentifier = { stackName: 'test-stack', region: 'us-east-1' };
      const resourceLogicalIds = ['FriggVPC', 'FriggPrivateSubnet1', 'FriggLambdaSecurityGroup'];

      const mockStackResources = [
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-123', ResourceType: 'AWS::EC2::VPC' },
        { LogicalResourceId: 'FriggPrivateSubnet1', PhysicalResourceId: 'subnet-456', ResourceType: 'AWS::EC2::Subnet' },
        { LogicalResourceId: 'FriggLambdaSecurityGroup', PhysicalResourceId: 'sg-789', ResourceType: 'AWS::EC2::SecurityGroup' },
      ];

      mockCloudFormationRepository.getStackResources.mockResolvedValue(mockStackResources);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      // Act
      const result = await useCase._verifyImportedResources({
        stackIdentifier,
        resourceLogicalIds,
      });

      // Assert
      expect(result.allVerified).toBe(true);
      expect(result.resources).toHaveLength(3);
      expect(result.resources.every(r => r.verified)).toBe(true);
      expect(result.stackStatus).toBe('UPDATE_COMPLETE');

      expect(mockCloudFormationRepository.getStackResources).toHaveBeenCalledWith(stackIdentifier);
      expect(mockCloudFormationRepository.getStackStatus).toHaveBeenCalledWith(stackIdentifier);
    });

    it('should detect missing resources after import', async () => {
      // Arrange
      const stackIdentifier = { stackName: 'test-stack', region: 'us-east-1' };
      const resourceLogicalIds = ['FriggVPC', 'FriggPrivateSubnet1', 'FriggLambdaSecurityGroup'];

      // Mock stack resources with one missing
      const mockStackResources = [
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-123', ResourceType: 'AWS::EC2::VPC' },
        { LogicalResourceId: 'FriggPrivateSubnet1', PhysicalResourceId: 'subnet-456', ResourceType: 'AWS::EC2::Subnet' },
        // FriggLambdaSecurityGroup is missing
      ];

      mockCloudFormationRepository.getStackResources.mockResolvedValue(mockStackResources);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      // Act
      const result = await useCase._verifyImportedResources({
        stackIdentifier,
        resourceLogicalIds,
      });

      // Assert
      expect(result.allVerified).toBe(false);
      expect(result.resources).toHaveLength(3);

      const verifiedCount = result.resources.filter(r => r.verified).length;
      const unverifiedCount = result.resources.filter(r => !r.verified).length;

      expect(verifiedCount).toBe(2);
      expect(unverifiedCount).toBe(1);

      const missingResource = result.resources.find(r => r.logicalId === 'FriggLambdaSecurityGroup');
      expect(missingResource.verified).toBe(false);
      expect(missingResource.physicalId).toBeUndefined();
    });

    it('should include resource details for verified resources', async () => {
      // Arrange
      const stackIdentifier = { stackName: 'test-stack', region: 'us-east-1' };
      const resourceLogicalIds = ['FriggVPC'];

      const mockStackResources = [
        { LogicalResourceId: 'FriggVPC', PhysicalResourceId: 'vpc-12345678', ResourceType: 'AWS::EC2::VPC' },
      ];

      mockCloudFormationRepository.getStackResources.mockResolvedValue(mockStackResources);
      mockCloudFormationRepository.getStackStatus.mockResolvedValue('UPDATE_COMPLETE');

      // Act
      const result = await useCase._verifyImportedResources({
        stackIdentifier,
        resourceLogicalIds,
      });

      // Assert
      expect(result.resources[0]).toEqual({
        logicalId: 'FriggVPC',
        verified: true,
        physicalId: 'vpc-12345678',
        resourceType: 'AWS::EC2::VPC',
      });
    });
  });
});
