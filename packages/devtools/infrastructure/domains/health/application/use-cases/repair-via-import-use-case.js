/**
 * RepairViaImportUseCase - Import Orphaned Resources into CloudFormation Stack
 *
 * Application Layer - Use Case
 *
 * Business logic for the "frigg repair --import" command. Orchestrates resource
 * import operations to fix orphaned resources by bringing them under CloudFormation management.
 *
 * Responsibilities:
 * - Validate resources can be imported
 * - Retrieve resource details from cloud
 * - Generate CloudFormation template snippets
 * - Execute import operations (single or batch)
 * - Track import operation status
 * - Map orphaned resources to correct logical IDs using template comparison
 */

const { TemplateParser } = require('../../domain/services/template-parser');
const { LogicalIdMapper } = require('../../domain/services/logical-id-mapper');

class RepairViaImportUseCase {
    /**
     * Create use case with required dependencies
     *
     * @param {Object} params
     * @param {IResourceImporter} params.resourceImporter - Resource import operations
     * @param {IResourceDetector} params.resourceDetector - Resource discovery and details
     * @param {IStackRepository} params.stackRepository - CloudFormation stack operations
     * @param {TemplateParser} params.templateParser - CloudFormation template parsing
     * @param {LogicalIdMapper} params.logicalIdMapper - Logical ID mapping service
     */
    constructor({ resourceImporter, resourceDetector, stackRepository, templateParser, logicalIdMapper }) {
        if (!resourceImporter) {
            throw new Error('resourceImporter is required');
        }
        if (!resourceDetector) {
            throw new Error('resourceDetector is required');
        }

        this.resourceImporter = resourceImporter;
        this.resourceDetector = resourceDetector;
        this.stackRepository = stackRepository;
        this.templateParser = templateParser || new TemplateParser();
        this.logicalIdMapper = logicalIdMapper || new LogicalIdMapper({ region: 'us-east-1' });
    }

    /**
     * Import a single orphaned resource into a CloudFormation stack
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {string} params.logicalId - Desired logical ID for resource in template
     * @param {string} params.physicalId - Physical ID of resource in cloud
     * @param {string} params.resourceType - CloudFormation resource type
     * @returns {Promise<Object>} Import result
     */
    async importSingleResource({ stackIdentifier, logicalId, physicalId, resourceType }) {
        // 1. Validate resource can be imported
        const validation = await this.resourceImporter.validateImport({
            resourceType,
            physicalId,
            region: stackIdentifier.region,
        });

        if (!validation.canImport) {
            throw new Error(validation.reason);
        }

        // 2. Get detailed resource properties from cloud
        const resourceDetails = await this.resourceDetector.getResourceDetails({
            resourceType,
            physicalId,
            region: stackIdentifier.region,
        });

        // 3. Execute import operation
        const importResult = await this.resourceImporter.importResource({
            stackIdentifier,
            logicalId,
            resourceType,
            physicalId,
            properties: resourceDetails.properties,
        });

        // 4. Return result with warnings if any
        return {
            success: true,
            operationId: importResult.operationId,
            status: importResult.status,
            message: importResult.message,
            warnings: validation.warnings || [],
            resource: {
                logicalId,
                physicalId,
                resourceType,
            },
        };
    }

    /**
     * Import multiple orphaned resources into a stack in batch
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {Array<Object>} params.resources - Resources to import
     * @param {string} params.resources[].logicalId - Logical ID
     * @param {string} params.resources[].physicalId - Physical ID
     * @param {string} params.resources[].resourceType - Resource type
     * @returns {Promise<Object>} Batch import result
     */
    async importMultipleResources({ stackIdentifier, resources }) {
        const validationErrors = [];
        const validResources = [];

        // 1. Validate all resources first
        for (const resource of resources) {
            try {
                const validation = await this.resourceImporter.validateImport({
                    resourceType: resource.resourceType,
                    physicalId: resource.physicalId,
                    region: stackIdentifier.region,
                });

                if (!validation.canImport) {
                    validationErrors.push({
                        logicalId: resource.logicalId,
                        physicalId: resource.physicalId,
                        reason: validation.reason,
                    });
                    continue;
                }

                // Get resource details
                const resourceDetails = await this.resourceDetector.getResourceDetails({
                    resourceType: resource.resourceType,
                    physicalId: resource.physicalId,
                    region: stackIdentifier.region,
                });

                validResources.push({
                    logicalId: resource.logicalId,
                    resourceType: resource.resourceType,
                    physicalId: resource.physicalId,
                    properties: resourceDetails.properties,
                });
            } catch (error) {
                validationErrors.push({
                    logicalId: resource.logicalId,
                    physicalId: resource.physicalId,
                    reason: error.message,
                });
            }
        }

        // 2. If ANY validation failed, fail the entire batch (all-or-nothing approach)
        if (validationErrors.length > 0) {
            return {
                success: false,
                importedCount: 0,
                failedCount: validationErrors.length,
                validationErrors,
                message: `${validationErrors.length} resource(s) failed validation - batch import aborted`,
            };
        }

        // 3. All validations passed - import resources in batch
        if (validResources.length > 0) {
            const importResult = await this.resourceImporter.importMultipleResources({
                stackIdentifier,
                resources: validResources,
            });

            return {
                success: true,
                importedCount: importResult.importedCount,
                failedCount: importResult.failedCount,
                operationId: importResult.operationId,
                status: importResult.status,
                message: importResult.message,
                details: importResult.details,
            };
        }

        // 4. No resources provided
        return {
            success: false,
            importedCount: 0,
            failedCount: 0,
            message: 'No resources provided for import',
        };
    }

    /**
     * Get status of an ongoing import operation
     *
     * @param {Object} params
     * @param {string} params.operationId - CloudFormation change set ID
     * @returns {Promise<Object>} Operation status
     */
    async getImportStatus({ operationId }) {
        return await this.resourceImporter.getImportStatus(operationId);
    }

    /**
     * Preview what template changes will be made for an import
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {string} params.logicalId - Desired logical ID
     * @param {string} params.physicalId - Physical resource ID
     * @param {string} params.resourceType - Resource type
     * @returns {Promise<Object>} Preview with template snippet
     */
    async previewImport({ stackIdentifier, logicalId, physicalId, resourceType }) {
        // Get resource details from cloud
        const resourceDetails = await this.resourceDetector.getResourceDetails({
            resourceType,
            physicalId,
            region: stackIdentifier.region,
        });

        // Generate template snippet
        const templateSnippet = await this.resourceImporter.generateTemplateSnippet({
            logicalId,
            resourceType,
            properties: resourceDetails.properties,
        });

        return {
            logicalId,
            physicalId,
            resourceType,
            templateSnippet,
            properties: resourceDetails.properties,
        };
    }

    /**
     * Import orphaned resources with automatic logical ID mapping
     * Uses template comparison to find correct logical IDs
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Target stack
     * @param {Array} params.orphanedResources - Orphaned resources to import
     * @param {string} params.buildTemplatePath - Path to .serverless/cloudformation-template-update-stack.json
     * @returns {Promise<Object>} Import result with mappings
     */
    async importWithLogicalIdMapping({ stackIdentifier, orphanedResources, buildTemplatePath }) {
        // 1. Validate build template exists
        if (!buildTemplatePath) {
            throw new Error('buildTemplatePath is required');
        }

        const fs = require('fs');
        if (!fs.existsSync(buildTemplatePath)) {
            throw new Error(
                `Build template not found at: ${buildTemplatePath}\n\n` +
                `Please run one of:\n` +
                `  • serverless package\n` +
                `  • frigg build\n` +
                `  • frigg deploy --stage dev\n\n` +
                `Then try again:\n` +
                `  frigg repair --import ${stackIdentifier.stackName}`
            );
        }

        // 2. Parse build template
        const buildTemplate = this.templateParser.parseTemplate(buildTemplatePath);

        // 3. Get deployed template from CloudFormation
        if (!this.stackRepository) {
            throw new Error('stackRepository is required for template comparison');
        }

        const deployedTemplate = await this.stackRepository.getTemplate(stackIdentifier);

        // 4. Map orphaned resources to logical IDs
        const mappings = await this.logicalIdMapper.mapOrphanedResourcesToLogicalIds({
            orphanedResources,
            buildTemplate,
            deployedTemplate,
        });

        // 5. Filter out unmapped resources
        const mappedResources = mappings.filter((m) => m.logicalId !== null);
        const unmappedResources = mappings.filter((m) => m.logicalId === null);

        if (mappedResources.length === 0) {
            return {
                success: false,
                message: 'No resources could be mapped to logical IDs',
                unmappedCount: unmappedResources.length,
                unmappedResources,
            };
        }

        // 6. Deduplicate: Select ONE resource per logical ID based on deployed template
        const { selectedResources, duplicates } = this._deduplicateResourcesByLogicalId(
            mappedResources,
            deployedTemplate
        );

        // 7. Check for warnings
        const multiResourceWarnings = this._checkForMultipleResources(duplicates);

        // 8. Generate import-resources.json format using SELECTED resources
        const resourcesToImport = selectedResources.map((mapping) => ({
            ResourceType: mapping.resourceType,
            LogicalResourceId: mapping.logicalId,
            ResourceIdentifier: this._getResourceIdentifier(mapping),
        }));

        // 9. Return result with deduplication info
        return {
            success: true,
            mappedCount: selectedResources.length,
            unmappedCount: unmappedResources.length,
            duplicatesRemoved: duplicates.length,
            mappings: selectedResources,
            unmappedResources,
            duplicates, // Resources that were filtered out
            resourcesToImport,
            warnings: multiResourceWarnings,
            buildTemplatePath,
            deployedTemplatePath: 'CloudFormation (deployed)',
        };
    }

    /**
     * Deduplicate resources: Select ONE resource per logical ID
     * When multiple resources have the same logical ID, pick the one that's
     * actually referenced in the deployed template.
     *
     * @param {Array} mappedResources - Resources with logical IDs
     * @param {Object} deployedTemplate - Deployed CloudFormation template
     * @returns {Object} { selectedResources, duplicates }
     * @private
     */
    _deduplicateResourcesByLogicalId(mappedResources, deployedTemplate) {
        // Group resources by logical ID
        const byLogicalId = {};
        mappedResources.forEach((resource) => {
            if (!byLogicalId[resource.logicalId]) {
                byLogicalId[resource.logicalId] = [];
            }
            byLogicalId[resource.logicalId].push(resource);
        });

        // Extract all physical IDs referenced in deployed template
        const referencedIds = this._extractReferencedIdsFromTemplate(deployedTemplate);

        const selectedResources = [];
        const duplicates = [];

        // For each logical ID, select ONE resource
        Object.entries(byLogicalId).forEach(([logicalId, resources]) => {
            if (resources.length === 1) {
                // Only one resource - select it
                selectedResources.push(resources[0]);
            } else {
                // Multiple resources - pick the one in deployed template
                let selected = null;

                // Try to find resource that's actually referenced
                for (const resource of resources) {
                    if (this._isResourceReferenced(resource, referencedIds)) {
                        selected = resource;
                        break;
                    }
                }

                // Fallback: If none are referenced, pick first one
                if (!selected) {
                    selected = resources[0];
                }

                selectedResources.push(selected);

                // Mark others as duplicates
                resources.forEach((r) => {
                    if (r.physicalId !== selected.physicalId) {
                        duplicates.push(r);
                    }
                });
            }
        });

        return { selectedResources, duplicates };
    }

    /**
     * Extract all physical resource IDs referenced in deployed template
     * Looks for hardcoded IDs in Lambda VPC configs, security group rules, etc.
     * @private
     */
    _extractReferencedIdsFromTemplate(template) {
        const referenced = {
            vpcIds: new Set(),
            subnetIds: new Set(),
            securityGroupIds: new Set(),
        };

        if (!template || !template.resources) {
            return referenced;
        }

        // Traverse all resources in template
        Object.values(template.resources).forEach((resource) => {
            // Lambda VPC config contains hardcoded IDs
            if (
                resource.Type === 'AWS::Lambda::Function' &&
                resource.Properties?.VpcConfig
            ) {
                const { SubnetIds, SecurityGroupIds } = resource.Properties.VpcConfig;

                if (SubnetIds) {
                    SubnetIds.forEach((id) => {
                        if (typeof id === 'string' && id.startsWith('subnet-')) {
                            referenced.subnetIds.add(id);
                        }
                    });
                }

                if (SecurityGroupIds) {
                    SecurityGroupIds.forEach((id) => {
                        if (typeof id === 'string' && id.startsWith('sg-')) {
                            referenced.securityGroupIds.add(id);
                        }
                    });
                }
            }

            // Security group rules may reference other security groups
            if (resource.Type === 'AWS::EC2::SecurityGroupIngress' ||
                resource.Type === 'AWS::EC2::SecurityGroupEgress') {
                const groupId = resource.Properties?.GroupId;
                const sourceSecurityGroupId = resource.Properties?.SourceSecurityGroupId;

                if (typeof groupId === 'string' && groupId.startsWith('sg-')) {
                    referenced.securityGroupIds.add(groupId);
                }
                if (typeof sourceSecurityGroupId === 'string' && sourceSecurityGroupId.startsWith('sg-')) {
                    referenced.securityGroupIds.add(sourceSecurityGroupId);
                }
            }
        });

        return referenced;
    }

    /**
     * Check if a resource is referenced in the deployed template
     * @private
     */
    _isResourceReferenced(resource, referencedIds) {
        const { resourceType, physicalId } = resource;

        if (resourceType === 'AWS::EC2::VPC') {
            return referencedIds.vpcIds.has(physicalId);
        }

        if (resourceType === 'AWS::EC2::Subnet') {
            return referencedIds.subnetIds.has(physicalId);
        }

        if (resourceType === 'AWS::EC2::SecurityGroup') {
            return referencedIds.securityGroupIds.has(physicalId);
        }

        // For other resource types, we can't determine
        return false;
    }

    /**
     * Check for multiple resources of same type
     * Returns warnings when user needs to manually select
     * @private
     */
    _checkForMultipleResources(mappings) {
        const warnings = [];
        const byType = {};

        // Group by resource type
        mappings.forEach((mapping) => {
            if (!byType[mapping.resourceType]) {
                byType[mapping.resourceType] = [];
            }
            byType[mapping.resourceType].push(mapping);
        });

        // Check for multiples
        Object.entries(byType).forEach(([type, resources]) => {
            if (resources.length > 1) {
                const shortType = type.replace('AWS::EC2::', '');
                warnings.push({
                    type: 'MULTIPLE_RESOURCES',
                    resourceType: type,
                    count: resources.length,
                    message: `Multiple ${shortType}s detected (${resources.length}). Review relationships before importing.`,
                    resources: resources.map((r) => ({
                        physicalId: r.physicalId,
                        logicalId: r.logicalId,
                        matchMethod: r.matchMethod,
                        confidence: r.confidence,
                    })),
                });
            }
        });

        return warnings;
    }

    /**
     * Get CloudFormation resource identifier for import
     * @private
     */
    _getResourceIdentifier(mapping) {
        const { resourceType, physicalId } = mapping;

        // Map resource types to their identifier format
        const identifierMap = {
            'AWS::EC2::VPC': { VpcId: physicalId },
            'AWS::EC2::Subnet': { SubnetId: physicalId },
            'AWS::EC2::SecurityGroup': { GroupId: physicalId },
            'AWS::EC2::InternetGateway': { InternetGatewayId: physicalId },
            'AWS::EC2::NatGateway': { NatGatewayId: physicalId },
            'AWS::EC2::RouteTable': { RouteTableId: physicalId },
            'AWS::EC2::VPCEndpoint': { VpcEndpointId: physicalId },
        };

        return identifierMap[resourceType] || { Id: physicalId };
    }
}

module.exports = RepairViaImportUseCase;
