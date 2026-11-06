/**
 * TemplateParser Tests
 *
 * TDD tests for CloudFormation template parsing functionality
 * Domain Layer - Service Tests
 */

const { TemplateParser } = require('../template-parser');
const fs = require('fs');
const path = require('path');

describe('TemplateParser', () => {
  let parser;

  beforeEach(() => {
    parser = new TemplateParser();
  });

  describe('parseTemplate', () => {
    it('should parse template from file path', () => {
      // Arrange
      const mockTemplate = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: 'Test template',
        Resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
        },
      };

      const tempFile = path.join(__dirname, 'temp-template.json');
      fs.writeFileSync(tempFile, JSON.stringify(mockTemplate));

      // Act
      const result = parser.parseTemplate(tempFile);

      // Assert
      expect(result.resources).toEqual(mockTemplate.Resources);
      expect(result.version).toBe('2010-09-09');
      expect(result.description).toBe('Test template');

      // Cleanup
      fs.unlinkSync(tempFile);
    });

    it('should parse template from object', () => {
      // Arrange
      const mockTemplate = {
        AWSTemplateFormatVersion: '2010-09-09',
        Resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
        },
      };

      // Act
      const result = parser.parseTemplate(mockTemplate);

      // Assert
      expect(result.resources).toEqual(mockTemplate.Resources);
      expect(result.version).toBe('2010-09-09');
    });

    it('should throw error if template file not found', () => {
      // Arrange
      const nonExistentPath = '/path/to/nonexistent/template.json';

      // Act & Assert
      expect(() => parser.parseTemplate(nonExistentPath)).toThrow(
        'Template not found at path'
      );
    });

    it('should return empty resources if Resources key missing', () => {
      // Arrange
      const mockTemplate = {
        AWSTemplateFormatVersion: '2010-09-09',
      };

      // Act
      const result = parser.parseTemplate(mockTemplate);

      // Assert
      expect(result.resources).toEqual({});
    });
  });

  describe('getVpcResources', () => {
    it('should extract VPC resources from template', () => {
      // Arrange
      const template = {
        resources: {
          FriggVPC: {
            Type: 'AWS::EC2::VPC',
            Properties: { CidrBlock: '10.0.0.0/16' },
          },
          FriggPrivateSubnet1: {
            Type: 'AWS::EC2::Subnet',
            Properties: { CidrBlock: '10.0.0.0/24' },
          },
          FriggLambdaSecurityGroup: {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: { GroupDescription: 'Lambda SG' },
          },
          SomeOtherResource: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
        },
      };

      // Act
      const result = parser.getVpcResources(template);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        logicalId: 'FriggVPC',
        resourceType: 'AWS::EC2::VPC',
        properties: { CidrBlock: '10.0.0.0/16' },
      });
      expect(result[1]).toEqual({
        logicalId: 'FriggPrivateSubnet1',
        resourceType: 'AWS::EC2::Subnet',
        properties: { CidrBlock: '10.0.0.0/24' },
      });
      expect(result[2]).toEqual({
        logicalId: 'FriggLambdaSecurityGroup',
        resourceType: 'AWS::EC2::SecurityGroup',
        properties: { GroupDescription: 'Lambda SG' },
      });
    });

    it('should return empty array if no VPC resources', () => {
      // Arrange
      const template = {
        resources: {
          MyLambda: { Type: 'AWS::Lambda::Function' },
        },
      };

      // Act
      const result = parser.getVpcResources(template);

      // Assert
      expect(result).toEqual([]);
    });

    it('should include all VPC-related resource types', () => {
      // Arrange
      const template = {
        resources: {
          MyVPC: { Type: 'AWS::EC2::VPC', Properties: {} },
          MySubnet: { Type: 'AWS::EC2::Subnet', Properties: {} },
          MySG: { Type: 'AWS::EC2::SecurityGroup', Properties: {} },
          MyIGW: { Type: 'AWS::EC2::InternetGateway', Properties: {} },
          MyNAT: { Type: 'AWS::EC2::NatGateway', Properties: {} },
          MyRT: { Type: 'AWS::EC2::RouteTable', Properties: {} },
          MyEndpoint: { Type: 'AWS::EC2::VPCEndpoint', Properties: {} },
        },
      };

      // Act
      const result = parser.getVpcResources(template);

      // Assert
      expect(result).toHaveLength(7);
    });
  });

  describe('extractHardcodedIds', () => {
    it('should extract hardcoded VPC IDs from deployed template', () => {
      // Arrange
      const template = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                VpcId: 'vpc-0eadd96976d29ede7',
                SubnetIds: ['subnet-00ab9e0502e66aac3', 'subnet-00d085a52937aaf91'],
                SecurityGroupIds: ['sg-07c01370e830b6ad6'],
              },
            },
          },
        },
      };

      // Act
      const result = parser.extractHardcodedIds(template);

      // Assert
      expect(result.vpcIds).toEqual(['vpc-0eadd96976d29ede7']);
      expect(result.subnetIds).toEqual([
        'subnet-00ab9e0502e66aac3',
        'subnet-00d085a52937aaf91',
      ]);
      expect(result.securityGroupIds).toEqual(['sg-07c01370e830b6ad6']);
    });

    it('should handle nested VPC configurations', () => {
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
                SecurityGroupIds: ['sg-444'],
              },
            },
          },
        },
      };

      // Act
      const result = parser.extractHardcodedIds(template);

      // Assert
      expect(result.subnetIds).toEqual(['subnet-111', 'subnet-222', 'subnet-333']);
      expect(result.securityGroupIds).toEqual(['sg-444']);
    });

    it('should return empty arrays if no hardcoded IDs found', () => {
      // Arrange
      const template = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {},
          },
        },
      };

      // Act
      const result = parser.extractHardcodedIds(template);

      // Assert
      expect(result.vpcIds).toEqual([]);
      expect(result.subnetIds).toEqual([]);
      expect(result.securityGroupIds).toEqual([]);
    });

    it('should deduplicate hardcoded IDs', () => {
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
      const result = parser.extractHardcodedIds(template);

      // Assert
      expect(result.subnetIds).toEqual(['subnet-111', 'subnet-222', 'subnet-333']);
    });
  });

  describe('extractRefs', () => {
    it('should extract Refs from build template', () => {
      // Arrange
      const template = {
        resources: {
          FriggVPC: { Type: 'AWS::EC2::VPC' },
          FriggPrivateSubnet1: { Type: 'AWS::EC2::Subnet' },
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: [
                  { Ref: 'FriggPrivateSubnet1' },
                  { Ref: 'FriggPrivateSubnet2' },
                ],
                SecurityGroupIds: [{ Ref: 'FriggLambdaSecurityGroup' }],
              },
            },
          },
        },
      };

      // Act
      const result = parser.extractRefs(template);

      // Assert
      expect(result.subnetRefs).toEqual([
        'FriggPrivateSubnet1',
        'FriggPrivateSubnet2',
      ]);
      expect(result.securityGroupRefs).toEqual(['FriggLambdaSecurityGroup']);
    });

    it('should identify VPC Refs correctly', () => {
      // Arrange
      const template = {
        resources: {
          MySubnet: {
            Type: 'AWS::EC2::Subnet',
            Properties: {
              VpcId: { Ref: 'FriggVPC' },
            },
          },
        },
      };

      // Act
      const result = parser.extractRefs(template);

      // Assert
      expect(result.vpcRefs).toEqual(['FriggVPC']);
    });

    it('should not confuse VPCEndpoint with VPC refs', () => {
      // Arrange
      const template = {
        resources: {
          MyEndpoint: {
            Type: 'AWS::EC2::VPCEndpoint',
            Properties: {
              VpcId: { Ref: 'FriggVPCEndpoint' },
            },
          },
        },
      };

      // Act
      const result = parser.extractRefs(template);

      // Assert
      expect(result.vpcRefs).toEqual([]); // VPCEndpoint should be excluded
    });

    it('should return empty arrays if no Refs found', () => {
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
      const result = parser.extractRefs(template);

      // Assert
      expect(result.vpcRefs).toEqual([]);
      expect(result.subnetRefs).toEqual([]);
      expect(result.securityGroupRefs).toEqual([]);
    });
  });

  describe('findLogicalIdForPhysicalId', () => {
    it('should match physical ID to logical ID via template comparison', () => {
      // Arrange
      const deployedTemplate = {
        resources: {
          MyLambda: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              VpcConfig: {
                SubnetIds: ['subnet-00ab9e0502e66aac3'],
              },
            },
          },
        },
      };

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

      // Act
      const result = parser.findLogicalIdForPhysicalId(
        'subnet-00ab9e0502e66aac3',
        deployedTemplate,
        buildTemplate
      );

      // Assert
      expect(result).toBe('FriggPrivateSubnet1');
    });

    it('should return null if no match found', () => {
      // Arrange
      const deployedTemplate = { resources: {} };
      const buildTemplate = { resources: {} };

      // Act
      const result = parser.findLogicalIdForPhysicalId(
        'subnet-unknown',
        deployedTemplate,
        buildTemplate
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('static methods', () => {
    describe('getBuildTemplatePath', () => {
      it('should return correct path to build template', () => {
        // Act
        const result = TemplateParser.getBuildTemplatePath('/project/root');

        // Assert
        expect(result).toBe(
          '/project/root/.serverless/cloudformation-template-update-stack.json'
        );
      });

      it('should use current directory if no path provided', () => {
        // Act
        const result = TemplateParser.getBuildTemplatePath();

        // Assert
        expect(result).toContain('.serverless/cloudformation-template-update-stack.json');
      });
    });

    describe('buildTemplateExists', () => {
      it('should return true if build template exists', () => {
        // Arrange
        const tempDir = path.join(__dirname, 'temp-project');
        const serverlessDir = path.join(tempDir, '.serverless');
        const templatePath = path.join(
          serverlessDir,
          'cloudformation-template-update-stack.json'
        );

        fs.mkdirSync(serverlessDir, { recursive: true });
        fs.writeFileSync(templatePath, '{}');

        // Act
        const result = TemplateParser.buildTemplateExists(tempDir);

        // Assert
        expect(result).toBe(true);

        // Cleanup
        fs.unlinkSync(templatePath);
        fs.rmdirSync(serverlessDir);
        fs.rmdirSync(tempDir);
      });

      it('should return false if build template does not exist', () => {
        // Arrange
        const tempDir = path.join(__dirname, 'nonexistent-project');

        // Act
        const result = TemplateParser.buildTemplateExists(tempDir);

        // Assert
        expect(result).toBe(false);
      });
    });
  });
});
