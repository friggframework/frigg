/**
 * LogicalIdMapper - Map orphaned resources to their logical IDs in templates
 *
 * Purpose: Analyze orphaned resources and match them to the correct logical IDs
 * from CloudFormation templates using tags, containment analysis, and template comparison.
 */

const {
  EC2Client,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
} = require('@aws-sdk/client-ec2');

class LogicalIdMapper {
  constructor({ region = 'us-east-1' } = {}) {
    this.ec2Client = new EC2Client({ region });
  }

  /**
   * Map orphaned resources to their logical IDs in template
   * @param {object} params - Mapping parameters
   * @param {Array} params.orphanedResources - Orphaned resources to map
   * @param {object} params.buildTemplate - Build template with logical IDs
   * @param {object} params.deployedTemplate - Deployed template with hardcoded IDs
   * @returns {Promise<Array>} Mappings with logical IDs
   */
  async mapOrphanedResourcesToLogicalIds({
    orphanedResources,
    buildTemplate,
    deployedTemplate,
  }) {
    const mappings = [];

    for (const orphan of orphanedResources) {
      // Strategy 1: Check CloudFormation tags for logical ID
      const logicalIdFromTag = this._getLogicalIdFromTags(orphan.tags);

      if (logicalIdFromTag) {
        mappings.push({
          logicalId: logicalIdFromTag,
          physicalId: orphan.physicalId,
          resourceType: orphan.resourceType,
          matchMethod: 'tag',
          confidence: 'high',
        });
        continue;
      }

      // Strategy 2: Match by template comparison
      if (orphan.resourceType === 'AWS::EC2::VPC') {
        const logicalId = await this._matchVpcByContainedResources(
          orphan,
          buildTemplate,
          deployedTemplate
        );
        if (logicalId) {
          mappings.push({
            logicalId,
            physicalId: orphan.physicalId,
            resourceType: orphan.resourceType,
            matchMethod: 'contained-resources',
            confidence: 'high',
          });
          continue;
        }
      }

      if (orphan.resourceType === 'AWS::EC2::Subnet') {
        const logicalId = await this._matchSubnetByVpcAndUsage(
          orphan,
          buildTemplate,
          deployedTemplate
        );
        if (logicalId) {
          mappings.push({
            logicalId,
            physicalId: orphan.physicalId,
            resourceType: orphan.resourceType,
            matchMethod: 'vpc-usage',
            confidence: 'high',
          });
          continue;
        }
      }

      if (orphan.resourceType === 'AWS::EC2::SecurityGroup') {
        const logicalId = await this._matchSecurityGroupByUsage(
          orphan,
          buildTemplate,
          deployedTemplate
        );
        if (logicalId) {
          mappings.push({
            logicalId,
            physicalId: orphan.physicalId,
            resourceType: orphan.resourceType,
            matchMethod: 'usage',
            confidence: 'medium',
          });
          continue;
        }
      }

      // No match found - mark as unmapped
      mappings.push({
        logicalId: null,
        physicalId: orphan.physicalId,
        resourceType: orphan.resourceType,
        matchMethod: 'none',
        confidence: 'none',
      });
    }

    return mappings;
  }

  /**
   * Extract logical ID from CloudFormation tags
   * @private
   */
  _getLogicalIdFromTags(tags) {
    if (!tags || !Array.isArray(tags)) return null;

    const logicalIdTag = tags.find(
      (t) => t.Key === 'aws:cloudformation:logical-id'
    );
    return logicalIdTag ? logicalIdTag.Value : null;
  }

  /**
   * Match VPC by checking if it contains expected subnets from template
   * @private
   */
  async _matchVpcByContainedResources(
    vpc,
    buildTemplate,
    deployedTemplate
  ) {
    // Get expected subnet IDs from deployed template
    const expectedSubnetIds = this._extractSubnetIdsFromTemplate(
      deployedTemplate
    );

    if (expectedSubnetIds.length === 0) {
      return null;
    }

    // Get actual subnets in this VPC
    const actualSubnets = await this._getSubnetsInVpc(vpc.physicalId);

    // Check if this VPC contains ALL expected subnets
    const containsExpectedSubnets = expectedSubnetIds.every((expectedId) =>
      actualSubnets.some((subnet) => subnet.SubnetId === expectedId)
    );

    if (containsExpectedSubnets) {
      // Find VPC logical ID in build template
      return this._findVpcLogicalIdInTemplate(buildTemplate);
    }

    return null;
  }

  /**
   * Match subnet by VPC ownership and usage in Lambda functions
   * @private
   */
  async _matchSubnetByVpcAndUsage(subnet, buildTemplate, deployedTemplate) {
    // Extract subnet IDs from deployed template Lambda VPC configs
    const templateSubnetIds = this._extractSubnetIdsFromTemplate(
      deployedTemplate
    );

    // Check if this subnet is referenced in deployed template
    if (!templateSubnetIds.includes(subnet.physicalId)) {
      return null;
    }

    // Find the position of this subnet in the template's subnet list
    const subnetIndex = templateSubnetIds.indexOf(subnet.physicalId);

    // Extract subnet Refs from build template
    const subnetRefs = this._extractSubnetRefsFromTemplate(buildTemplate);

    // Return the corresponding logical ID based on position
    return subnetRefs[subnetIndex] || null;
  }

  /**
   * Match security group by usage in Lambda functions
   * @private
   */
  async _matchSecurityGroupByUsage(sg, buildTemplate, deployedTemplate) {
    // Extract security group IDs from deployed template
    const templateSgIds = this._extractSecurityGroupIdsFromTemplate(
      deployedTemplate
    );

    // Check if this SG is referenced in deployed template
    if (!templateSgIds.includes(sg.physicalId)) {
      return null;
    }

    // Find logical ID in build template
    const sgRefs = this._extractSecurityGroupRefsFromTemplate(buildTemplate);
    return sgRefs[0] || null; // Usually just one Lambda SG
  }

  /**
   * Get subnets in a VPC from AWS
   * @private
   */
  async _getSubnetsInVpc(vpcId) {
    const response = await this.ec2Client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
      })
    );
    return response.Subnets || [];
  }

  /**
   * Extract subnet IDs from deployed template (hardcoded values)
   * @private
   */
  _extractSubnetIdsFromTemplate(template) {
    const subnetIds = new Set();

    // Traverse Lambda VpcConfig sections
    Object.values(template.resources || {}).forEach((resource) => {
      if (
        resource.Type === 'AWS::Lambda::Function' &&
        resource.Properties?.VpcConfig?.SubnetIds
      ) {
        resource.Properties.VpcConfig.SubnetIds.forEach((id) => {
          if (typeof id === 'string' && id.startsWith('subnet-')) {
            subnetIds.add(id);
          }
        });
      }
    });

    return Array.from(subnetIds);
  }

  /**
   * Extract security group IDs from deployed template (hardcoded values)
   * @private
   */
  _extractSecurityGroupIdsFromTemplate(template) {
    const sgIds = new Set();

    Object.values(template.resources || {}).forEach((resource) => {
      if (
        resource.Type === 'AWS::Lambda::Function' &&
        resource.Properties?.VpcConfig?.SecurityGroupIds
      ) {
        resource.Properties.VpcConfig.SecurityGroupIds.forEach((id) => {
          if (typeof id === 'string' && id.startsWith('sg-')) {
            sgIds.add(id);
          }
        });
      }
    });

    return Array.from(sgIds);
  }

  /**
   * Extract subnet Refs from build template
   * @private
   */
  _extractSubnetRefsFromTemplate(template) {
    const subnetRefs = [];

    // Find Lambda functions and extract SubnetIds Refs
    Object.values(template.resources || {}).forEach((resource) => {
      if (
        resource.Type === 'AWS::Lambda::Function' &&
        resource.Properties?.VpcConfig?.SubnetIds
      ) {
        resource.Properties.VpcConfig.SubnetIds.forEach((ref) => {
          if (ref.Ref && ref.Ref.includes('Subnet')) {
            subnetRefs.push(ref.Ref);
          }
        });
      }
    });

    return subnetRefs;
  }

  /**
   * Extract security group Refs from build template
   * @private
   */
  _extractSecurityGroupRefsFromTemplate(template) {
    const sgRefs = [];

    Object.values(template.resources || {}).forEach((resource) => {
      if (
        resource.Type === 'AWS::Lambda::Function' &&
        resource.Properties?.VpcConfig?.SecurityGroupIds
      ) {
        resource.Properties.VpcConfig.SecurityGroupIds.forEach((ref) => {
          if (ref.Ref && ref.Ref.includes('SecurityGroup')) {
            sgRefs.push(ref.Ref);
          }
        });
      }
    });

    return sgRefs;
  }

  /**
   * Find VPC logical ID in build template
   * @private
   */
  _findVpcLogicalIdInTemplate(template) {
    const vpcResources = Object.entries(template.resources || {}).filter(
      ([_, resource]) => resource.Type === 'AWS::EC2::VPC'
    );

    // Return first VPC logical ID (usually only one)
    return vpcResources.length > 0 ? vpcResources[0][0] : null;
  }
}

module.exports = { LogicalIdMapper };
