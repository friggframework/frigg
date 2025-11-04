/**
 * VPC Resource Resolver
 *
 * Resolves ownership for all VPC-related resources:
 * - VPC
 * - Security Group
 * - Subnets
 * - NAT Gateway
 * - VPC Endpoints
 *
 * Concrete implementation of BaseResourceResolver for VPC domain.
 */

const BaseResourceResolver = require('../shared/base-resolver');
const { ResourceOwnership } = require('../shared/types');

class VpcResourceResolver extends BaseResourceResolver {
    /**
     * Resolve VPC ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveVpc(appDefinition, discovery) {
        const userIntent = appDefinition.vpc?.ownership?.vpc || 'auto';

        // Explicit external
        if (userIntent === 'external') {
            this.requireExternalIds(appDefinition.vpc?.external?.vpcId, 'vpcId');
            return this.createExternalDecision(
                appDefinition.vpc.external.vpcId,
                'User specified ownership=external for VPC'
            );
        }

        // Explicit stack
        if (userIntent === 'stack') {
            const inStack = this.findInStack('FriggVPC', discovery);
            return this.createStackDecision(
                inStack?.physicalId,
                'User specified ownership=stack for VPC'
            );
        }

        // Auto-decide
        return this.resolveResourceOwnership(
            'auto',
            'FriggVPC',
            'AWS::EC2::VPC',
            discovery
        );
    }

    /**
     * Resolve Security Group ownership
     *
     * Logic:
     * - If FriggLambdaSecurityGroup exists in stack → STACK (keep it)
     * - If default SG discovered from VPC → EXTERNAL (use it)
     * - Otherwise → STACK (create FriggLambdaSecurityGroup)
     *
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveSecurityGroup(appDefinition, discovery) {
        const userIntent = appDefinition.vpc?.ownership?.securityGroup || 'auto';

        // Explicit external - use provided SG IDs
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.vpc?.external?.securityGroupIds,
                'securityGroupIds'
            );
            return this.createExternalDecision(
                appDefinition.vpc.external.securityGroupIds,
                'User specified ownership=external for security group'
            );
        }

        // Explicit stack - always create FriggLambdaSecurityGroup
        if (userIntent === 'stack') {
            const inStack = this.findInStack('FriggLambdaSecurityGroup', discovery);
            return this.createStackDecision(
                inStack?.physicalId,
                inStack 
                    ? 'Found FriggLambdaSecurityGroup in CloudFormation stack'
                    : 'User specified ownership=stack - will create FriggLambdaSecurityGroup'
            );
        }

        // Auto mode: Check stack first, then check for discovered default SG
        const inStack = this.findInStack('FriggLambdaSecurityGroup', discovery);

        if (inStack) {
            return this.createStackDecision(
                inStack.physicalId,
                'Found FriggLambdaSecurityGroup in CloudFormation stack - must keep in template'
            );
        }

        // Check for discovered default security group (from old canary pattern)
        const structured = discovery._structured || discovery;
        const defaultSgId = structured.defaultSecurityGroupId || discovery.defaultSecurityGroupId;
        
        if (defaultSgId) {
            return this.createExternalDecision(
                [defaultSgId],
                'Found default security group via discovery - will reuse (matches canary behavior)'
            );
        }

        // No SG found anywhere - create new FriggLambdaSecurityGroup
        return this.createStackDecision(
            null,
            'No security group found - will create FriggLambdaSecurityGroup in stack'
        );
    }

    /**
     * Resolve Subnets ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveSubnets(appDefinition, discovery) {
        const userIntent = appDefinition.vpc?.ownership?.subnets || 'auto';

        // Explicit external
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.vpc?.external?.subnetIds,
                'subnetIds'
            );
            return this.createExternalDecision(
                appDefinition.vpc.external.subnetIds,
                'User specified ownership=external for subnets'
            );
        }

        // Explicit stack
        if (userIntent === 'stack') {
            // Check if we have subnets in stack
            const subnet1 = this.findInStack('FriggPrivateSubnet1', discovery);
            const subnet2 = this.findInStack('FriggPrivateSubnet2', discovery);

            if (subnet1 && subnet2) {
                return {
                    ownership: ResourceOwnership.STACK,
                    physicalIds: [subnet1.physicalId, subnet2.physicalId],
                    reason: 'User specified ownership=stack for subnets',
                    metadata: {
                        subnet1: subnet1.physicalId,
                        subnet2: subnet2.physicalId
                    }
                };
            }

            return this.createStackDecision(
                null,
                'User specified ownership=stack for subnets (will create new)'
            );
        }

        // Auto-decide
        const subnet1InStack = this.isInStack('FriggPrivateSubnet1', discovery);
        const subnet2InStack = this.isInStack('FriggPrivateSubnet2', discovery);

        if (subnet1InStack && subnet2InStack) {
            const subnet1 = this.findInStack('FriggPrivateSubnet1', discovery);
            const subnet2 = this.findInStack('FriggPrivateSubnet2', discovery);

            return {
                ownership: ResourceOwnership.STACK,
                physicalIds: [subnet1.physicalId, subnet2.physicalId],
                reason: 'Found subnets in CloudFormation stack (must keep in template to avoid deletion)',
                metadata: {
                    subnet1: subnet1.physicalId,
                    subnet2: subnet2.physicalId
                }
            };
        }

        // Check for external subnets
        const externalSubnets = this.findAllExternalResources(discovery, 'AWS::EC2::Subnet');
        if (externalSubnets.length >= 2) {
            return {
                ownership: ResourceOwnership.EXTERNAL,
                physicalIds: externalSubnets.slice(0, 2).map(s => s.physicalId),
                reason: 'Found external subnets via discovery',
                metadata: {
                    count: externalSubnets.length
                }
            };
        }

        // Create new
        return this.createStackDecision(
            null,
            'No existing subnets found - will create in stack'
        );
    }

    /**
     * Resolve NAT Gateway ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision
     */
    resolveNatGateway(appDefinition, discovery) {
        const userIntent = appDefinition.vpc?.ownership?.natGateway || 'auto';
        const natEnabled = appDefinition.vpc?.config?.natGateway?.enable !== false;

        // If NAT is disabled, return null decision
        if (!natEnabled) {
            return {
                ownership: null,
                reason: 'NAT Gateway disabled in configuration',
                metadata: { disabled: true }
            };
        }

        // Explicit external
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.vpc?.external?.natGatewayId,
                'natGatewayId'
            );
            return this.createExternalDecision(
                appDefinition.vpc.external.natGatewayId,
                'User specified ownership=external for NAT gateway'
            );
        }

        // Explicit stack
        if (userIntent === 'stack') {
            const inStack = this.findInStack('FriggNatGateway', discovery);
            return this.createStackDecision(
                inStack?.physicalId,
                'User specified ownership=stack for NAT gateway'
            );
        }

        // Auto-decide
        return this.resolveResourceOwnership(
            'auto',
            'FriggNatGateway',
            'AWS::EC2::NatGateway',
            discovery
        );
    }

    /**
     * Resolve VPC Endpoints ownership
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Resource decision for each endpoint type
     */
    resolveVpcEndpoints(appDefinition, discovery) {
        const userIntent = appDefinition.vpc?.ownership?.vpcEndpoints || 'auto';
        const endpointsEnabled = appDefinition.vpc?.config?.enableVpcEndpoints !== false;

        // If endpoints disabled, return null decision
        if (!endpointsEnabled) {
            return {
                s3: { ownership: null, reason: 'VPC Endpoints disabled' },
                dynamodb: { ownership: null, reason: 'VPC Endpoints disabled' },
                kms: { ownership: null, reason: 'VPC Endpoints disabled' },
                secretsManager: { ownership: null, reason: 'VPC Endpoints disabled' },
                sqs: { ownership: null, reason: 'VPC Endpoints disabled' }
            };
        }

        // KMS endpoint only needed if encryption method is KMS
        const encryptionMethod = appDefinition.encryption?.fieldLevelEncryptionMethod;
        const needsKms = encryptionMethod === 'kms';

        const endpoints = {
            s3: this._resolveEndpoint('FriggS3VPCEndpoint', 's3', userIntent, appDefinition, discovery),
            dynamodb: this._resolveEndpoint('FriggDynamoDBVPCEndpoint', 'dynamodb', userIntent, appDefinition, discovery),
            kms: needsKms
                ? this._resolveEndpoint('FriggKMSVPCEndpoint', 'kms', userIntent, appDefinition, discovery)
                : { ownership: null, reason: 'KMS endpoint not needed (encryption method is not KMS)' },
            secretsManager: this._resolveEndpoint('FriggSecretsManagerVPCEndpoint', 'secretsManager', userIntent, appDefinition, discovery),
            sqs: this._resolveEndpoint('FriggSQSVPCEndpoint', 'sqs', userIntent, appDefinition, discovery)
        };

        return endpoints;
    }

    /**
     * Resolve individual VPC endpoint
     * @private
     */
    _resolveEndpoint(logicalId, endpointType, userIntent, appDefinition, discovery) {
        // Explicit external
        if (userIntent === 'external') {
            const externalId = appDefinition.vpc?.external?.vpcEndpointIds?.[endpointType];
            if (externalId) {
                return this.createExternalDecision(
                    externalId,
                    `User specified ownership=external for ${endpointType} endpoint`
                );
            }
            // User said external but didn't provide ID - skip this endpoint
            return { ownership: null, reason: `External ${endpointType} endpoint ID not provided` };
        }

        // Explicit stack
        if (userIntent === 'stack') {
            const inStack = this.findInStack(logicalId, discovery);
            return this.createStackDecision(
                inStack?.physicalId,
                `User specified ownership=stack for ${endpointType} endpoint`
            );
        }

        // Auto-decide
        return this.resolveResourceOwnership(
            'auto',
            logicalId,
            'AWS::EC2::VPCEndpoint',
            discovery
        );
    }

    /**
     * Resolve all VPC resources at once
     * Convenience method that returns decisions for all VPC resources
     *
     * @param {Object} appDefinition - App definition
     * @param {Object} discovery - Discovery result
     * @returns {Object} Decisions for all VPC resources
     */
    resolveAll(appDefinition, discovery) {
        return {
            vpc: this.resolveVpc(appDefinition, discovery),
            securityGroup: this.resolveSecurityGroup(appDefinition, discovery),
            subnets: this.resolveSubnets(appDefinition, discovery),
            natGateway: this.resolveNatGateway(appDefinition, discovery),
            vpcEndpoints: this.resolveVpcEndpoints(appDefinition, discovery)
        };
    }
}

module.exports = VpcResourceResolver;
