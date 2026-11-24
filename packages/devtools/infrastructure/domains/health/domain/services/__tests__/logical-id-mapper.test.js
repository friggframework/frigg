/**
 * LogicalIdMapper Tests
 *
 * TDD tests for logical ID mapping functionality
 * Domain Layer - Service Tests
 */

const { LogicalIdMapper } = require('../logical-id-mapper');

describe('LogicalIdMapper', () => {
  let mapper;
  let mockEc2Client;

  beforeEach(() => {
    // Mock EC2 client
    mockEc2Client = {
      send: jest.fn(),
    };

    mapper = new LogicalIdMapper({ region: 'us-east-1' });
    mapper.ec2Client = mockEc2Client;
  });

  describe('mapOrphanedResourcesToLogicalIds', () => {
    it('should map orphaned resources using CloudFormation tags (highest confidence)', async () => {
      // Arrange
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
      ];

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      // Act
      const result = await mapper.mapOrphanedResourcesToLogicalIds({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        logicalId: 'FriggVPC',
        physicalId: 'vpc-12345678',
        resourceType: 'AWS::EC2::VPC',
        matchMethod: 'tag',
        confidence: 'high',
      });
    });

    it('should map VPC by contained resources when no tag found', async () => {
      // Arrange
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

      const buildTemplate = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: [
                  { Ref: 'FriggPrivateSubnet1' },
                  { Ref: 'FriggPrivateSubnet2' },
                ],
              },
            },
          },
        },
      };

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-11111111', 'subnet-22222222'],
              },
            },
          },
        },
      };

      // Mock EC2 describe-subnets response
      mockEc2Client.send.mockResolvedValueOnce({
        Subnets: [
          { SubnetId: 'subnet-11111111', VpcId: 'vpc-12345678' },
          { SubnetId: 'subnet-22222222', VpcId: 'vpc-12345678' },
        ],
      });

      // Act
      const result = await mapper.mapOrphanedResourcesToLogicalIds({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        logicalId: 'FriggVPC',
        physicalId: 'vpc-12345678',
        resourceType: 'AWS::EC2::VPC',
        matchMethod: 'contained-resources',
        confidence: 'high',
      });
    });

    it('should map subnet by VPC usage in Lambda functions', async () => {
      // Arrange
      const orphanedResources = [
        {
          physicalId: 'subnet-11111111',
          resourceType: 'AWS::EC2::Subnet',
          properties: {
            SubnetId: 'subnet-11111111',
            VpcId: 'vpc-12345678',
            tags: {},
          },
        },
      ];

      const buildTemplate = {
        resources: {
          FriggPrivateSubnet1: { Type: 'AWS::EC2::Subnet' },
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: [{ Ref: 'FriggPrivateSubnet1' }],
              },
            },
          },
        },
      };

      const deployedTemplate = {
        resources: {
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

      // Act
      const result = await mapper.mapOrphanedResourcesToLogicalIds({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        logicalId: 'FriggPrivateSubnet1',
        physicalId: 'subnet-11111111',
        resourceType: 'AWS::EC2::Subnet',
        matchMethod: 'vpc-usage',
        confidence: 'high',
      });
    });

    it('should map security group by usage in Lambda functions', async () => {
      // Arrange
      const orphanedResources = [
        {
          physicalId: 'sg-07c01370e830b6ad6',
          resourceType: 'AWS::EC2::SecurityGroup',
          properties: {
            GroupId: 'sg-07c01370e830b6ad6',
            tags: {},
          },
        },
      ];

      const buildTemplate = {
        resources: {
          FriggLambdaSecurityGroup: { Type: 'AWS::EC2::SecurityGroup' },
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SecurityGroupIds: [{ Ref: 'FriggLambdaSecurityGroup' }],
              },
            },
          },
        },
      };

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SecurityGroupIds: ['sg-07c01370e830b6ad6'],
              },
            },
          },
        },
      };

      // Act
      const result = await mapper.mapOrphanedResourcesToLogicalIds({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        logicalId: 'FriggLambdaSecurityGroup',
        physicalId: 'sg-07c01370e830b6ad6',
        resourceType: 'AWS::EC2::SecurityGroup',
        matchMethod: 'usage',
        confidence: 'medium',
      });
    });

    it('should return null logical ID if no match found', async () => {
      // Arrange
      const orphanedResources = [
        {
          physicalId: 'vpc-unknown',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-unknown',
            tags: {},
          },
        },
      ];

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      // Act
      const result = await mapper.mapOrphanedResourcesToLogicalIds({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        logicalId: null,
        physicalId: 'vpc-unknown',
        resourceType: 'AWS::EC2::VPC',
        matchMethod: 'none',
        confidence: 'none',
      });
    });

    it('should map multiple orphaned resources with different strategies', async () => {
      // Arrange
      const orphanedResources = [
        {
          physicalId: 'vpc-12345678',
          resourceType: 'AWS::EC2::VPC',
          properties: {
            VpcId: 'vpc-12345678',
            tags: {
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
            tags: {},
          },
        },
      ];

      const buildTemplate = {
        resources: {
          FriggPrivateSubnet1: { Type: 'AWS::EC2::Subnet' },
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: [{ Ref: 'FriggPrivateSubnet1' }],
              },
            },
          },
        },
      };

      const deployedTemplate = {
        resources: {
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

      // Act
      const result = await mapper.mapOrphanedResourcesToLogicalIds({
        orphanedResources,
        buildTemplate,
        deployedTemplate,
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].matchMethod).toBe('tag');
      expect(result[0].confidence).toBe('high');
      expect(result[1].matchMethod).toBe('vpc-usage');
      expect(result[1].confidence).toBe('high');
    });
  });

  describe('_getLogicalIdFromTags', () => {
    it('should extract logical ID from CloudFormation tags', () => {
      // Arrange
      const tags = [
        { Key: 'aws:cloudformation:stack-name', Value: 'acme-integrations-dev' },
        { Key: 'aws:cloudformation:logical-id', Value: 'FriggVPC' },
        { Key: 'Name', Value: 'My VPC' },
      ];

      // Act
      const result = mapper._getLogicalIdFromTags(tags);

      // Assert
      expect(result).toBe('FriggVPC');
    });

    it('should return null if logical-id tag not found', () => {
      // Arrange
      const tags = [
        { Key: 'Name', Value: 'My VPC' },
        { Key: 'Environment', Value: 'dev' },
      ];

      // Act
      const result = mapper._getLogicalIdFromTags(tags);

      // Assert
      expect(result).toBeNull();
    });

    it('should return null if tags is null or undefined', () => {
      // Act
      const resultNull = mapper._getLogicalIdFromTags(null);
      const resultUndefined = mapper._getLogicalIdFromTags(undefined);

      // Assert
      expect(resultNull).toBeNull();
      expect(resultUndefined).toBeNull();
    });

    it('should return null if tags is not an array', () => {
      // Act
      const result = mapper._getLogicalIdFromTags('not-an-array');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('_matchVpcByContainedResources', () => {
    it('should match VPC that contains all expected subnets', async () => {
      // Arrange
      const vpc = {
        physicalId: 'vpc-12345678',
        resourceType: 'AWS::EC2::VPC',
      };

      const buildTemplate = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
        },
      };

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-111', 'subnet-222'],
              },
            },
          },
        },
      };

      // Mock EC2 describe-subnets response
      mockEc2Client.send.mockResolvedValueOnce({
        Subnets: [
          { SubnetId: 'subnet-111', VpcId: 'vpc-12345678' },
          { SubnetId: 'subnet-222', VpcId: 'vpc-12345678' },
          { SubnetId: 'subnet-333', VpcId: 'vpc-12345678' },
        ],
      });

      // Act
      const result = await mapper._matchVpcByContainedResources(
        vpc,
        buildTemplate,
        deployedTemplate
      );

      // Assert
      expect(result).toBe('FriggVPC');
    });

    it('should return null if VPC does not contain expected subnets', async () => {
      // Arrange
      const vpc = {
        physicalId: 'vpc-wrong',
        resourceType: 'AWS::EC2::VPC',
      };

      const buildTemplate = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
        },
      };

      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-111', 'subnet-222'],
              },
            },
          },
        },
      };

      // Mock EC2 describe-subnets response - VPC has different subnets
      mockEc2Client.send.mockResolvedValueOnce({
        Subnets: [
          { SubnetId: 'subnet-999', VpcId: 'vpc-wrong' },
          { SubnetId: 'subnet-888', VpcId: 'vpc-wrong' },
        ],
      });

      // Act
      const result = await mapper._matchVpcByContainedResources(
        vpc,
        buildTemplate,
        deployedTemplate
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return null if no expected subnets in deployed template', async () => {
      // Arrange
      const vpc = {
        physicalId: 'vpc-12345678',
        resourceType: 'AWS::EC2::VPC',
      };

      const buildTemplate = { resources: {} };
      const deployedTemplate = { resources: {} };

      // Act
      const result = await mapper._matchVpcByContainedResources(
        vpc,
        buildTemplate,
        deployedTemplate
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('_extractSubnetIdsFromTemplate', () => {
    it('should extract subnet IDs from Lambda VpcConfig', () => {
      // Arrange
      const template = {
        resources: {
          Lambda1: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-111', 'subnet-222'],
              },
            },
          },
          Lambda2: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-333'],
              },
            },
          },
        },
      };

      // Act
      const result = mapper._extractSubnetIdsFromTemplate(template);

      // Assert
      expect(result).toEqual(['subnet-111', 'subnet-222', 'subnet-333']);
    });

    it('should deduplicate subnet IDs', () => {
      // Arrange
      const template = {
        resources: {
          Lambda1: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-111', 'subnet-222'],
              },
            },
          },
          Lambda2: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-111', 'subnet-333'],
              },
            },
          },
        },
      };

      // Act
      const result = mapper._extractSubnetIdsFromTemplate(template);

      // Assert
      expect(result).toEqual(['subnet-111', 'subnet-222', 'subnet-333']);
    });

    it('should return empty array if no Lambda VPC configs', () => {
      // Arrange
      const template = {
        resources: {
          MyQueue: { Type: 'AWS::SQS::Queue' },
        },
      };

      // Act
      const result = mapper._extractSubnetIdsFromTemplate(template);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('_extractSubnetRefsFromTemplate', () => {
    it('should extract subnet Refs from build template', () => {
      // Arrange
      const template = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: [
                  { Ref: 'FriggPrivateSubnet1' },
                  { Ref: 'FriggPrivateSubnet2' },
                ],
              },
            },
          },
        },
      };

      // Act
      const result = mapper._extractSubnetRefsFromTemplate(template);

      // Assert
      expect(result).toEqual(['FriggPrivateSubnet1', 'FriggPrivateSubnet2']);
    });

    it('should return empty array if no Refs found', () => {
      // Arrange
      const template = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-111'],
              },
            },
          },
        },
      };

      // Act
      const result = mapper._extractSubnetRefsFromTemplate(template);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('_findVpcLogicalIdInTemplate', () => {
    it('should find VPC logical ID in build template', () => {
      // Arrange
      const template = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
          MySubnet: { Type: 'AWS::EC2::Subnet' },
        },
      };

      // Act
      const result = mapper._findVpcLogicalIdInTemplate(template);

      // Assert
      expect(result).toBe('FriggVPC');
    });

    it('should return null if no VPC in template', () => {
      // Arrange
      const template = {
        resources: {
          MyLambda: { Type: 'AWS::Lambda::Function' },
        },
      };

      // Act
      const result = mapper._findVpcLogicalIdInTemplate(template);

      // Assert
      expect(result).toBeNull();
    });
  });
});
