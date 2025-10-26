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
 */

class RepairViaImportUseCase {
    /**
     * Create use case with required dependencies
     *
     * @param {Object} params
     * @param {IResourceImporter} params.resourceImporter - Resource import operations
     * @param {IResourceDetector} params.resourceDetector - Resource discovery and details
     */
    constructor({ resourceImporter, resourceDetector }) {
        if (!resourceImporter) {
            throw new Error('resourceImporter is required');
        }
        if (!resourceDetector) {
            throw new Error('resourceDetector is required');
        }

        this.resourceImporter = resourceImporter;
        this.resourceDetector = resourceDetector;
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
}

module.exports = RepairViaImportUseCase;
