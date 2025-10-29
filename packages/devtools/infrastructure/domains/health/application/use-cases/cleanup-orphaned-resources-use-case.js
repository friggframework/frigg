class CleanupOrphanedResourcesUseCase {
    constructor({
        resourceDetector,
        dependencyAnalyzer,
        deletionPlanner,
        deleterRepository,
        auditRepository,
    }) {
        if (!resourceDetector) {
            throw new Error('resourceDetector is required');
        }
        if (!dependencyAnalyzer) {
            throw new Error('dependencyAnalyzer is required');
        }
        if (!deletionPlanner) {
            throw new Error('deletionPlanner is required');
        }
        if (!deleterRepository) {
            throw new Error('deleterRepository is required');
        }
        if (!auditRepository) {
            throw new Error('auditRepository is required');
        }

        this.resourceDetector = resourceDetector;
        this.dependencyAnalyzer = dependencyAnalyzer;
        this.deletionPlanner = deletionPlanner;
        this.deleterRepository = deleterRepository;
        this.auditRepository = auditRepository;
    }

    async execute({
        stackIdentifier,
        dryRun = true,
        resourceTypeFilter = null,
        logicalIdPattern = null,
        onProgress = null,
    }) {
        const orphanedResources = await this.resourceDetector.findOrphanedResources(
            stackIdentifier,
            []
        );

        let filteredResources = orphanedResources;

        if (resourceTypeFilter) {
            filteredResources = filteredResources.filter(
                (r) => r.resourceType === resourceTypeFilter
            );
        }

        if (logicalIdPattern) {
            const regex = new RegExp(logicalIdPattern.replace(/\*/g, '.*'));
            filteredResources = filteredResources.filter((r) => regex.test(r.logicalId));
        }

        if (filteredResources.length === 0) {
            return {
                success: true,
                message: 'No orphaned resources found',
                deletedCount: 0,
                skippedCount: 0,
            };
        }

        const dependencyAnalysis = await this.dependencyAnalyzer.analyzeDependencies(
            filteredResources
        );

        const deletionPlan = this.deletionPlanner.createDeletionPlan({
            resources: filteredResources,
            dependencyAnalysis,
        });

        if (dryRun) {
            return {
                dryRun: true,
                deletionPlan,
                message: 'Dry-run complete. No resources were deleted.',
            };
        }

        const deletionResult = await this._executeDeletionPlan(
            deletionPlan,
            stackIdentifier,
            onProgress
        );

        await this.auditRepository.logCleanupOperation({
            stackIdentifier,
            deletionPlan,
            result: deletionResult,
            timestamp: new Date().toISOString(),
        });

        return {
            success: true,
            dryRun: false,
            deletedCount: deletionResult.successCount,
            failedCount: deletionResult.failedCount,
            skippedCount: deletionPlan.blockedCount,
            deletionResult,
            costSavings: deletionPlan.costSavings,
        };
    }

    async _executeDeletionPlan(deletionPlan, stackIdentifier, onProgress) {
        const results = {
            successCount: 0,
            failedCount: 0,
            phaseResults: {},
        };

        const phases = ['phase1', 'phase2', 'phase3'];

        for (const phase of phases) {
            const resources = deletionPlan.phases[phase];

            if (resources.length === 0) {
                continue;
            }

            if (onProgress) {
                onProgress({
                    phase,
                    message: `Deleting ${resources.length} resources in ${phase}`,
                });
            }

            const phaseResult = await this.deleterRepository.deleteResourceBatch(
                resources,
                onProgress
            );

            results.successCount += phaseResult.successCount;
            results.failedCount += phaseResult.failedCount;
            results.phaseResults[phase] = phaseResult;

            for (const result of phaseResult.results) {
                await this.auditRepository.logDeletionAttempt({
                    physicalId: result.physicalId,
                    resourceType: result.resourceType,
                    success: result.success,
                    error: result.error,
                    errorMessage: result.message,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        return results;
    }
}

module.exports = CleanupOrphanedResourcesUseCase;
