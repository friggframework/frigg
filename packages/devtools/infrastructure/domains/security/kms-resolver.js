/**
 * KMS (Key Management Service) Resource Resolver
 *
 * Resolves KMS key ownership based on user intent and discovered resources.
 *
 * Ownership Resolution Logic:
 * - User sets 'stack' → Create KMS key in CloudFormation stack
 * - User sets 'external' → Use existing KMS key (discovered or env var)
 * - User sets 'auto' (or unspecified):
 *   - If KMS key found in stack → Use stack resource (STACK)
 *   - If KMS key found externally → Use external resource (EXTERNAL)
 *   - If nothing found → Create in stack (STACK)
 */

const BaseResourceResolver = require('../shared/base-resolver');
const { ResourceOwnership } = require('../shared/types');

class KmsResourceResolver extends BaseResourceResolver {
    constructor() {
        super();
    }

    /**
     * Resolve KMS key ownership
     * @param {Object} appDefinition - Application definition
     * @param {Object} discovery - Structured discovery result
     * @returns {Object} Ownership decision with metadata
     */
    resolveKey(appDefinition, discovery) {
        // Get user intent from app definition
        const userIntent = appDefinition.encryption?.ownership?.key || ResourceOwnership.AUTO;

        // Check if KMS key exists in CloudFormation stack
        const inStack = this.isInStack('FriggKMSKey', discovery);

        if (userIntent === ResourceOwnership.STACK) {
            // Explicit: Create/manage in stack
            const stackResource = inStack ? this.findInStack('FriggKMSKey', discovery) : null;
            return this.createStackDecision(
                stackResource?.physicalId || null,
                inStack ? 'Found FriggKMSKey in CloudFormation stack' : 'Will create FriggKMSKey in stack'
            );
        }

        if (userIntent === ResourceOwnership.EXTERNAL) {
            // Explicit: Use external key
            const external = this.findExternal('AWS::KMS::Key', discovery);
            if (!external) {
                throw new Error(
                    'ownership.key=external but no KMS key discovered. ' +
                    'Provide defaultKmsKeyId in discoveredResources or set ownership.key=stack'
                );
            }
            return this.createExternalDecision(
                external.physicalId,
                'Using external KMS key per ownership.key=external'
            );
        }

        // AUTO resolution
        if (inStack) {
            const stackResource = this.findInStack('FriggKMSKey', discovery);
            return this.createStackDecision(
                stackResource.physicalId,
                'Found FriggKMSKey in CloudFormation stack'
            );
        }

        // Check for external KMS key
        const external = this.findExternal('AWS::KMS::Key', discovery);
        if (external) {
            return this.createExternalDecision(
                external.physicalId,
                'Found external KMS key via discovery'
            );
        }

        // No KMS key found - create in stack
        return this.createStackDecision(
            null,
            'No existing KMS key - will create in stack'
        );
    }

    /**
     * Resolve all KMS resources
     * Convenience method for resolving all KMS resource ownership
     */
    resolveAll(appDefinition, discovery) {
        return {
            key: this.resolveKey(appDefinition, discovery),
        };
    }
}

module.exports = { KmsResourceResolver };
