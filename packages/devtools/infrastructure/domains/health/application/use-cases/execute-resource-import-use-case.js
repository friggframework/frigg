/**
 * ExecuteResourceImportUseCase - Execute CloudFormation Resource Import
 *
 * Application Layer - Use Case
 *
 * Business logic for executing CloudFormation import operations for orphaned resources.
 * Orchestrates the complete import workflow including template generation, change set
 * creation, execution monitoring, and verification.
 *
 * Responsibilities:
 * - Generate import template from resources and build template
 * - Create and execute CloudFormation import change set
 * - Monitor import progress with resource-level updates
 * - Verify imported resources are present in stack
 * - Report detailed progress and results
 *
 * Based on: SPEC-IMPORT-EXECUTION.md (lines 712-867)
 */

class ExecuteResourceImportUseCase {
    /**
     * Create use case with required dependencies
     *
     * @param {Object} params
     * @param {Object} params.importTemplateGenerator - Generates import templates
     * @param {Object} params.importProgressMonitor - Monitors import operations
     * @param {Object} params.cloudFormationRepository - CloudFormation operations
     * @param {Object} params.stackRepository - Stack template operations
     */
    constructor({ importTemplateGenerator, importProgressMonitor, cloudFormationRepository, stackRepository }) {
        if (!importTemplateGenerator) {
            throw new Error('importTemplateGenerator is required');
        }
        if (!importProgressMonitor) {
            throw new Error('importProgressMonitor is required');
        }
        if (!cloudFormationRepository) {
            throw new Error('cloudFormationRepository is required');
        }
        if (!stackRepository) {
            throw new Error('stackRepository is required');
        }

        this.templateGenerator = importTemplateGenerator;
        this.progressMonitor = importProgressMonitor;
        this.cfRepo = cloudFormationRepository;
        this.stackRepo = stackRepository;
    }

    /**
     * Execute complete CloudFormation import workflow
     *
     * Orchestrates the full import process:
     * 1. Generate import template
     * 2. Create CloudFormation change set
     * 3. Wait for change set to be ready
     * 4. Execute change set
     * 5. Monitor import progress
     * 6. Verify imported resources
     *
     * @param {Object} params
     * @param {Object} params.stackIdentifier - Stack name and region
     * @param {Array<Object>} params.resourcesToImport - Resources to import
     * @param {string} params.buildTemplatePath - Path to build template
     * @param {Function} [params.onProgress] - Progress callback
     * @returns {Promise<Object>} Import result with verification details
     */
    async execute({ stackIdentifier, resourcesToImport, buildTemplatePath, onProgress }) {
        try {
            // Step 1: Generate import template
            if (onProgress) {
                onProgress({ step: 'generate_template', status: 'in_progress' });
            }

            const { template, resourceIdentifiers } = await this.templateGenerator.generateImportTemplate({
                resourcesToImport,
                buildTemplatePath,
                stackIdentifier,
            });

            if (onProgress) {
                onProgress({ step: 'generate_template', status: 'complete' });
            }

            // Step 2: Create CloudFormation change set
            if (onProgress) {
                onProgress({ step: 'create_change_set', status: 'in_progress' });
            }

            const changeSetName = `import-orphaned-resources-${Date.now()}`;
            const changeSet = await this.cfRepo.createChangeSet({
                stackIdentifier,
                changeSetName,
                changeSetType: 'IMPORT',
                template,
                resourcesToImport: resourceIdentifiers,
            });

            if (onProgress) {
                onProgress({
                    step: 'create_change_set',
                    status: 'complete',
                    changeSetName,
                    changeSetId: changeSet.Id,
                });
            }

            // Step 3: Wait for change set to be ready
            if (onProgress) {
                onProgress({ step: 'wait_change_set', status: 'in_progress' });
            }

            await this.cfRepo.waitForChangeSet({ stackIdentifier, changeSetName });

            if (onProgress) {
                onProgress({ step: 'wait_change_set', status: 'complete' });
            }

            // Step 4: Execute change set
            if (onProgress) {
                onProgress({ step: 'execute_import', status: 'in_progress' });
            }

            await this.cfRepo.executeChangeSet({ stackIdentifier, changeSetName });

            // Step 5: Monitor import progress
            const resourceLogicalIds = resourcesToImport.map((r) => r.logicalId);
            const importResult = await this.progressMonitor.monitorImport({
                stackIdentifier,
                resourceLogicalIds,
                onProgress: (progress) => {
                    if (onProgress) {
                        onProgress({
                            step: 'execute_import',
                            status: 'in_progress',
                            resourceProgress: progress,
                        });
                    }
                },
            });

            if (onProgress) {
                onProgress({ step: 'execute_import', status: 'complete' });
            }

            // Step 6: Verify imported resources
            if (onProgress) {
                onProgress({ step: 'verify', status: 'in_progress' });
            }

            const verification = await this._verifyImportedResources({
                stackIdentifier,
                resourceLogicalIds,
            });

            if (onProgress) {
                onProgress({ step: 'verify', status: 'complete' });
            }

            // Return success result with verification details
            return {
                success: true,
                importedCount: importResult.importedCount,
                failedCount: importResult.failedCount,
                changeSetName,
                stackStatus: verification.stackStatus,
                verifiedResources: verification.resources,
            };
        } catch (error) {
            // Return error with step information
            return {
                success: false,
                error: error.message,
                step: error.step || 'unknown',
            };
        }
    }

    /**
     * Verify that imported resources are present in the CloudFormation stack
     *
     * Checks that each logical ID corresponds to an actual resource in the stack
     * and retrieves physical IDs and resource types for verification.
     *
     * @param {Object} params
     * @param {Object} params.stackIdentifier - Stack name and region
     * @param {Array<string>} params.resourceLogicalIds - Logical IDs to verify
     * @returns {Promise<Object>} Verification result with resource details
     * @private
     */
    async _verifyImportedResources({ stackIdentifier, resourceLogicalIds }) {
        // Get all resources from the stack
        const stackResources = await this.cfRepo.getStackResources(stackIdentifier);

        // Map each logical ID to its verification status
        const verifiedResources = resourceLogicalIds.map((logicalId) => {
            const resource = stackResources.find((r) => r.LogicalResourceId === logicalId);

            return {
                logicalId,
                verified: !!resource,
                physicalId: resource?.PhysicalResourceId,
                resourceType: resource?.ResourceType,
            };
        });

        // Check if all resources were verified
        const allVerified = verifiedResources.every((r) => r.verified);

        // Get current stack status
        const stackStatus = await this.cfRepo.getStackStatus(stackIdentifier);

        return {
            allVerified,
            resources: verifiedResources,
            stackStatus,
        };
    }
}

module.exports = ExecuteResourceImportUseCase;
