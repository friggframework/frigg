/**
 * Migration Resource Resolver
 *
 * Resolves migration resource ownership based on user intent and discovered resources.
 *
 * Migration resources:
 * - S3 bucket for migration status tracking
 * - SQS queue for migration jobs
 *
 * Ownership Resolution Logic:
 * - User sets 'stack' → Create resources in CloudFormation stack
 * - User sets 'external' → Use existing resources (discovered)
 * - User sets 'auto' (or unspecified):
 *   - If resources found in stack → Use stack resources (STACK)
 *   - If resources found externally → Use external resources (EXTERNAL)
 *   - If nothing found → Create in stack (STACK)
 */

const BaseResourceResolver = require('../shared/base-resolver');
const { ResourceOwnership } = require('../shared/types');

class MigrationResourceResolver extends BaseResourceResolver {
    constructor() {
        super();
    }

    /**
     * Resolve S3 migration status bucket ownership
     * @param {Object} appDefinition - Application definition
     * @param {Object} discovery - Structured discovery result
     * @returns {Object} Ownership decision with metadata
     */
    resolveBucket(appDefinition, discovery) {
        // Get user intent from app definition
        const userIntent = appDefinition.migration?.ownership?.bucket || ResourceOwnership.AUTO;

        // Check if bucket exists in CloudFormation stack
        const inStack = this.isInStack('FriggMigrationStatusBucket', discovery);

        if (userIntent === ResourceOwnership.STACK) {
            // Explicit: Create/manage in stack
            const stackResource = inStack ? this.findInStack('FriggMigrationStatusBucket', discovery) : null;
            return this.createStackDecision(
                stackResource?.physicalId || null,
                inStack ? 'Found FriggMigrationStatusBucket in CloudFormation stack' : 'Will create FriggMigrationStatusBucket in stack'
            );
        }

        if (userIntent === ResourceOwnership.EXTERNAL) {
            // Explicit: Use external bucket
            const external = this.findExternal('AWS::S3::Bucket', discovery);
            if (!external) {
                throw new Error(
                    'ownership.bucket=external but no S3 bucket discovered. ' +
                    'Provide migrationStatusBucket in discoveredResources or set ownership.bucket=stack'
                );
            }
            return this.createExternalDecision(
                external.physicalId,
                'Using external S3 bucket per ownership.bucket=external'
            );
        }

        // AUTO resolution
        if (inStack) {
            const stackResource = this.findInStack('FriggMigrationStatusBucket', discovery);
            return this.createStackDecision(
                stackResource.physicalId,
                'Found FriggMigrationStatusBucket in CloudFormation stack'
            );
        }

        // Check for external bucket
        const external = this.findExternal('AWS::S3::Bucket', discovery);
        if (external) {
            return this.createExternalDecision(
                external.physicalId,
                'Found external S3 bucket via discovery'
            );
        }

        // No bucket found - create in stack
        return this.createStackDecision(
            null,
            'No existing migration bucket - will create in stack'
        );
    }

    /**
     * Resolve SQS migration queue ownership
     * @param {Object} appDefinition - Application definition
     * @param {Object} discovery - Structured discovery result
     * @returns {Object} Ownership decision with metadata
     */
    resolveQueue(appDefinition, discovery) {
        // Get user intent from app definition
        const userIntent = appDefinition.migration?.ownership?.queue || ResourceOwnership.AUTO;

        // Check if queue exists in CloudFormation stack
        const inStack = this.isInStack('DbMigrationQueue', discovery);

        if (userIntent === ResourceOwnership.STACK) {
            // Explicit: Create/manage in stack
            const stackResource = inStack ? this.findInStack('DbMigrationQueue', discovery) : null;
            return this.createStackDecision(
                stackResource?.physicalId || null,
                inStack ? 'Found DbMigrationQueue in CloudFormation stack' : 'Will create DbMigrationQueue in stack'
            );
        }

        if (userIntent === ResourceOwnership.EXTERNAL) {
            // Explicit: Use external queue
            const external = this.findExternal('AWS::SQS::Queue', discovery);
            if (!external) {
                throw new Error(
                    'ownership.queue=external but no SQS queue discovered. ' +
                    'Provide migrationQueueUrl in discoveredResources or set ownership.queue=stack'
                );
            }
            return this.createExternalDecision(
                external.physicalId,
                'Using external SQS queue per ownership.queue=external'
            );
        }

        // AUTO resolution
        if (inStack) {
            const stackResource = this.findInStack('DbMigrationQueue', discovery);
            return this.createStackDecision(
                stackResource.physicalId,
                'Found DbMigrationQueue in CloudFormation stack'
            );
        }

        // Check for external queue
        const external = this.findExternal('AWS::SQS::Queue', discovery);
        if (external) {
            return this.createExternalDecision(
                external.physicalId,
                'Found external SQS queue via discovery'
            );
        }

        // No queue found - create in stack
        return this.createStackDecision(
            null,
            'No existing migration queue - will create in stack'
        );
    }

    /**
     * Resolve all migration resources
     * Convenience method for resolving all migration resource ownership
     */
    resolveAll(appDefinition, discovery) {
        return {
            bucket: this.resolveBucket(appDefinition, discovery),
            queue: this.resolveQueue(appDefinition, discovery),
        };
    }
}

module.exports = { MigrationResourceResolver };
