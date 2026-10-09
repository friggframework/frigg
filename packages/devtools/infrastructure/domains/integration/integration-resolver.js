/**
 * Integration Resource Resolver
 *
 * Domain Layer - Hexagonal Architecture
 *
 * Responsible for resolving ownership decisions for integration infrastructure:
 * - SQS queues per integration
 *
 * Follows the ownership-based architecture pattern:
 * - STACK: Create/manage resources in CloudFormation stack
 * - EXTERNAL: Use existing resources by physical ID
 * - AUTO: Intelligent decision based on discovery
 */

const BaseResourceResolver = require('../shared/base-resolver');
const { ResourceOwnership } = require('../shared/types/resource-ownership');

class IntegrationResourceResolver extends BaseResourceResolver {
    /**
     * Resolve ownership for all integration resources
     * @param {Object} appDefinition - Application definition
     * @param {Object} discovery - Structured discovery result
     * @returns {Object} Ownership decisions for all integration resources
     */
    resolveAll(appDefinition, discovery) {
        const integrations = appDefinition.integrations || [];
        const decisions = {
            // Shared resources used by all integrations
            internalErrorQueue: this.resolveInternalErrorQueue(appDefinition, discovery),
            // Per-integration queues
            integrations: {},
        };

        // Resolve ownership for each integration's SQS queue
        integrations.forEach(integration => {
            const integrationName = integration.Definition?.name;
            if (!integrationName) {
                return; // Skip invalid integrations
            }

            decisions.integrations[integrationName] = {
                queue: this.resolveQueue(integrationName, appDefinition, discovery),
            };
        });

        return decisions;
    }

    /**
     * Resolve ownership for the shared InternalErrorQueue (dead letter queue)
     * @param {Object} appDefinition - Application definition
     * @param {Object} discovery - Structured discovery result
     * @returns {Object} Ownership decision for InternalErrorQueue
     */
    resolveInternalErrorQueue(appDefinition, discovery) {
        const userIntent = appDefinition.integrations?.ownership?.internalErrorQueue || ResourceOwnership.AUTO;
        const queueLogicalId = 'InternalErrorQueue';
        const inStack = this.isInStack(queueLogicalId, discovery);

        // STACK: User wants this in the CloudFormation stack
        if (userIntent === ResourceOwnership.STACK) {
            const stackResource = inStack ? this.findInStack(queueLogicalId, discovery) : null;
            return this.createStackDecision(
                stackResource?.physicalId || null,
                inStack
                    ? `Found ${queueLogicalId} in CloudFormation stack`
                    : `Will create ${queueLogicalId} in stack`
            );
        }

        // EXTERNAL: User wants to use an existing queue
        if (userIntent === ResourceOwnership.EXTERNAL) {
            const queueArn = appDefinition.integrations?.internalErrorQueue?.arn;
            if (!queueArn) {
                throw new Error(
                    'InternalErrorQueue configured with ownership=external but integrations.internalErrorQueue.arn not provided'
                );
            }
            return this.createExternalDecision(
                queueArn,
                `Using external InternalErrorQueue ARN: ${queueArn}`
            );
        }

        // AUTO: Intelligent decision based on discovery
        if (inStack) {
            const stackResource = this.findInStack(queueLogicalId, discovery);
            return this.createStackDecision(
                stackResource.physicalId,
                `Found ${queueLogicalId} in CloudFormation stack - will include definition (idempotent)`
            );
        }

        // Default: Create in stack
        return this.createStackDecision(
            null,
            `No existing ${queueLogicalId} found - will create in stack`
        );
    }

    /**
     * Resolve ownership for an integration's SQS queue
     * @param {string} integrationName - Name of the integration (e.g., 'slack')
     * @param {Object} appDefinition - Application definition
     * @param {Object} discovery - Structured discovery result
     * @returns {Object} Ownership decision for the queue
     */
    resolveQueue(integrationName, appDefinition, discovery) {
        // Check for explicit ownership configuration
        const integration = appDefinition.integrations?.find(
            i => i.Definition?.name === integrationName
        );
        const userIntent = integration?.ownership?.queue || ResourceOwnership.AUTO;

        // Queue logical ID follows pattern: ${IntegrationName}Queue (e.g., SlackQueue)
        const queueLogicalId = `${this.capitalizeFirst(integrationName)}Queue`;
        const inStack = this.isInStack(queueLogicalId, discovery);

        // STACK: User wants this in the CloudFormation stack
        if (userIntent === ResourceOwnership.STACK) {
            const stackResource = inStack ? this.findInStack(queueLogicalId, discovery) : null;
            return this.createStackDecision(
                stackResource?.physicalId || null,
                inStack
                    ? `Found ${queueLogicalId} in CloudFormation stack`
                    : `Will create ${queueLogicalId} in stack`
            );
        }

        // EXTERNAL: User wants to use an existing queue
        if (userIntent === ResourceOwnership.EXTERNAL) {
            const queueUrl = integration?.queue?.url;
            if (!queueUrl) {
                throw new Error(
                    `Integration '${integrationName}' configured with ownership=external but queue.url not provided`
                );
            }
            return this.createExternalDecision(
                queueUrl,
                `Using external queue URL: ${queueUrl}`
            );
        }

        // AUTO: Intelligent decision based on discovery
        if (inStack) {
            const stackResource = this.findInStack(queueLogicalId, discovery);
            return this.createStackDecision(
                stackResource.physicalId,
                `Found ${queueLogicalId} in CloudFormation stack - will include definition (idempotent)`
            );
        }

        // Default: Create in stack
        return this.createStackDecision(
            null,
            `No existing ${queueLogicalId} found - will create in stack`
        );
    }

    /**
     * Capitalize first letter of string (e.g., 'slack' -> 'Slack')
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

module.exports = IntegrationResourceResolver;
