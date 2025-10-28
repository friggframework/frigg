/**
 * ImportTemplateGenerator - Generate CloudFormation import templates
 *
 * Purpose: Generate CloudFormation templates for importing existing resources
 * by resolving intrinsic functions (!Ref, !Sub, !GetAtt) with actual AWS values
 * and merging with current stack template.
 *
 * Domain Layer - Service
 */

class ImportTemplateGenerator {
  /**
   * Create ImportTemplateGenerator instance
   * @param {object} dependencies - Service dependencies
   * @param {object} dependencies.templateParser - Template parsing service
   * @param {object} dependencies.resourceDetector - AWS resource detection service
   * @param {object} dependencies.stackRepository - CloudFormation stack repository
   */
  constructor({ templateParser, resourceDetector, stackRepository }) {
    this.templateParser = templateParser;
    this.resourceDetector = resourceDetector;
    this.stackRepository = stackRepository;
  }

  /**
   * Generate import template by merging build template with AWS state
   *
   * Process:
   * 1. Parse build template to get resource definitions with Refs
   * 2. Get current stack template (if exists)
   * 3. For each resource to import:
   *    - Get AWS resource properties via resourceDetector
   *    - Generate resource definition with resolved intrinsics
   *    - Create resource identifier for import operation
   * 4. Merge with current template (preserve existing resources)
   *
   * @param {object} params - Generation parameters
   * @param {Array} params.resourcesToImport - Resources to import
   * @param {string} params.buildTemplatePath - Path to build template
   * @param {object} params.stackIdentifier - Target stack identifier
   * @returns {Promise<object>} Import template and resource identifiers
   */
  async generateImportTemplate({
    resourcesToImport,
    buildTemplatePath,
    stackIdentifier,
  }) {
    // 1. Parse build template
    const buildTemplate = this.templateParser.parseTemplate(buildTemplatePath);

    // 2. Get current stack template (if exists)
    let currentTemplate;
    try {
      currentTemplate = await this.stackRepository.getTemplate(stackIdentifier);
    } catch (error) {
      // Stack might not exist yet
      currentTemplate = { Resources: {} };
    }

    // 3. For each resource to import, get AWS properties
    const resourceDefinitions = {};
    const resourceIdentifiers = [];

    for (const resource of resourcesToImport) {
      const { logicalId, physicalId, resourceType } = resource;

      // Get current resource state from AWS
      const awsResourceDetails =
        await this.resourceDetector.getResourceDetails({
          resourceType,
          physicalId,
          region: stackIdentifier.region,
        });

      // Generate CloudFormation resource definition
      const resourceDef = this._generateResourceDefinition({
        logicalId,
        resourceType,
        physicalId,
        buildTemplate,
        awsResourceDetails,
      });

      resourceDefinitions[logicalId] = resourceDef;

      // Generate resource identifier for import
      resourceIdentifiers.push({
        ResourceType: resourceType,
        LogicalResourceId: logicalId,
        ResourceIdentifier: this._getResourceIdentifier(
          resourceType,
          physicalId
        ),
      });
    }

    // 4. Merge with current template (keep existing resources)
    const importTemplate = {
      ...currentTemplate,
      Resources: {
        ...currentTemplate.Resources,
        ...resourceDefinitions,
      },
    };

    // DEBUG: Write template to file for inspection
    if (process.env.DEBUG_IMPORT_TEMPLATE === 'true') {
      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(__dirname, '../../debug');

      // Ensure debug directory exists
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const debugFile = path.join(debugDir, `import-template-${timestamp}.json`);

      const debugData = {
        stackIdentifier,
        resourcesToImport,
        resourceIdentifiers,
        template: importTemplate,
        templateSize: JSON.stringify(importTemplate).length,
        resourceCount: Object.keys(importTemplate.Resources || {}).length,
      };

      fs.writeFileSync(debugFile, JSON.stringify(debugData, null, 2));
      console.log(`[DEBUG] Template written to: ${debugFile}`);
    }

    return {
      template: importTemplate,
      resourceIdentifiers,
    };
  }

  /**
   * Generate CloudFormation resource definition from AWS state
   *
   * Takes build template definition and resolves all intrinsics
   * with actual AWS values to create import-ready definition.
   *
   * @private
   * @param {object} params - Generation parameters
   * @param {string} params.logicalId - CloudFormation logical ID
   * @param {string} params.resourceType - AWS resource type
   * @param {string} params.physicalId - AWS physical resource ID
   * @param {object} params.buildTemplate - Build template with Refs
   * @param {object} params.awsResourceDetails - Current AWS resource state
   * @returns {object} CloudFormation resource definition
   * @throws {Error} If logical ID not found in build template
   */
  _generateResourceDefinition({
    logicalId,
    resourceType,
    physicalId,
    buildTemplate,
    awsResourceDetails,
  }) {
    // Start with build template definition if available
    const buildResource = buildTemplate.resources?.[logicalId];

    if (!buildResource) {
      throw new Error(
        `Logical ID ${logicalId} not found in build template. ` +
          `Cannot generate import definition without template reference.`
      );
    }

    // Resolve intrinsics with actual AWS values
    const resolvedProperties = this._resolveIntrinsics({
      properties: buildResource.Properties,
      awsResourceDetails,
      resourceType,
    });

    return {
      Type: resourceType,
      Properties: resolvedProperties,
      DeletionPolicy: 'Retain', // Required for CloudFormation IMPORT operations
      UpdateReplacePolicy: 'Retain', // Protects old resources during stack updates
    };
  }

  /**
   * Resolve CloudFormation intrinsics in properties
   *
   * Processes all properties and resolves intrinsic functions
   * (!Ref, !Sub, !GetAtt) with actual AWS values.
   *
   * @private
   * @param {object} params - Resolution parameters
   * @param {object} params.properties - CloudFormation properties
   * @param {object} params.awsResourceDetails - AWS resource state
   * @param {string} params.resourceType - AWS resource type
   * @returns {object} Resolved properties
   */
  _resolveIntrinsics({ properties, awsResourceDetails, resourceType }) {
    const resolved = {};

    for (const [key, value] of Object.entries(properties)) {
      resolved[key] = this._resolveValue(
        value,
        awsResourceDetails,
        resourceType
      );
    }

    return resolved;
  }

  /**
   * Recursively resolve a property value
   *
   * Handles:
   * - Intrinsic functions (!Ref, !Sub, !GetAtt)
   * - Nested objects
   * - Arrays
   * - Literal values
   *
   * @private
   * @param {*} value - Property value to resolve
   * @param {object} awsResourceDetails - AWS resource state
   * @param {string} resourceType - AWS resource type
   * @returns {*} Resolved value
   */
  _resolveValue(value, awsResourceDetails, resourceType) {
    // Handle intrinsic functions
    if (typeof value === 'object' && value !== null) {
      // !Ref
      if (value.Ref) {
        return this._resolveRef(value.Ref, awsResourceDetails, resourceType);
      }

      // !Sub
      if (value['Fn::Sub']) {
        return this._resolveSub(value['Fn::Sub'], awsResourceDetails);
      }

      // !GetAtt
      if (value['Fn::GetAtt']) {
        return this._resolveGetAtt(value['Fn::GetAtt'], awsResourceDetails);
      }

      // Recursively process nested objects
      if (Array.isArray(value)) {
        return value.map((v) =>
          this._resolveValue(v, awsResourceDetails, resourceType)
        );
      }

      // Recursively process object properties
      const resolved = {};
      for (const [k, v] of Object.entries(value)) {
        resolved[k] = this._resolveValue(v, awsResourceDetails, resourceType);
      }
      return resolved;
    }

    // Literal value
    return value;
  }

  /**
   * Resolve !Ref to actual AWS value
   *
   * Maps common parameter names and resource references to AWS property values.
   * Supports:
   * - Parameter names (VpcCidr, VpcId, etc.)
   * - Resource logical IDs (FriggVPC, FriggLambdaSecurityGroup, etc.)
   * - Direct property references (Subnet1, Subnet2, etc.)
   *
   * @private
   * @param {string} refName - Reference name
   * @param {object} awsResourceDetails - AWS resource state
   * @param {string} resourceType - AWS resource type
   * @returns {*} Resolved value
   */
  _resolveRef(refName, awsResourceDetails, resourceType) {
    // Map common parameters to AWS properties
    const refMap = {
      VpcCidr: awsResourceDetails.properties?.CidrBlock,
      VpcId: awsResourceDetails.properties?.VpcId,
    };

    if (refMap[refName] !== undefined) {
      return refMap[refName];
    }

    // First, try direct property lookup
    // This handles cases like { Ref: 'Subnet1' } where properties.Subnet1 = 'subnet-111'
    const directValue = awsResourceDetails.properties?.[refName];
    if (directValue !== undefined) {
      return directValue;
    }

    // Check if refName is a resource logical ID that references another resource
    // In this case, the AWS properties will already have the resolved value
    // For example: { Ref: 'FriggVPC' } should resolve to VpcId from properties
    // For example: { Ref: 'FriggLambdaSecurityGroup' } should resolve to GroupId from properties
    if (refName.includes('VPC') && !refName.includes('Endpoint')) {
      // VPC resource reference
      return awsResourceDetails.properties?.VpcId || refName;
    } else if (refName.includes('Subnet')) {
      // Subnet resource reference
      return awsResourceDetails.properties?.SubnetId || refName;
    } else if (refName.includes('SecurityGroup')) {
      // Security Group resource reference
      return awsResourceDetails.properties?.GroupId || refName;
    }

    // Fallback: return the ref name itself if not found
    return refName;
  }

  /**
   * Resolve !Sub to actual string
   *
   * Replaces CloudFormation pseudo parameters and variables
   * with actual values from AWS resource state.
   *
   * Supports:
   * - ${AWS::StackName}
   * - Custom variables from tags
   *
   * @private
   * @param {string|object} subValue - Sub expression
   * @param {object} awsResourceDetails - AWS resource state
   * @returns {string|object} Resolved value
   */
  _resolveSub(subValue, awsResourceDetails) {
    if (typeof subValue !== 'string') {
      return subValue;
    }

    // Replace ${AWS::StackName} with actual stack name
    let resolved = subValue.replace(
      /\$\{AWS::StackName\}/g,
      awsResourceDetails.stackName || ''
    );

    // Replace other variables if present in tags
    if (awsResourceDetails.tags) {
      for (const [key, value] of Object.entries(awsResourceDetails.tags)) {
        resolved = resolved.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
      }
    }

    return resolved;
  }

  /**
   * Resolve !GetAtt to actual attribute value
   *
   * Gets attribute value from AWS resource properties.
   * When the attribute refers to a different resource's property
   * (e.g., FriggVPC.CidrBlock from a Subnet), we need to look at
   * the actual AWS values in the current resource's properties.
   *
   * The AWS resource details from the detector already contain
   * resolved values. For example, a Subnet may have Tags that
   * include the VPC's CIDR, or properties that include the VPC ID.
   *
   * @private
   * @param {Array} getAttValue - GetAtt expression [ResourceName, AttributeName]
   * @param {object} awsResourceDetails - AWS resource state
   * @returns {*} Attribute value or null
   */
  _resolveGetAtt([resourceName, attributeName], awsResourceDetails) {
    // First try to get directly from properties
    const directValue = awsResourceDetails.properties?.[attributeName];
    if (directValue !== undefined && directValue !== null) {
      // Check if this is the actual value we want
      // For cross-resource references, we need to be more careful
      // If resourceName refers to a different resource (e.g., FriggVPC from a Subnet),
      // the property might not be the right one

      // If getting VPC.CidrBlock, but we have Subnet.CidrBlock,
      // we need to look elsewhere
      if (resourceName.includes('VPC') && attributeName === 'CidrBlock') {
        // Check if this is actually a subnet's CIDR (starts with same first two octets + .X.0/24 pattern)
        // If so, we need to look at Tags for VpcCidr
        const tags = awsResourceDetails.properties?.Tags;
        if (Array.isArray(tags)) {
          const vpcCidrTag = tags.find(t => t.Key === 'VpcCidr');
          if (vpcCidrTag) {
            return vpcCidrTag.Value;
          }
        }
      }

      return directValue;
    }

    // Check Tags as fallback
    const tags = awsResourceDetails.properties?.Tags;
    if (Array.isArray(tags)) {
      const tag = tags.find(t => t.Key === attributeName || t.Key === `${resourceName}${attributeName}`);
      if (tag) {
        return tag.Value;
      }
    }

    return null;
  }

  /**
   * Get resource identifier for import operation
   *
   * Maps resource type to CloudFormation import identifier format.
   * Each AWS resource type has a specific identifier property.
   *
   * @private
   * @param {string} resourceType - AWS resource type
   * @param {string} physicalId - AWS physical resource ID
   * @returns {object} Resource identifier for import
   */
  _getResourceIdentifier(resourceType, physicalId) {
    const identifierMap = {
      'AWS::EC2::VPC': { VpcId: physicalId },
      'AWS::EC2::Subnet': { SubnetId: physicalId },
      'AWS::EC2::SecurityGroup': { Id: physicalId },
      'AWS::EC2::InternetGateway': { InternetGatewayId: physicalId },
      'AWS::EC2::NatGateway': { NatGatewayId: physicalId },
      'AWS::EC2::RouteTable': { RouteTableId: physicalId },
      'AWS::EC2::VPCEndpoint': { VpcEndpointId: physicalId },
    };

    return identifierMap[resourceType] || { Id: physicalId };
  }
}

module.exports = { ImportTemplateGenerator };
