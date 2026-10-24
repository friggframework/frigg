/**
 * Aurora Resource Resolver
 *
 * Resolves ownership for Aurora PostgreSQL resources following the ownership-based architecture.
 *
 * Resources managed:
 * - Aurora Cluster (RDS::DBCluster)
 * - Aurora Instance (RDS::DBInstance)
 * - DB Subnet Group (RDS::DBSubnetGroup)
 * - DB Secret (SecretsManager::Secret)
 *
 * Ownership types:
 * - STACK: Resource defined in our CloudFormation template (use Refs)
 * - EXTERNAL: Resource outside our stack (use physical IDs)
 * - AUTO: System decides based on discovery
 */

const BaseResourceResolver = require('../shared/base-resolver');
const { ResourceOwnership } = require('../shared/types/resource-ownership');

class AuroraResourceResolver extends BaseResourceResolver {
    /**
     * Resolve Aurora Cluster ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveCluster(appDefinition, discovery) {
        const userIntent = appDefinition.database?.postgres?.ownership?.cluster || 'auto';

        // Explicit external - use provided cluster identifier
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.database?.postgres?.external?.clusterIdentifier,
                'clusterIdentifier'
            );
            return this.createExternalDecision(
                appDefinition.database.postgres.external.clusterIdentifier,
                'User specified ownership=external for Aurora cluster'
            );
        }

        // For stack or auto: check if cluster exists in stack
        const inStack = this.findInStack('FriggAuroraCluster', discovery);

        if (inStack) {
            return this.createStackDecision(
                inStack.physicalId,
                'Found FriggAuroraCluster in CloudFormation stack'
            );
        }

        // Check for external cluster
        const external = this.findExternal('AWS::RDS::DBCluster', discovery);
        if (external && userIntent === 'auto') {
            return this.createExternalDecision(
                external.physicalId,
                'Found external Aurora cluster via discovery'
            );
        }

        // Create new cluster in stack
        return this.createStackDecision(
            null,
            'No existing Aurora cluster - will create in stack'
        );
    }

    /**
     * Resolve Aurora Instance ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveInstance(appDefinition, discovery) {
        const userIntent = appDefinition.database?.postgres?.ownership?.instance || 'auto';

        // Explicit external
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.database?.postgres?.external?.instanceIdentifier,
                'instanceIdentifier'
            );
            return this.createExternalDecision(
                appDefinition.database.postgres.external.instanceIdentifier,
                'User specified ownership=external for Aurora instance'
            );
        }

        // Check if instance exists in stack
        const inStack = this.findInStack('FriggAuroraInstance', discovery);

        if (inStack) {
            return this.createStackDecision(
                inStack.physicalId,
                'Found FriggAuroraInstance in CloudFormation stack'
            );
        }

        // Check for external instance
        const external = this.findExternal('AWS::RDS::DBInstance', discovery);
        if (external && userIntent === 'auto') {
            return this.createExternalDecision(
                external.physicalId,
                'Found external Aurora instance via discovery'
            );
        }

        // Create new instance in stack
        return this.createStackDecision(
            null,
            'No existing Aurora instance - will create in stack'
        );
    }

    /**
     * Resolve DB Subnet Group ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveSubnetGroup(appDefinition, discovery) {
        const userIntent = appDefinition.database?.postgres?.ownership?.subnetGroup || 'auto';

        // Explicit external
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.database?.postgres?.external?.subnetGroupName,
                'subnetGroupName'
            );
            return this.createExternalDecision(
                appDefinition.database.postgres.external.subnetGroupName,
                'User specified ownership=external for DB subnet group'
            );
        }

        // Check if subnet group exists in stack
        const inStack = this.findInStack('FriggDBSubnetGroup', discovery);

        if (inStack) {
            return this.createStackDecision(
                inStack.physicalId,
                'Found FriggDBSubnetGroup in CloudFormation stack'
            );
        }

        // For subnet groups, always create in stack (they're cheap and cluster-specific)
        return this.createStackDecision(
            null,
            'No existing DB subnet group - will create in stack'
        );
    }

    /**
     * Resolve DB Secret ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveSecret(appDefinition, discovery) {
        const userIntent = appDefinition.database?.postgres?.ownership?.secret || 'auto';

        // Explicit external - use provided secret ARN
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.database?.postgres?.external?.secretArn,
                'secretArn'
            );
            return this.createExternalDecision(
                appDefinition.database.postgres.external.secretArn,
                'User specified ownership=external for DB secret'
            );
        }

        // Check if secret exists in stack
        const inStack = this.findInStack('FriggDBSecret', discovery);

        if (inStack) {
            return this.createStackDecision(
                inStack.physicalId,
                'Found FriggDBSecret in CloudFormation stack'
            );
        }

        // For secrets tied to the cluster, always create in stack
        return this.createStackDecision(
            null,
            'No existing DB secret - will create in stack'
        );
    }

    /**
     * Resolve all Aurora resources at once
     * Convenience method that returns decisions for all Aurora resources
     *
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Decisions for all Aurora resources
     */
    resolveAll(appDefinition, discovery) {
        return {
            cluster: this.resolveCluster(appDefinition, discovery),
            instance: this.resolveInstance(appDefinition, discovery),
            subnetGroup: this.resolveSubnetGroup(appDefinition, discovery),
            secret: this.resolveSecret(appDefinition, discovery)
        };
    }
}

module.exports = AuroraResourceResolver;
