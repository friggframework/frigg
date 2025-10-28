const { ChangeSetSummary } = require('../value-objects/ChangeSetSummary');

class ChangeSetAnalyzer {
    analyzeChangeSet(changeSet) {
        if (!changeSet || !changeSet.Changes) {
            return {
                summary: ChangeSetSummary.empty(),
                criticalChanges: [],
                warnings: [],
                impact: this._calculateImpact([]),
            };
        }

        const summary = ChangeSetSummary.fromChanges(changeSet.Changes);
        const criticalChanges = this._identifyCriticalChanges(changeSet.Changes);
        const warnings = this._generateWarnings(changeSet.Changes);
        const impact = this._calculateImpact(changeSet.Changes);

        return {
            summary,
            criticalChanges,
            warnings,
            impact,
        };
    }

    _identifyCriticalChanges(changes) {
        const critical = [];

        for (const change of changes) {
            const resourceChange = change.ResourceChange;
            if (!resourceChange) continue;

            if (resourceChange.Replacement === 'True') {
                critical.push({
                    logicalId: resourceChange.LogicalResourceId,
                    physicalId: resourceChange.PhysicalResourceId,
                    resourceType: resourceChange.ResourceType,
                    action: resourceChange.Action,
                    reason: 'Requires replacement',
                    severity: 'high',
                });
            }

            if (resourceChange.Action === 'Remove') {
                critical.push({
                    logicalId: resourceChange.LogicalResourceId,
                    physicalId: resourceChange.PhysicalResourceId,
                    resourceType: resourceChange.ResourceType,
                    action: 'Remove',
                    reason: 'Resource will be deleted',
                    severity: 'high',
                });
            }
        }

        return critical;
    }

    _generateWarnings(changes) {
        const warnings = [];

        for (const change of changes) {
            const resourceChange = change.ResourceChange;
            if (!resourceChange) continue;

            if (resourceChange.ResourceType === 'AWS::Lambda::Function') {
                const vpcChange = this._hasVpcChange(resourceChange);
                if (vpcChange) {
                    warnings.push({
                        logicalId: resourceChange.LogicalResourceId,
                        type: 'VPC_CONFIGURATION_CHANGE',
                        message: 'VPC configuration change - Lambda function will experience cold start',
                        severity: 'medium',
                    });
                }
            }

            if (
                resourceChange.ResourceType === 'AWS::RDS::DBInstance' ||
                resourceChange.ResourceType === 'AWS::RDS::DBCluster'
            ) {
                if (resourceChange.Action === 'Modify' || resourceChange.Replacement === 'True') {
                    warnings.push({
                        logicalId: resourceChange.LogicalResourceId,
                        type: 'DATABASE_MODIFICATION',
                        message: 'Database modification detected - potential downtime',
                        severity: 'high',
                    });
                }
            }

            if (resourceChange.Replacement === 'Conditional') {
                warnings.push({
                    logicalId: resourceChange.LogicalResourceId,
                    type: 'CONDITIONAL_REPLACEMENT',
                    message: 'Resource may require replacement depending on property values',
                    severity: 'medium',
                });
            }
        }

        return warnings;
    }

    _hasVpcChange(resourceChange) {
        if (!resourceChange.Details) return false;

        return resourceChange.Details.some(
            (detail) =>
                detail.Target?.Attribute === 'VpcConfig' ||
                detail.Target?.Name === 'VpcConfig'
        );
    }

    _calculateImpact(changes) {
        const lambdaFunctionsAffected = changes.filter(
            (c) => c.ResourceChange?.ResourceType === 'AWS::Lambda::Function'
        ).length;

        const databasesAffected = changes.filter(
            (c) =>
                c.ResourceChange?.ResourceType === 'AWS::RDS::DBInstance' ||
                c.ResourceChange?.ResourceType === 'AWS::RDS::DBCluster'
        ).length;

        const replacements = changes.filter(
            (c) => c.ResourceChange?.Replacement === 'True'
        ).length;

        let estimatedDowntime = 'None expected';
        if (replacements > 0) {
            estimatedDowntime = '2-5 minutes';
        }
        if (databasesAffected > 0) {
            estimatedDowntime = '5-15 minutes';
        }

        return {
            lambdaFunctionsAffected,
            databasesAffected,
            replacements,
            estimatedDowntime,
            coldStartsExpected: lambdaFunctionsAffected > 0,
            breakingChanges: replacements > 0 || databasesAffected > 0,
        };
    }
}

module.exports = { ChangeSetAnalyzer };
