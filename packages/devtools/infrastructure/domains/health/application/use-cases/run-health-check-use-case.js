/**
 * RunHealthCheckUseCase - Orchestrate Complete Stack Health Check
 *
 * Application Layer - Use Case
 *
 * Business logic for the "frigg doctor" command. Orchestrates multiple
 * repositories and domain services to produce a comprehensive health report.
 *
 * Responsibilities:
 * - Coordinate stack information retrieval
 * - Detect drift at stack and resource level
 * - Find orphaned resources
 * - Analyze property mismatches
 * - Calculate health score
 * - Build comprehensive health report
 */

const StackHealthReport = require('../../domain/entities/stack-health-report');
const Resource = require('../../domain/entities/resource');
const Issue = require('../../domain/entities/issue');
const ResourceState = require('../../domain/value-objects/resource-state');

class RunHealthCheckUseCase {
    /**
     * Create use case with required dependencies
     *
     * @param {Object} params
     * @param {IStackRepository} params.stackRepository - Stack operations
     * @param {IResourceDetector} params.resourceDetector - Resource discovery
     * @param {MismatchAnalyzer} params.mismatchAnalyzer - Property drift analysis
     * @param {HealthScoreCalculator} params.healthScoreCalculator - Health scoring
     */
    constructor({ stackRepository, resourceDetector, mismatchAnalyzer, healthScoreCalculator }) {
        if (!stackRepository) {
            throw new Error('stackRepository is required');
        }
        if (!resourceDetector) {
            throw new Error('resourceDetector is required');
        }
        if (!mismatchAnalyzer) {
            throw new Error('mismatchAnalyzer is required');
        }
        if (!healthScoreCalculator) {
            throw new Error('healthScoreCalculator is required');
        }

        this.stackRepository = stackRepository;
        this.resourceDetector = resourceDetector;
        this.mismatchAnalyzer = mismatchAnalyzer;
        this.healthScoreCalculator = healthScoreCalculator;
    }

    /**
     * Execute complete health check for a stack
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack to check
     * @param {Function} params.onProgress - Optional progress callback (step, message)
     * @returns {Promise<StackHealthReport>} Comprehensive health report
     */
    async execute({ stackIdentifier, onProgress }) {
        // Helper to call progress callback if provided
        const progress = (step, message) => {
            if (onProgress) {
                onProgress(step, message);
            }
        };

        // 1. Verify stack exists
        progress('📋 Step 1/5:', 'Verifying stack exists...');
        await this.stackRepository.getStack(stackIdentifier);

        // 2. Detect stack-level drift
        progress('🔍 Step 2/5:', 'Detecting stack drift...');
        const driftDetection = await this.stackRepository.detectStackDrift(stackIdentifier);

        // 3. Get all stack resources
        progress('📊 Step 3/5:', 'Analyzing stack resources...');
        const stackResources = await this.stackRepository.listResources(stackIdentifier);

        // 4. Build resource entities with drift status
        const resources = [];
        const issues = [];

        for (const stackResource of stackResources) {
            let resourceState;

            // Determine resource state
            if (!stackResource.physicalId || stackResource.driftStatus === 'DELETED') {
                // Missing resource (defined in template but doesn't exist in cloud)
                resourceState = ResourceState.MISSING;

                // Create issue for missing resource using factory method
                issues.push(
                    Issue.missingResource({
                        resourceType: stackResource.resourceType,
                        resourceId: stackResource.logicalId,
                        description: `CloudFormation resource ${stackResource.logicalId} (${stackResource.resourceType}) is defined in the template but does not exist in the cloud.`,
                    })
                );
            } else if (stackResource.driftStatus === 'MODIFIED') {
                // Drifted resource - get detailed drift information
                resourceState = ResourceState.DRIFTED;

                const resourceDrift = await this.stackRepository.getResourceDrift(
                    stackIdentifier,
                    stackResource.logicalId
                );

                // Analyze property mismatches using domain service
                if (
                    resourceDrift.propertyDifferences &&
                    resourceDrift.propertyDifferences.length > 0
                ) {
                    const propertyMismatches = this.mismatchAnalyzer.analyze({
                        expected: resourceDrift.expectedProperties,
                        actual: resourceDrift.actualProperties,
                        propertyMutability: {},
                        ignoreProperties: [],
                    });

                    // Create issue for each property mismatch using factory method
                    for (const mismatch of propertyMismatches) {
                        issues.push(
                            Issue.propertyMismatch({
                                resourceType: stackResource.resourceType,
                                resourceId: stackResource.physicalId,
                                mismatch,
                            })
                        );
                    }
                }
            } else {
                // Resource is in sync
                resourceState = ResourceState.IN_STACK;
            }

            // Create resource entity
            // For missing resources, use placeholder physicalId since they don't exist in cloud
            const resource = new Resource({
                logicalId: stackResource.logicalId,
                physicalId: stackResource.physicalId || `missing-${stackResource.logicalId}`,
                resourceType: stackResource.resourceType,
                state: resourceState,
            });

            resources.push(resource);
        }

        // 5. Find orphaned resources (exist in cloud but not in stack)
        progress('🔎 Step 4/5:', 'Checking for orphaned resources...');
        const orphanedResources = await this.resourceDetector.findOrphanedResources({
            stackIdentifier,
            stackResources,
        });

        for (const orphan of orphanedResources) {
            // Create resource entity for orphan
            const orphanResource = new Resource({
                logicalId: null, // No logical ID (not in template)
                physicalId: orphan.physicalId,
                resourceType: orphan.resourceType,
                state: ResourceState.ORPHANED,
            });

            resources.push(orphanResource);

            // Create issue for orphaned resource using factory method
            issues.push(
                Issue.orphanedResource({
                    resourceType: orphan.resourceType,
                    resourceId: orphan.physicalId,
                    description: `Resource ${orphan.physicalId} exists in the cloud but is not managed by CloudFormation stack ${stackIdentifier.stackName}.`,
                })
            );
        }

        // 6. Calculate health score using domain service
        progress('🧮 Step 5/5:', 'Calculating health score...');
        const healthScore = this.healthScoreCalculator.calculate({ resources, issues });

        // 7. Build comprehensive health report (aggregate root)
        const report = new StackHealthReport({
            stackIdentifier,
            healthScore,
            resources,
            issues,
            timestamp: new Date(),
        });

        return report;
    }
}

module.exports = RunHealthCheckUseCase;
