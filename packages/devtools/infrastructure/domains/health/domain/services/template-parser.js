/**
 * TemplateParser - Parse CloudFormation templates for resource extraction
 *
 * Purpose: Parse both build templates (.serverless/) and deployed templates (from AWS)
 * to extract resource definitions, logical IDs, and Refs for import mapping.
 */

class TemplateParser {
  /**
   * Parse CloudFormation template and extract resource definitions
   * @param {string|object} template - Template path or parsed template object
   * @returns {object} Parsed template with resources
   */
  parseTemplate(template) {
    let parsedTemplate;

    if (typeof template === 'string') {
      const fs = require('fs');
      const path = require('path');

      if (!fs.existsSync(template)) {
        throw new Error(`Template not found at path: ${template}`);
      }

      parsedTemplate = JSON.parse(fs.readFileSync(template, 'utf8'));
    } else {
      parsedTemplate = template;
    }

    return {
      resources: parsedTemplate.Resources || {},
      version: parsedTemplate.AWSTemplateFormatVersion,
      description: parsedTemplate.Description,
      outputs: parsedTemplate.Outputs || {},
    };
  }

  /**
   * Extract VPC-related resource logical IDs from template
   * @param {object} template - Parsed template object
   * @returns {Array} VPC resources with logical IDs
   */
  getVpcResources(template) {
    const vpcResourceTypes = [
      'AWS::EC2::VPC',
      'AWS::EC2::Subnet',
      'AWS::EC2::SecurityGroup',
      'AWS::EC2::InternetGateway',
      'AWS::EC2::NatGateway',
      'AWS::EC2::RouteTable',
      'AWS::EC2::VPCEndpoint',
    ];

    return Object.entries(template.resources)
      .filter(([_, resource]) => vpcResourceTypes.includes(resource.Type))
      .map(([logicalId, resource]) => ({
        logicalId,
        resourceType: resource.Type,
        properties: resource.Properties || {},
      }));
  }

  /**
   * Extract hardcoded resource IDs from deployed template
   * Finds physical IDs that are hardcoded instead of using Refs
   * @param {object} template - Deployed CloudFormation template
   * @returns {object} Extracted hardcoded IDs by type
   */
  extractHardcodedIds(template) {
    const hardcodedIds = {
      vpcIds: new Set(),
      subnetIds: new Set(),
      securityGroupIds: new Set(),
    };

    // Traverse template to find hardcoded IDs
    Object.values(template.resources).forEach((resource) => {
      this._extractIdsFromResource(resource, hardcodedIds);
    });

    return {
      vpcIds: Array.from(hardcodedIds.vpcIds),
      subnetIds: Array.from(hardcodedIds.subnetIds),
      securityGroupIds: Array.from(hardcodedIds.securityGroupIds),
    };
  }

  /**
   * Extract Refs from build template
   * Finds logical IDs that are referenced via {Ref: "LogicalId"}
   * @param {object} template - Build template with Refs
   * @returns {object} Logical IDs mapped to expected resource types
   */
  extractRefs(template) {
    const refs = {
      vpcRefs: new Set(),
      subnetRefs: new Set(),
      securityGroupRefs: new Set(),
    };

    // Traverse template to find Ref expressions
    Object.values(template.resources).forEach((resource) => {
      this._extractRefsFromResource(resource, refs);
    });

    return {
      vpcRefs: Array.from(refs.vpcRefs),
      subnetRefs: Array.from(refs.subnetRefs),
      securityGroupRefs: Array.from(refs.securityGroupRefs),
    };
  }

  /**
   * Recursively extract hardcoded IDs from resource properties
   * @private
   */
  _extractIdsFromResource(obj, hardcodedIds) {
    if (typeof obj !== 'object' || obj === null) return;

    Object.entries(obj).forEach(([key, value]) => {
      // Check for VPC IDs
      if (key === 'VpcId' && typeof value === 'string' && value.startsWith('vpc-')) {
        hardcodedIds.vpcIds.add(value);
      }

      // Check for subnet IDs
      if (
        (key === 'SubnetIds' || key === 'SubnetId') &&
        Array.isArray(value)
      ) {
        value.forEach((id) => {
          if (typeof id === 'string' && id.startsWith('subnet-')) {
            hardcodedIds.subnetIds.add(id);
          }
        });
      } else if (
        key === 'SubnetId' &&
        typeof value === 'string' &&
        value.startsWith('subnet-')
      ) {
        hardcodedIds.subnetIds.add(value);
      }

      // Check for security group IDs
      if (key === 'SecurityGroupIds' && Array.isArray(value)) {
        value.forEach((id) => {
          if (typeof id === 'string' && id.startsWith('sg-')) {
            hardcodedIds.securityGroupIds.add(id);
          }
        });
      } else if (
        key === 'GroupId' &&
        typeof value === 'string' &&
        value.startsWith('sg-')
      ) {
        hardcodedIds.securityGroupIds.add(value);
      }

      // Recurse into nested objects
      if (typeof value === 'object') {
        this._extractIdsFromResource(value, hardcodedIds);
      }
    });
  }

  /**
   * Recursively extract Refs from resource properties
   * @private
   */
  _extractRefsFromResource(obj, refs) {
    if (typeof obj !== 'object' || obj === null) return;

    Object.entries(obj).forEach(([key, value]) => {
      // Check for Ref expressions
      if (key === 'Ref' && typeof value === 'string') {
        // Determine ref type based on logical ID naming
        if (value.includes('VPC') && !value.includes('Endpoint')) {
          refs.vpcRefs.add(value);
        } else if (value.includes('Subnet')) {
          refs.subnetRefs.add(value);
        } else if (value.includes('SecurityGroup')) {
          refs.securityGroupRefs.add(value);
        }
      }

      // Recurse into nested objects and arrays
      if (typeof value === 'object') {
        this._extractRefsFromResource(value, refs);
      }
    });
  }

  /**
   * Find logical ID for a physical ID by comparing templates
   * @param {string} physicalId - Physical resource ID from AWS
   * @param {object} deployedTemplate - Template with hardcoded IDs
   * @param {object} buildTemplate - Template with Refs
   * @returns {string|null} Matching logical ID or null
   */
  findLogicalIdForPhysicalId(physicalId, deployedTemplate, buildTemplate) {
    // Extract hardcoded IDs and their context
    const hardcodedIds = this.extractHardcodedIds(deployedTemplate);
    const refs = this.extractRefs(buildTemplate);

    // Determine resource type from physical ID
    let logicalIdCandidates = [];
    if (physicalId.startsWith('vpc-')) {
      logicalIdCandidates = refs.vpcRefs;
    } else if (physicalId.startsWith('subnet-')) {
      logicalIdCandidates = refs.subnetRefs;
    } else if (physicalId.startsWith('sg-')) {
      logicalIdCandidates = refs.securityGroupRefs;
    }

    // For now, return first candidate (will enhance with position matching)
    return logicalIdCandidates[0] || null;
  }

  /**
   * Get build template path from project directory
   * @param {string} projectPath - Project root path
   * @returns {string} Path to build template
   */
  static getBuildTemplatePath(projectPath = process.cwd()) {
    const path = require('path');
    return path.join(
      projectPath,
      '.serverless',
      'cloudformation-template-update-stack.json'
    );
  }

  /**
   * Check if build template exists
   * @param {string} projectPath - Project root path
   * @returns {boolean} True if template exists
   */
  static buildTemplateExists(projectPath = process.cwd()) {
    const fs = require('fs');
    const templatePath = this.getBuildTemplatePath(projectPath);
    return fs.existsSync(templatePath);
  }
}

module.exports = { TemplateParser };
