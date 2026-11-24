/**
 * ImportTemplateGenerator Tests
 *
 * TDD tests for CloudFormation import template generation
 * Domain Layer - Service Tests
 *
 * Responsibilities:
 * - Generate CloudFormation template for import operation
 * - Resolve template intrinsics (!Ref, !Sub, !GetAtt) with actual AWS values
 * - Validate template matches current resource state
 * - Merge resource definitions with existing template
 */

const { ImportTemplateGenerator } = require('../import-template-generator');

describe('ImportTemplateGenerator', () => {
  let generator;
  let mockTemplateParser;
  let mockResourceDetector;
  let mockStackRepository;

  beforeEach(() => {
    // Mock template parser
    mockTemplateParser = {
      parseTemplate: jest.fn(),
    };

    // Mock resource detector (AWS state)
    mockResourceDetector = {
      getResourceDetails: jest.fn(),
    };

    // Mock stack repository (CloudFormation)
    mockStackRepository = {
      getTemplate: jest.fn(),
    };

    generator = new ImportTemplateGenerator({
      templateParser: mockTemplateParser,
      resourceDetector: mockResourceDetector,
      stackRepository: mockStackRepository,
    });
  });

  describe('generateImportTemplate', () => {
    const stackIdentifier = {
      stackName: 'test-stack',
      region: 'us-east-1',
    };

    it('should generate template with resolved !Ref VpcCidr intrinsic', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
              CidrBlock: { Ref: 'VpcCidr' }, // !Ref intrinsic
              EnableDnsHostnames: true,
              EnableDnsSupport: true,
            },
          },
        },
      };

      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
          CidrBlock: '10.0.0.0/16', // Actual AWS value
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails.mockResolvedValue(awsResourceDetails);

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.template.Resources.FriggVPC.Properties.CidrBlock).toBe('10.0.0.0/16');
      expect(result.template.Resources.FriggVPC.Properties.EnableDnsHostnames).toBe(true);
      expect(result.resourceIdentifiers).toHaveLength(1);
      expect(result.resourceIdentifiers[0]).toEqual({
        ResourceType: 'AWS::EC2::VPC',
        LogicalResourceId: 'FriggVPC',
        ResourceIdentifier: { VpcId: 'vpc-12345678' },
      });
    });

    it('should generate template with resolved !Sub ${AWS::StackName} intrinsic', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
              CidrBlock: '10.0.0.0/16',
              Tags: [
                {
                  Key: 'Name',
                  Value: { 'Fn::Sub': '${AWS::StackName}-vpc' }, // !Sub intrinsic
                },
              ],
            },
          },
        },
      };

      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
          CidrBlock: '10.0.0.0/16',
          Tags: [
            { Key: 'Name', Value: 'test-stack-vpc' },
          ],
        },
        stackName: 'test-stack', // Used for !Sub resolution
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails.mockResolvedValue(awsResourceDetails);

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.template.Resources.FriggVPC.Properties.Tags[0].Value).toBe(
        'test-stack-vpc'
      );
    });

    it('should generate template with resolved !GetAtt intrinsic', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggPublicSubnet',
          physicalId: 'subnet-public-123',
          resourceType: 'AWS::EC2::Subnet',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggPublicSubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
              VpcId: { 'Fn::GetAtt': ['FriggVPC', 'VpcId'] }, // !GetAtt intrinsic
              CidrBlock: '10.0.1.0/24',
              AvailabilityZone: { 'Fn::GetAtt': ['FriggVPC', 'AvailabilityZone'] },
            },
          },
        },
      };

      const awsResourceDetails = {
        properties: {
          SubnetId: 'subnet-public-123',
          VpcId: 'vpc-12345678', // Actual VPC ID from AWS
          CidrBlock: '10.0.1.0/24',
          AvailabilityZone: 'us-east-1a', // Actual AZ from AWS
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails.mockResolvedValue(awsResourceDetails);

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.template.Resources.FriggPublicSubnet.Properties.VpcId).toBe(
        'vpc-12345678'
      );
      expect(result.template.Resources.FriggPublicSubnet.Properties.AvailabilityZone).toBe(
        'us-east-1a'
      );
    });

    it('should resolve nested !Ref in array properties', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggLambdaSecurityGroup',
          physicalId: 'sg-07c01370e830b6ad6',
          resourceType: 'AWS::EC2::SecurityGroup',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggLambdaSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
              GroupDescription: 'Lambda security group',
              VpcId: { Ref: 'FriggVPC' }, // !Ref intrinsic
              SecurityGroupIngress: [
                {
                  IpProtocol: 'tcp',
                  FromPort: 443,
                  ToPort: 443,
                  SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                },
              ],
            },
          },
        },
      };

      const awsResourceDetails = {
        properties: {
          GroupId: 'sg-07c01370e830b6ad6',
          VpcId: 'vpc-12345678',
          GroupDescription: 'Lambda security group',
          SecurityGroupIngress: [
            {
              IpProtocol: 'tcp',
              FromPort: 443,
              ToPort: 443,
              SourceSecurityGroupId: 'sg-07c01370e830b6ad6',
            },
          ],
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails.mockResolvedValue(awsResourceDetails);

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.template.Resources.FriggLambdaSecurityGroup.Properties.VpcId).toBe(
        'vpc-12345678'
      );
      expect(
        result.template.Resources.FriggLambdaSecurityGroup.Properties.SecurityGroupIngress[0]
          .SourceSecurityGroupId
      ).toBe('sg-07c01370e830b6ad6');
    });

    it('should merge resource definitions with existing CloudFormation template', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
              CidrBlock: '10.0.0.0/16',
            },
          },
        },
      };

      // Existing template already has other resources
      const currentTemplate = {
        Resources: {
          MyLambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              FunctionName: 'my-function',
              Runtime: 'nodejs18.x',
            },
          },
          MyDynamoDBTable: {
            Type: 'AWS::DynamoDB::Table',
            Properties: {
              TableName: 'my-table',
            },
          },
        },
      };

      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
          CidrBlock: '10.0.0.0/16',
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue(currentTemplate);
      mockResourceDetector.getResourceDetails.mockResolvedValue(awsResourceDetails);

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.template.Resources.FriggVPC).toBeDefined();
      expect(result.template.Resources.MyLambdaFunction).toBeDefined();
      expect(result.template.Resources.MyDynamoDBTable).toBeDefined();
      expect(Object.keys(result.template.Resources)).toHaveLength(3);
    });

    it('should throw error if logical ID not found in build template', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'NonExistentResource',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
              CidrBlock: '10.0.0.0/16',
            },
          },
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });

      // Act & Assert
      await expect(
        generator.generateImportTemplate({
          resourcesToImport,
          buildTemplatePath: '/path/to/build-template.json',
          stackIdentifier,
        })
      ).rejects.toThrow(
        'Logical ID NonExistentResource not found in build template. Cannot generate import definition without template reference.'
      );
    });

    it('should throw error if build template file does not exist', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      mockTemplateParser.parseTemplate.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      // Act & Assert
      await expect(
        generator.generateImportTemplate({
          resourcesToImport,
          buildTemplatePath: '/path/to/nonexistent-template.json',
          stackIdentifier,
        })
      ).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should generate correct resource identifiers for VPC, Subnet, SecurityGroup', async () => {
      // Arrange
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
          physicalId: 'sg-07c01370e830b6ad6',
          resourceType: 'AWS::EC2::SecurityGroup',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: { CidrBlock: '10.0.0.0/16' },
          },
          FriggPrivateSubnet1: {
            Type: 'AWS::EC2::Subnet',
            Properties: { CidrBlock: '10.0.1.0/24', VpcId: { Ref: 'FriggVPC' } },
          },
          FriggLambdaSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: { GroupDescription: 'Lambda SG', VpcId: { Ref: 'FriggVPC' } },
          },
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails
        .mockResolvedValueOnce({
          properties: { VpcId: 'vpc-12345678', CidrBlock: '10.0.0.0/16' },
        })
        .mockResolvedValueOnce({
          properties: {
            SubnetId: 'subnet-11111111',
            CidrBlock: '10.0.1.0/24',
            VpcId: 'vpc-12345678',
          },
        })
        .mockResolvedValueOnce({
          properties: {
            GroupId: 'sg-07c01370e830b6ad6',
            GroupDescription: 'Lambda SG',
            VpcId: 'vpc-12345678',
          },
        });

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.resourceIdentifiers).toHaveLength(3);
      expect(result.resourceIdentifiers[0]).toEqual({
        ResourceType: 'AWS::EC2::VPC',
        LogicalResourceId: 'FriggVPC',
        ResourceIdentifier: { VpcId: 'vpc-12345678' },
      });
      expect(result.resourceIdentifiers[1]).toEqual({
        ResourceType: 'AWS::EC2::Subnet',
        LogicalResourceId: 'FriggPrivateSubnet1',
        ResourceIdentifier: { SubnetId: 'subnet-11111111' },
      });
      expect(result.resourceIdentifiers[2]).toEqual({
        ResourceType: 'AWS::EC2::SecurityGroup',
        LogicalResourceId: 'FriggLambdaSecurityGroup',
        ResourceIdentifier: { Id: 'sg-07c01370e830b6ad6' },
      });
    });

    it('should generate correct resource identifier for InternetGateway', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggInternetGateway',
          physicalId: 'igw-0abc123def456',
          resourceType: 'AWS::EC2::InternetGateway',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggInternetGateway: {
            Type: 'AWS::EC2::InternetGateway',
            Properties: {
              Tags: [{ Key: 'Name', Value: 'Frigg IGW' }],
            },
          },
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails.mockResolvedValue({
        properties: {
          InternetGatewayId: 'igw-0abc123def456',
          Tags: [{ Key: 'Name', Value: 'Frigg IGW' }],
        },
      });

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.resourceIdentifiers[0]).toEqual({
        ResourceType: 'AWS::EC2::InternetGateway',
        LogicalResourceId: 'FriggInternetGateway',
        ResourceIdentifier: { InternetGatewayId: 'igw-0abc123def456' },
      });
    });

    it('should handle empty current template when stack does not exist yet', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: { CidrBlock: '10.0.0.0/16' },
          },
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      // Stack doesn't exist yet
      mockStackRepository.getTemplate.mockRejectedValue(new Error('Stack does not exist'));
      mockResourceDetector.getResourceDetails.mockResolvedValue({
        properties: { VpcId: 'vpc-12345678', CidrBlock: '10.0.0.0/16' },
      });

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.template.Resources.FriggVPC).toBeDefined();
      expect(Object.keys(result.template.Resources)).toHaveLength(1);
    });

    it('should resolve complex nested intrinsics', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggPublicSubnet',
          physicalId: 'subnet-public-123',
          resourceType: 'AWS::EC2::Subnet',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggPublicSubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
              VpcId: { Ref: 'FriggVPC' },
              CidrBlock: '10.0.1.0/24',
              Tags: [
                {
                  Key: 'Name',
                  Value: { 'Fn::Sub': '${AWS::StackName}-public-subnet' },
                },
                {
                  Key: 'Type',
                  Value: 'public',
                },
                {
                  Key: 'VpcCidr',
                  Value: { 'Fn::GetAtt': ['FriggVPC', 'CidrBlock'] },
                },
              ],
            },
          },
        },
      };

      const awsResourceDetails = {
        properties: {
          SubnetId: 'subnet-public-123',
          VpcId: 'vpc-12345678',
          CidrBlock: '10.0.1.0/24',
          Tags: [
            { Key: 'Name', Value: 'test-stack-public-subnet' },
            { Key: 'Type', Value: 'public' },
            { Key: 'VpcCidr', Value: '10.0.0.0/16' },
          ],
        },
        stackName: 'test-stack',
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails.mockResolvedValue(awsResourceDetails);

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      const tags = result.template.Resources.FriggPublicSubnet.Properties.Tags;
      expect(tags[0].Value).toBe('test-stack-public-subnet');
      expect(tags[1].Value).toBe('public');
      expect(tags[2].Value).toBe('10.0.0.0/16');
    });

    it('should handle multiple resources with different resource types', async () => {
      // Arrange
      const resourcesToImport = [
        {
          logicalId: 'FriggVPC',
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
        },
        {
          logicalId: 'FriggRouteTable',
          physicalId: 'rtb-0123456789',
          resourceType: 'AWS::EC2::RouteTable',
        },
        {
          logicalId: 'FriggVPCEndpoint',
          physicalId: 'vpce-0987654321',
          resourceType: 'AWS::EC2::VPCEndpoint',
        },
      ];

      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: { CidrBlock: '10.0.0.0/16' },
          },
          FriggRouteTable: {
            Type: 'AWS::EC2::RouteTable',
            Properties: { VpcId: { Ref: 'FriggVPC' } },
          },
          FriggVPCEndpoint: {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: { VpcId: { Ref: 'FriggVPC' }, ServiceName: 's3' },
          },
        },
      };

      mockTemplateParser.parseTemplate.mockReturnValue(buildTemplate);
      mockStackRepository.getTemplate.mockResolvedValue({ Resources: {} });
      mockResourceDetector.getResourceDetails
        .mockResolvedValueOnce({
          properties: { VpcId: 'vpc-12345678', CidrBlock: '10.0.0.0/16' },
        })
        .mockResolvedValueOnce({
          properties: { RouteTableId: 'rtb-0123456789', VpcId: 'vpc-12345678' },
        })
        .mockResolvedValueOnce({
          properties: {
            VpcEndpointId: 'vpce-0987654321',
            VpcId: 'vpc-12345678',
            ServiceName: 's3',
          },
        });

      // Act
      const result = await generator.generateImportTemplate({
        resourcesToImport,
        buildTemplatePath: '/path/to/build-template.json',
        stackIdentifier,
      });

      // Assert
      expect(result.resourceIdentifiers).toHaveLength(3);
      expect(result.resourceIdentifiers[0].ResourceIdentifier).toEqual({
        VpcId: 'vpc-12345678',
      });
      expect(result.resourceIdentifiers[1].ResourceIdentifier).toEqual({
        RouteTableId: 'rtb-0123456789',
      });
      expect(result.resourceIdentifiers[2].ResourceIdentifier).toEqual({
        VpcEndpointId: 'vpce-0987654321',
      });
    });
  });

  describe('_getResourceIdentifier', () => {
    it('should return correct identifier for VPC', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::VPC', 'vpc-123');

      // Assert
      expect(result).toEqual({ VpcId: 'vpc-123' });
    });

    it('should return correct identifier for Subnet', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::Subnet', 'subnet-456');

      // Assert
      expect(result).toEqual({ SubnetId: 'subnet-456' });
    });

    it('should return correct identifier for SecurityGroup', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::SecurityGroup', 'sg-789');

      // Assert
      expect(result).toEqual({ Id: 'sg-789' });
    });

    it('should return correct identifier for InternetGateway', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::InternetGateway', 'igw-abc');

      // Assert
      expect(result).toEqual({ InternetGatewayId: 'igw-abc' });
    });

    it('should return correct identifier for NatGateway', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::NatGateway', 'nat-def');

      // Assert
      expect(result).toEqual({ NatGatewayId: 'nat-def' });
    });

    it('should return correct identifier for RouteTable', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::RouteTable', 'rtb-ghi');

      // Assert
      expect(result).toEqual({ RouteTableId: 'rtb-ghi' });
    });

    it('should return correct identifier for VPCEndpoint', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::EC2::VPCEndpoint', 'vpce-jkl');

      // Assert
      expect(result).toEqual({ VpcEndpointId: 'vpce-jkl' });
    });

    it('should return generic identifier for unknown resource type', () => {
      // Act
      const result = generator._getResourceIdentifier('AWS::Unknown::Type', 'unknown-123');

      // Assert
      expect(result).toEqual({ Id: 'unknown-123' });
    });
  });

  describe('_resolveRef', () => {
    it('should resolve VpcCidr to actual CIDR block', () => {
      // Arrange
      const awsResourceDetails = {
        properties: {
          CidrBlock: '10.0.0.0/16',
        },
      };

      // Act
      const result = generator._resolveRef('VpcCidr', awsResourceDetails, 'AWS::EC2::VPC');

      // Assert
      expect(result).toBe('10.0.0.0/16');
    });

    it('should resolve VpcId to actual VPC ID', () => {
      // Arrange
      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
        },
      };

      // Act
      const result = generator._resolveRef('VpcId', awsResourceDetails, 'AWS::EC2::Subnet');

      // Assert
      expect(result).toBe('vpc-12345678');
    });

    it('should return property value from AWS details for unmapped refs', () => {
      // Arrange
      const awsResourceDetails = {
        properties: {
          CustomProperty: 'custom-value',
        },
      };

      // Act
      const result = generator._resolveRef(
        'CustomProperty',
        awsResourceDetails,
        'AWS::Custom::Type'
      );

      // Assert
      expect(result).toBe('custom-value');
    });

    it('should return ref name if not found in properties', () => {
      // Arrange
      const awsResourceDetails = {
        properties: {},
      };

      // Act
      const result = generator._resolveRef('UnknownRef', awsResourceDetails, 'AWS::EC2::VPC');

      // Assert
      expect(result).toBe('UnknownRef');
    });
  });

  describe('_resolveSub', () => {
    it('should resolve ${AWS::StackName} to actual stack name', () => {
      // Arrange
      const awsResourceDetails = {
        stackName: 'test-stack',
      };

      // Act
      const result = generator._resolveSub('${AWS::StackName}-vpc', awsResourceDetails);

      // Assert
      expect(result).toBe('test-stack-vpc');
    });

    it('should resolve multiple ${AWS::StackName} occurrences', () => {
      // Arrange
      const awsResourceDetails = {
        stackName: 'my-stack',
      };

      // Act
      const result = generator._resolveSub(
        '${AWS::StackName}-${AWS::StackName}-resource',
        awsResourceDetails
      );

      // Assert
      expect(result).toBe('my-stack-my-stack-resource');
    });

    it('should resolve tag variables from AWS resource tags', () => {
      // Arrange
      const awsResourceDetails = {
        stackName: 'my-stack',
        tags: {
          Environment: 'production',
          Team: 'platform',
        },
      };

      // Act
      const result = generator._resolveSub(
        '${AWS::StackName}-${Environment}-${Team}',
        awsResourceDetails
      );

      // Assert
      expect(result).toBe('my-stack-production-platform');
    });

    it('should return empty string if stack name missing', () => {
      // Arrange
      const awsResourceDetails = {};

      // Act
      const result = generator._resolveSub('${AWS::StackName}-vpc', awsResourceDetails);

      // Assert
      expect(result).toBe('-vpc');
    });

    it('should return non-string values as-is', () => {
      // Arrange
      const awsResourceDetails = {};

      // Act
      const result = generator._resolveSub({ some: 'object' }, awsResourceDetails);

      // Assert
      expect(result).toEqual({ some: 'object' });
    });
  });

  describe('_resolveGetAtt', () => {
    it('should resolve attribute from AWS resource properties', () => {
      // Arrange
      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
          CidrBlock: '10.0.0.0/16',
        },
      };

      // Act
      const result = generator._resolveGetAtt(['FriggVPC', 'VpcId'], awsResourceDetails);

      // Assert
      expect(result).toBe('vpc-12345678');
    });

    it('should return null if attribute not found', () => {
      // Arrange
      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
        },
      };

      // Act
      const result = generator._resolveGetAtt(['FriggVPC', 'NonExistentAttribute'], awsResourceDetails);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('_resolveValue', () => {
    it('should resolve literal values unchanged', () => {
      // Arrange
      const awsResourceDetails = { properties: {} };

      // Act
      const result = generator._resolveValue('literal-value', awsResourceDetails, 'AWS::EC2::VPC');

      // Assert
      expect(result).toBe('literal-value');
    });

    it('should resolve nested object with intrinsics', () => {
      // Arrange
      const value = {
        VpcId: { Ref: 'FriggVPC' },
        CidrBlock: '10.0.1.0/24',
      };
      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
        },
      };

      // Act
      const result = generator._resolveValue(value, awsResourceDetails, 'AWS::EC2::Subnet');

      // Assert
      expect(result.VpcId).toBe('vpc-12345678');
      expect(result.CidrBlock).toBe('10.0.1.0/24');
    });

    it('should resolve array of values with intrinsics', () => {
      // Arrange
      const value = [
        { Ref: 'Subnet1' },
        { Ref: 'Subnet2' },
        'literal-subnet-id',
      ];
      const awsResourceDetails = {
        properties: {
          Subnet1: 'subnet-111',
          Subnet2: 'subnet-222',
        },
      };

      // Act
      const result = generator._resolveValue(value, awsResourceDetails, 'AWS::Lambda::Function');

      // Assert
      expect(result).toEqual(['subnet-111', 'subnet-222', 'literal-subnet-id']);
    });
  });

  describe('_generateResourceDefinition', () => {
    it('should throw error if logical ID not in build template', () => {
      // Arrange
      const buildTemplate = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
        },
      };
      const awsResourceDetails = {
        properties: { VpcId: 'vpc-123' },
      };

      // Act & Assert
      expect(() => {
        generator._generateResourceDefinition({
          logicalId: 'NonExistentResource',
          resourceType: 'AWS::EC2::VPC',
          physicalId: 'vpc-123',
          buildTemplate,
          awsResourceDetails,
        });
      }).toThrow(
        'Logical ID NonExistentResource not found in build template. Cannot generate import definition without template reference.'
      );
    });

    it('should generate resource definition with resolved properties', () => {
      // Arrange
      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: {
              CidrBlock: { Ref: 'VpcCidr' },
              EnableDnsHostnames: true,
            },
          },
        },
      };
      const awsResourceDetails = {
        properties: {
          VpcId: 'vpc-12345678',
          CidrBlock: '10.0.0.0/16',
        },
      };

      // Act
      const result = generator._generateResourceDefinition({
        logicalId: 'FriggVPC',
        resourceType: 'AWS::EC2::VPC',
        physicalId: 'vpc-12345678',
        buildTemplate,
        awsResourceDetails,
      });

      // Assert
      expect(result.Type).toBe('AWS::EC2::VPC');
      expect(result.Properties.CidrBlock).toBe('10.0.0.0/16');
      expect(result.Properties.EnableDnsHostnames).toBe(true);
    });
  });

  describe('Resource Protection Policies', () => {
    it('should add DeletionPolicy: Retain to all imported resources', () => {
      // Arrange
      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: { CidrBlock: '10.0.0.0/16' },
          },
        },
      };
      const awsResourceDetails = {
        properties: { VpcId: 'vpc-123', CidrBlock: '10.0.0.0/16' },
      };

      // Act
      const result = generator._generateResourceDefinition({
        logicalId: 'FriggVPC',
        resourceType: 'AWS::EC2::VPC',
        physicalId: 'vpc-123',
        buildTemplate,
        awsResourceDetails,
      });

      // Assert
      expect(result.DeletionPolicy).toBe('Retain');
    });

    it('should add UpdateReplacePolicy: Retain to all imported resources', () => {
      // Arrange
      const buildTemplate = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: { CidrBlock: '10.0.0.0/16' },
          },
        },
      };
      const awsResourceDetails = {
        properties: { VpcId: 'vpc-123', CidrBlock: '10.0.0.0/16' },
      };

      // Act
      const result = generator._generateResourceDefinition({
        logicalId: 'FriggVPC',
        resourceType: 'AWS::EC2::VPC',
        physicalId: 'vpc-123',
        buildTemplate,
        awsResourceDetails,
      });

      // Assert
      expect(result.UpdateReplacePolicy).toBe('Retain');
    });

    it('should protect resources from deletion during stack updates', () => {
      // Arrange
      const buildTemplate = {
        resources: {
          FriggLambdaSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: { GroupDescription: 'Lambda SG' },
          },
        },
      };
      const awsResourceDetails = {
        properties: { GroupId: 'sg-123', GroupDescription: 'Lambda SG' },
      };

      // Act
      const result = generator._generateResourceDefinition({
        logicalId: 'FriggLambdaSecurityGroup',
        resourceType: 'AWS::EC2::SecurityGroup',
        physicalId: 'sg-123',
        buildTemplate,
        awsResourceDetails,
      });

      // Assert: Both policies protect resources
      expect(result.DeletionPolicy).toBe('Retain');
      expect(result.UpdateReplacePolicy).toBe('Retain');
      // This prevents:
      // - Stack deletion from destroying the physical resource (DeletionPolicy)
      // - Stack update replacement from destroying the old physical resource (UpdateReplacePolicy)
    });
  });
});
