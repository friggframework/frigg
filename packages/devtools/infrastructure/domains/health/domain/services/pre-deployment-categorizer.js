const BlockingCategory = require('../value-objects/blocking-category');
const Issue = require('../entities/issue');

class PreDeploymentCategorizer {
    static BLOCKING_STACK_STATES = [
        'CREATE_FAILED',
        'ROLLBACK_COMPLETE',
        'ROLLBACK_FAILED',
        'UPDATE_ROLLBACK_FAILED',
        'DELETE_IN_PROGRESS',
        'DELETE_FAILED',
    ];

    static BLOCKING_ORPHAN_TYPES = [
        'AWS::KMS::Alias',
        'AWS::KMS::Key',
        'AWS::EC2::VPC',
        'AWS::S3::Bucket',
        'AWS::Lambda::Function',
        'AWS::RDS::DBInstance',
        'AWS::DynamoDB::Table',
    ];

    categorize(issue) {
        if (this._isInvalidStackState(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                description: `Stack state ${issue.stackStatus} prevents deployment`,
            });
        }

        if (this._isBlockingOrphan(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE,
                description: `Orphaned ${issue.resourceType} will cause AlreadyExistsException`,
            });
        }

        if (this._isQuotaExceeded(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.QUOTA_EXCEEDED,
                description: `${issue.resourceType} quota exceeded`,
            });
        }

        if (this._isMissingDependency(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.MISSING_DEPENDENCY,
                description: `Missing dependency: ${issue.description}`,
            });
        }

        if (this._isImmutablePropertyMismatch(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: 'IMMUTABLE_PROPERTY_DRIFT',
                description: `Immutable property drift requires replacement`,
            });
        }

        if (this._isMutablePropertyMismatch(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.WARNING,
                reason: 'PROPERTY_DRIFT',
                description: 'Mutable property drift detected',
            });
        }

        return new BlockingCategory({
            category: BlockingCategory.CATEGORIES.INFO,
            reason: 'OTHER',
            description: issue.description,
        });
    }

    _isInvalidStackState(issue) {
        return issue.stackStatus &&
               PreDeploymentCategorizer.BLOCKING_STACK_STATES.includes(issue.stackStatus);
    }

    _isBlockingOrphan(issue) {
        return issue.isOrphanedResource &&
               issue.isOrphanedResource() &&
               PreDeploymentCategorizer.BLOCKING_ORPHAN_TYPES.includes(issue.resourceType);
    }

    _isQuotaExceeded(issue) {
        return issue.type === 'QUOTA_EXCEEDED';
    }

    _isMissingDependency(issue) {
        return issue.type === 'MISSING_DEPENDENCY';
    }

    _isImmutablePropertyMismatch(issue) {
        return issue.isPropertyMismatch &&
               issue.isPropertyMismatch() &&
               issue.propertyMismatch &&
               issue.propertyMismatch.requiresReplacement();
    }

    _isMutablePropertyMismatch(issue) {
        return issue.isPropertyMismatch &&
               issue.isPropertyMismatch() &&
               issue.propertyMismatch &&
               !issue.propertyMismatch.requiresReplacement();
    }
}

module.exports = PreDeploymentCategorizer;
