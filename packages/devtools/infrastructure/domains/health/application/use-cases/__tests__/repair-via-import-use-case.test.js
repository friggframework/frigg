/**
 * RepairViaImportUseCase Tests - importWithLogicalIdMapping
 *
 * TDD tests for the application layer use case orchestrating template comparison
 * and logical ID mapping for the `frigg repair --import` command.
 *
 * Application Layer - Use Case Tests
 * Following TDD, DDD, and Hexagonal Architecture principles
 */

const RepairViaImportUseCase = require('../repair-via-import-use-case');
const fs = require('fs');
const path = require('path');

describe('RepairViaImportUseCase - importWithLogicalIdMapping', () => {
  let useCase;
  let mockResourceImporter;
  let mockResourceDetector;
  let mockStackRepository;
  let mockTemplateParser;
  let mockLogicalIdMapper;
  let tempDir;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = path.join(__dirname, 'temp-test-files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Mock dependencies
    mockResourceImporter = {
      validateImport: jest.fn(),
      importResource: jest.fn(),
      importMultipleResources: jest.fn(),
      getImportStatus: jest.fn(),
      generateTemplateSnippet: jest.fn(),
    };

    mockResourceDetector = {
      getResourceDetails: jest.fn(),
    };

    mockStackRepository = {
      getTemplate: jest.fn(),
    };

    mockTemplateParser = {
      parseTemplate: jest.fn(),
    };

    mockLogicalIdMapper = {
      mapOrphanedResourcesToLogicalIds: jest.fn(),
    };

    useCase = new RepairViaImportUseCase({
      resourceImporter: mockResourceImporter,
      resourceDetector: mockResourceDetector,
      stackRepository: mockStackRepository,
      templateParser: mockTemplateParser,
      logicalIdMapper: mockLogicalIdMapper,
    });
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      files.forEach((file) => {
        fs.unlinkSync(path.join(tempDir, file));
      });
      fs.rmdirSync(tempDir);
    }
  });

  describe('importWithLogicalIdMapping', () => {
    it('should throw error if buildTemplatePath not provided', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };
      const orphanedResources = [];

      // Act & Assert
      await expect(
        useCase.importWithLogicalIdMapping({
          stackIdentifier,
          orphanedResources,
          buildTemplatePath: null,
        })
      ).rejects.toThrow('buildTemplatePath is required');
    });

    it('should throw error if build template file does not exist', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };
      const orphanedResources = [];
      const nonExistentPath = '/path/to/nonexistent/template.json';

      // Act & Assert
      await expect(
        useCase.importWithLogicalIdMapping({
          stackIdentifier,
          orphanedResources,
          buildTemplatePath: nonExistentPath,
        })
      ).rejects.toThrow(/Build template not found at/);
    });

    it('should successfully map orphaned resources to logical IDs', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-12345678',
            CidrBlock: '10.0.0.0/16',
            tags: {
              'aws:cloudformation:stack-name': 'acme-integrations-dev',
              'aws:cloudformation:logical-id': 'FriggVPC',
            },
          },
        },
        {
          physicalId: 'subnet-11111111',
          resourceType: 'AWS::EC2::Subnet',
          properties: {
            SubnetId: 'subnet-11111111',
            VpcId: 'vpc-12345678',
            tags: {
              'aws:cloudformation:stack-name': 'acme-integrations-dev',
            },
          },
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
          FriggPrivateSubnet1: { Type: 'AWS::EC2::Subnet' },
        },
      };

      const deployedTemplate = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-11111111'],
              },
            },
          },
        },
      };

      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-11111111',
          resourceType: 'AWS::EC2::Subnet',
          matchMethod: 'vpc-usage',
          confidence: 'high',
        },
      ];

      // Create temporary build template file
      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.mappedCount).toBe(2);
      expect(result.unmappedCount).toBe(0);
      expect(result.mappings).toHaveLength(2);
      expect(result.resourcesToImport).toHaveLength(2);

      // Verify template parser was called
      expect(mockTemplateParser.parseTemplate).toHaveBeenCalledWith(buildTemplatePath);

      // Verify stack repository was called
      expect(mockStackRepository.getTemplate).toHaveBeenCalledWith(stackIdentifier);

      // Verify logical ID mapper was called
      expect(mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds).toHaveBeenCalledWith({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });
    });

    it('should generate correct CloudFormation import format', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-12345678',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: { FriggVPC: { Type: 'AWS::EC2::VPC' } } };
      const deployedTemplate = { resources: {} };

      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
      ];

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.resourcesToImport).toEqual([
        {
          ResourceType: 'AWS::EC2::VPC',
          LogicalResourceId: 'FriggVPC',
          ResourceIdentifier: { VpcId: 'vpc-12345678' },
        },
      ]);
    });

    it('should handle multiple resource types with correct identifiers', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-123',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
        {
          physicalId: 'subnet-456',
          resourceType: 'AWS::EC2::Subnet',
          properties: {
            SubnetId: 'subnet-456',
            VpcId: 'vpc-123',
            tags: {},
          },
        },
        {
          physicalId: 'sg-789',
          resourceType: 'AWS::EC2::SecurityGroup',
          properties: {
            GroupId: 'sg-789',
            VpcId: 'vpc-123',
            tags: {},
          },
        },
        {
          physicalId: 'igw-abc',
          resourceType: 'AWS::EC2::InternetGateway',
          properties: {
            InternetGatewayId: 'igw-abc',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-456',
          resourceType: 'AWS::EC2::Subnet',
          matchMethod: 'vpc-usage',
          confidence: 'high',
        },
        {
          logicalId: 'FriggLambdaSecurityGroup',
          physicalId: 'sg-789',
          resourceType: 'AWS::EC2::SecurityGroup',
          matchMethod: 'usage',
          confidence: 'medium',
        },
        {
          logicalId: 'FriggInternetGateway',
          physicalId: 'igw-abc',
          resourceType: 'AWS::EC2::InternetGateway',
          matchMethod: 'tag',
          confidence: 'high',
        },
      ];

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.resourcesToImport).toEqual([
        {
          ResourceType: 'AWS::EC2::VPC',
          LogicalResourceId: 'FriggVPC',
          ResourceIdentifier: { VpcId: 'vpc-123' },
        },
        {
          ResourceType: 'AWS::EC2::Subnet',
          LogicalResourceId: 'FriggPrivateSubnet1',
          ResourceIdentifier: { SubnetId: 'subnet-456' },
        },
        {
          ResourceType: 'AWS::EC2::SecurityGroup',
          LogicalResourceId: 'FriggLambdaSecurityGroup',
          ResourceIdentifier: { GroupId: 'sg-789' },
        },
        {
          ResourceType: 'AWS::EC2::InternetGateway',
          LogicalResourceId: 'FriggInternetGateway',
          ResourceIdentifier: { InternetGatewayId: 'igw-abc' },
        },
      ]);
    });

    it('should separate mapped and unmapped resources', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-123',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
        {
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-456',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        }, // No match
        {
          physicalId: 'subnet-789',
          resourceType: 'AWS::EC2::Subnet',
          properties: {
            SubnetId: 'subnet-789',
            VpcId: 'vpc-123',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: null, // Unmapped
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'none',
          confidence: 'none',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-789',
          resourceType: 'AWS::EC2::Subnet',
          matchMethod: 'vpc-usage',
          confidence: 'high',
        },
      ];

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.mappedCount).toBe(2);
      expect(result.unmappedCount).toBe(1);
      expect(result.mappings).toHaveLength(2);
      expect(result.unmappedResources).toHaveLength(1);
      expect(result.unmappedResources[0].physicalId).toBe('vpc-456');
    });

    it('should return failure if no resources could be mapped', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-123',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
        {
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-456',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      // All resources unmapped
      const mappings = [
        {
          logicalId: null,
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'none',
          confidence: 'none',
        },
        {
          logicalId: null,
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'none',
          confidence: 'none',
        },
      ];

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.message).toBe('No resources could be mapped to logical IDs');
      expect(result.unmappedCount).toBe(2);
    });

    it('should generate warnings for multiple resources of same type', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-123',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
        {
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-456',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
        {
          physicalId: 'vpc-789',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-789',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      // Three VPCs mapped
      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggVPC2',
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'contained-resources',
          confidence: 'high',
        },
        {
          logicalId: 'FriggVPC3',
          physicalId: 'vpc-789',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
      ];

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('MULTIPLE_RESOURCES');
      expect(result.warnings[0].resourceType).toBe('AWS::EC2::VPC');
      expect(result.warnings[0].count).toBe(3);
      expect(result.warnings[0].message).toContain('Multiple VPCs detected (3)');
      expect(result.warnings[0].resources).toHaveLength(3);
    });

    it('should include build and deployed template paths in result', async () => {
      // Arrange
      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const orphanedResources = [
        {
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-123',
            CidrBlock: '10.0.0.0/16',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: { FriggVPC: { Type: 'AWS::EC2::VPC' } } };
      const deployedTemplate = { resources: {} };

      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
      ];

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify(buildTemplate));

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(deployedTemplate);
      mockLogicalIdMapper.mapOrphanedResourcesToLogicalIds.mockResolvedValue(mappings);

      // Act
      const result = await useCase.importWithLogicalIdMapping({
        stackIdentifier,
        orphanedResources,
        buildTemplatePath,
      });

      // Assert
      expect(result.buildTemplatePath).toBe(buildTemplatePath);
      expect(result.deployedTemplatePath).toBe('CloudFormation (deployed)');
    });

    it('should throw error if stackRepository not provided', async () => {
      // Arrange
      const useCaseWithoutStackRepo = new RepairViaImportUseCase({
        resourceImporter: mockResourceImporter,
        resourceDetector: mockResourceDetector,
        // stackRepository: NOT PROVIDED
        templateParser: mockTemplateParser,
        logicalIdMapper: mockLogicalIdMapper,
      });

      const stackIdentifier = {
        stackName: 'acme-integrations-dev',
        region: 'us-east-1',
      };

      const buildTemplatePath = path.join(tempDir, 'build-template.json');
      fs.writeFileSync(buildTemplatePath, JSON.stringify({ resources: {} }));

      mockTemplateParser.parseTemplate.mockReturnValue({ resources: {} });

      // Act & Assert
      await expect(
        useCaseWithoutStackRepo.importWithLogicalIdMapping({
          stackIdentifier,
          orphanedResources: [],
          buildTemplatePath,
        })
      ).rejects.toThrow('stackRepository is required for template comparison');
    });
  });

  describe('_getResourceIdentifier', () => {
    it('should return correct identifier for VPC', () => {
      // Arrange
      const mapping = {
        physicalId: 'vpc-123',
        resourceType: 'AWS::EC2::VPC',
      };

      // Act
      const result = useCase._getResourceIdentifier(mapping);

      // Assert
      expect(result).toEqual({ VpcId: 'vpc-123' });
    });

    it('should return correct identifier for Subnet', () => {
      // Arrange
      const mapping = {
        physicalId: 'subnet-456',
        resourceType: 'AWS::EC2::Subnet',
      };

      // Act
      const result = useCase._getResourceIdentifier(mapping);

      // Assert
      expect(result).toEqual({ SubnetId: 'subnet-456' });
    });

    it('should return correct identifier for SecurityGroup', () => {
      // Arrange
      const mapping = {
        physicalId: 'sg-789',
        resourceType: 'AWS::EC2::SecurityGroup',
      };

      // Act
      const result = useCase._getResourceIdentifier(mapping);

      // Assert
      expect(result).toEqual({ GroupId: 'sg-789' });
    });

    it('should return generic identifier for unknown resource type', () => {
      // Arrange
      const mapping = {
        physicalId: 'unknown-123',
        resourceType: 'AWS::Unknown::Type',
      };

      // Act
      const result = useCase._getResourceIdentifier(mapping);

      // Assert
      expect(result).toEqual({ Id: 'unknown-123' });
    });
  });

  describe('_checkForMultipleResources', () => {
    it('should return no warnings for single resource per type', () => {
      // Arrange
      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-456',
          resourceType: 'AWS::EC2::Subnet',
        },
      ];

      // Act
      const warnings = useCase._checkForMultipleResources(mappings);

      // Assert
      expect(warnings).toHaveLength(0);
    });

    it('should return warning for multiple resources of same type', () => {
      // Arrange
      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggVPC2',
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'contained-resources',
          confidence: 'high',
        },
      ];

      // Act
      const warnings = useCase._checkForMultipleResources(mappings);

      // Assert
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe('MULTIPLE_RESOURCES');
      expect(warnings[0].resourceType).toBe('AWS::EC2::VPC');
      expect(warnings[0].count).toBe(2);
      expect(warnings[0].resources).toHaveLength(2);
    });

    it('should return multiple warnings for different resource types with multiples', () => {
      // Arrange
      const mappings = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggVPC2',
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-111',
          resourceType: 'AWS::EC2::Subnet',
          matchMethod: 'vpc-usage',
          confidence: 'high',
        },
        {
          logicalId: 'FriggPrivateSubnet2',
          physicalId: 'subnet-222',
          resourceType: 'AWS::EC2::Subnet',
          matchMethod: 'vpc-usage',
          confidence: 'high',
        },
      ];

      // Act
      const warnings = useCase._checkForMultipleResources(mappings);

      // Assert
      expect(warnings).toHaveLength(2);
      expect(warnings[0].resourceType).toBe('AWS::EC2::VPC');
      expect(warnings[0].count).toBe(2);
      expect(warnings[1].resourceType).toBe('AWS::EC2::Subnet');
      expect(warnings[1].count).toBe(2);
    });
  });

  describe('_deduplicateResourcesByLogicalId', () => {
    it('should select ONE resource per logical ID when multiple map to same ID', () => {
      // Arrange: 3 VPCs all tagged with "FriggVPC", but only vpc-123 is in deployed template
      const mappedResources = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-456',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-789',
          resourceType: 'AWS::EC2::VPC',
          matchMethod: 'tag',
          confidence: 'high',
        },
      ];

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-in-vpc-123'], // This subnet belongs to vpc-123
                SecurityGroupIds: [],
              },
            },
          },
        },
      };

      // Act
      const result = useCase._deduplicateResourcesByLogicalId(
        mappedResources,
        deployedTemplate
      );

      // Assert: Should select ONLY the VPC that's actually referenced
      expect(result.selectedResources).toHaveLength(1);
      expect(result.selectedResources[0].physicalId).toBe('vpc-123');
      expect(result.selectedResources[0].logicalId).toBe('FriggVPC');

      // The other 2 VPCs should be marked as duplicates
      expect(result.duplicates).toHaveLength(2);
      expect(result.duplicates.map((d) => d.physicalId)).toEqual(
        expect.arrayContaining(['vpc-456', 'vpc-789'])
      );
    });

    it('should keep all resources when they have unique logical IDs', () => {
      // Arrange: Different logical IDs, no duplication
      const mappedResources = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-123',
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-456',
          resourceType: 'AWS::EC2::Subnet',
        },
        {
          logicalId: 'FriggLambdaSecurityGroup',
          physicalId: 'sg-789',
          resourceType: 'AWS::EC2::SecurityGroup',
        },
      ];

      const deployedTemplate = { resources: {} };

      // Act
      const result = useCase._deduplicateResourcesByLogicalId(
        mappedResources,
        deployedTemplate
      );

      // Assert: All 3 resources should be selected
      expect(result.selectedResources).toHaveLength(3);
      expect(result.duplicates).toHaveLength(0);
    });

    it('should use deployed template references to select correct resource', () => {
      // Arrange: 5 subnets with same logical ID, need to pick the ones in deployed template
      const mappedResources = [
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-111',
          resourceType: 'AWS::EC2::Subnet',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-222', // THIS ONE is in deployed template
          resourceType: 'AWS::EC2::Subnet',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-333',
          resourceType: 'AWS::EC2::Subnet',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-444',
          resourceType: 'AWS::EC2::Subnet',
        },
        {
          logicalId: 'FriggPrivateSubnet1',
          physicalId: 'subnet-555',
          resourceType: 'AWS::EC2::Subnet',
        },
      ];

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-222', 'subnet-other'], // subnet-222 is THE correct one
                SecurityGroupIds: [],
              },
            },
          },
        },
      };

      // Act
      const result = useCase._deduplicateResourcesByLogicalId(
        mappedResources,
        deployedTemplate
      );

      // Assert: Should select subnet-222 because it's in deployed template
      expect(result.selectedResources).toHaveLength(1);
      expect(result.selectedResources[0].physicalId).toBe('subnet-222');

      // Other 4 subnets should be duplicates
      expect(result.duplicates).toHaveLength(4);
    });

    it('should handle multiple logical IDs with duplicates', () => {
      // Arrange: 3 VPCs + 2 SecurityGroups, all duplicates
      // Note: VPC selection falls back to first when no direct reference exists
      const mappedResources = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-111', // Will be selected (fallback to first)
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-222',
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-333',
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggLambdaSecurityGroup',
          physicalId: 'sg-aaa', // Will be selected (in deployed template)
          resourceType: 'AWS::EC2::SecurityGroup',
        },
        {
          logicalId: 'FriggLambdaSecurityGroup',
          physicalId: 'sg-bbb',
          resourceType: 'AWS::EC2::SecurityGroup',
        },
      ];

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-xxx'], // Not matching any VPC
                SecurityGroupIds: ['sg-aaa'], // sg-aaa is the correct one
              },
            },
          },
        },
      };

      // Act
      const result = useCase._deduplicateResourcesByLogicalId(
        mappedResources,
        deployedTemplate
      );

      // Assert: Should select ONE of each logical ID
      expect(result.selectedResources).toHaveLength(2);
      expect(result.selectedResources.map((r) => r.physicalId)).toEqual(
        expect.arrayContaining(['vpc-111', 'sg-aaa']) // VPC fallback + SG match
      );

      // 3 resources should be duplicates (2 VPCs + 1 SG)
      expect(result.duplicates).toHaveLength(3);
    });

    it('should fall back to first resource if none match deployed template', () => {
      // Arrange: Multiple resources but none are in deployed template
      const mappedResources = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-111',
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-222',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-other'], // Different VPC
                SecurityGroupIds: [],
              },
            },
          },
        },
      };

      // Act
      const result = useCase._deduplicateResourcesByLogicalId(
        mappedResources,
        deployedTemplate
      );

      // Assert: Should pick first one as fallback
      expect(result.selectedResources).toHaveLength(1);
      expect(result.selectedResources[0].physicalId).toBe('vpc-111');
      expect(result.duplicates).toHaveLength(1);
    });
  });
});
