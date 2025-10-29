const ResourceDependencyAnalyzer = require('./resource-dependency-analyzer');

class ResourceDeletionPlanner {
    createDeletionPlan({ resources, dependencyAnalysis }) {
        const deletableResources = resources.filter(
            (r) =>
                !dependencyAnalysis.blockedResources.some(
                    (b) => b.resource.physicalId === r.physicalId
                )
        );

        const dependencyAnalyzer = new ResourceDependencyAnalyzer({
            ec2Client: null,
            elbClient: null,
            rdsClient: null,
            lambdaClient: null,
        });

        const deletionPhases = dependencyAnalyzer.determineDeletionOrder(deletableResources);

        const costSavings = this._calculateCostSavings(deletableResources);
        const warnings = this._generateWarnings(resources, dependencyAnalysis);
        const resourcesByType = this._countResourcesByType(deletableResources);

        return {
            totalResources: resources.length,
            deletableCount: deletableResources.length,
            blockedCount: dependencyAnalysis.blockedResources.length,
            phases: deletionPhases,
            costSavings,
            warnings,
            blockedResources: dependencyAnalysis.blockedResources,
            resourcesByType,
        };
    }

    _calculateCostSavings(resources) {
        let monthlyCost = 0;

        for (const resource of resources) {
            switch (resource.resourceType) {
                case 'AWS::EC2::VPC':
                    monthlyCost += 36;
                    break;
                case 'AWS::EC2::NatGateway':
                    monthlyCost += 36;
                    break;
                case 'AWS::EC2::EIP':
                    monthlyCost += 3.65;
                    break;
            }
        }

        return {
            monthly: monthlyCost,
            annual: monthlyCost * 12,
        };
    }

    _generateWarnings(resources, dependencyAnalysis) {
        const warnings = [
            'This operation cannot be easily undone',
            'Resources will be permanently deleted from AWS',
            'Verify no applications depend on these resources',
        ];

        if (resources.some((r) => r.resourceType === 'AWS::EC2::VPC')) {
            warnings.push('Deleting VPCs will also delete associated default resources');
        }

        if (dependencyAnalysis.blockedResources.length > 0) {
            warnings.push(
                `${dependencyAnalysis.blockedResources.length} resources cannot be deleted due to dependencies`
            );
        }

        return warnings;
    }

    _countResourcesByType(resources) {
        const counts = {};

        for (const resource of resources) {
            if (!counts[resource.resourceType]) {
                counts[resource.resourceType] = 0;
            }
            counts[resource.resourceType]++;
        }

        return counts;
    }
}

module.exports = ResourceDeletionPlanner;
