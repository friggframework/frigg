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
        const vpcManagement = appDefinition.vpc?.management; // Legacy config

        // Explicit external
        if (userIntent === 'external') {
            const externalVpcId = appDefinition.vpc?.external?.vpcId;
            
            // If hardcoded ID provided, use it
            if (externalVpcId) {
                return this.createExternalDecision(
                    externalVpcId,
                    'User specified ownership=external with hardcoded vpcId'
                );
            }
            
            // No hardcoded ID - try discovery
            const discoveredVpcId = discovery.defaultVpcId;
            
            if (discoveredVpcId) {
                return this.createExternalDecision(
                    discoveredVpcId,
                    'User specified ownership=external - using discovered VPC'
                );
            }
            
            // Discovery found nothing - error
            throw new Error(
                "ownership='external' for VPC requires either:\n" +
                "  1. Hardcoded external.vpcId, OR\n" +
                "  2. A VPC discovered via AWS discovery"
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
        const decision = this.resolveResourceOwnership(
            'auto',
            'FriggVPC',
            'AWS::EC2::VPC',
            discovery
        );

        // CRITICAL: If auto-resolution wants to create a VPC but management mode is 'discover' (or undefined),
        // throw an error instead. Creating a VPC is expensive and should be explicit.
        if (decision.ownership === ResourceOwnership.STACK && 
            !decision.physicalId && 
            vpcManagement !== 'create-new' &&
            userIntent === 'auto') {
            throw new Error(
                'VPC discovery failed: No VPC found. ' +
                'Either set vpc.management to "create-new" or provide vpc.vpcId with vpc.management "use-existing".'
            );
        }

        return decision;
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

        // Explicit external
        if (userIntent === 'external') {
            const externalIds = appDefinition.vpc?.external?.securityGroupIds;
            
            // If hardcoded IDs provided, use those
            if (externalIds && externalIds.length > 0) {
                return this.createExternalDecision(
                    externalIds,
                    'User specified ownership=external with hardcoded securityGroupIds'
                );
            }
            
            // No hardcoded IDs - try discovery
            const structured = discovery._structured || discovery;
            
            // When ownership='external', use ONLY the default SG, not the stack-managed lambda SG
            const lambdaSgId = structured.lambdaSecurityGroupId || discovery.lambdaSecurityGroupId;
            const defaultSgId = structured.defaultSecurityGroupId || discovery.defaultSecurityGroupId;
            
            // If we have a default SG AND it's different from the lambda SG, use the default
            if (defaultSgId && defaultSgId !== lambdaSgId) {
                return this.createExternalDecision(
                    [defaultSgId],
                    'User specified ownership=external - using discovered default security group'
                );
            }
            
            // If only defaultSgId exists (no lambdaSgId), use it
            if (defaultSgId && !lambdaSgId) {
                return this.createExternalDecision(
                    [defaultSgId],
                    'User specified ownership=external - using discovered default security group'
                );
            }
            
            // Discovery found nothing - error
            throw new Error(
                "ownership='external' for securityGroup requires either:\n" +
                "  1. Hardcoded external.securityGroupIds array, OR\n" +
                "  2. A default security group discovered via AWS discovery"
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

        // Also check flat discovery for lambdaSecurityGroupId (from CloudFormation extraction)
        const structured = discovery._structured || discovery;
        const lambdaSgId = structured.lambdaSecurityGroupId || discovery.lambdaSecurityGroupId;
        
        if (lambdaSgId) {
            return this.createStackDecision(
                lambdaSgId,
                'Found FriggLambdaSecurityGroup in CloudFormation stack - must keep in template'
            );
        }

        // Check for discovered default security group (from external VPC pattern)
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
            const externalSubnetIds = appDefinition.vpc?.external?.subnetIds;
            
            // If hardcoded IDs provided, use those
            if (externalSubnetIds && externalSubnetIds.length >= 2) {
                return this.createExternalDecision(
                    externalSubnetIds,
                    'User specified ownership=external with hardcoded subnetIds'
                );
            }
            
            // No hardcoded IDs - try discovery
            const discoveredSubnet1 = discovery.privateSubnetId1;
            const discoveredSubnet2 = discovery.privateSubnetId2;
            
            if (discoveredSubnet1 && discoveredSubnet2) {
                return this.createExternalDecision(
                    [discoveredSubnet1, discoveredSubnet2],
                    'User specified ownership=external - using discovered subnets'
                );
            }
            
            // Discovery found nothing - error
            throw new Error(
                "ownership='external' for subnets requires either:\n" +
                "  1. Hardcoded external.subnetIds array (minimum 2), OR\n" +
                "  2. At least 2 subnets discovered via AWS discovery"
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
            const externalNatId = appDefinition.vpc?.external?.natGatewayId;
            
            // If hardcoded ID provided, use it
            if (externalNatId) {
                return this.createExternalDecision(
                    externalNatId,
                    'User specified ownership=external with hardcoded natGatewayId'
                );
            }
            
            // No hardcoded ID - try discovery
            const discoveredNatId = discovery.natGatewayId;
            
            if (discoveredNatId) {
                return this.createExternalDecision(
                    discoveredNatId,
                    'User specified ownership=external - using discovered NAT gateway'
                );
            }
            
            // Discovery found nothing - error
            throw new Error(
                "ownership='external' for NAT gateway requires either:\n" +
                "  1. Hardcoded external.natGatewayId, OR\n" +
                "  2. A NAT gateway discovered via AWS discovery"
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

        // DynamoDB endpoint only needed if using DynamoDB (not MongoDB or PostgreSQL)
        // Currently framework only supports MongoDB (via Prisma) and PostgreSQL (via Aurora)
        // If not using DynamoDB, skip the endpoint (CloudFormation will delete if it exists)
        const usesDynamoDB = appDefinition.database?.dynamodb?.enable === true;

        const endpoints = {
            s3: this._resolveEndpoint('FriggS3VPCEndpoint', 's3', userIntent, appDefinition, discovery),
            dynamodb: usesDynamoDB
                ? this._resolveEndpoint('FriggDynamoDBVPCEndpoint', 'dynamodb', userIntent, appDefinition, discovery)
                : { ownership: null, reason: 'DynamoDB endpoint not needed (application uses MongoDB/PostgreSQL, not DynamoDB)' },
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
     * Checks both old and new logical ID patterns for backwards compatibility
     * @private
     */
    _resolveEndpoint(logicalId, endpointType, userIntent, appDefinition, discovery) {
        // Map of old logical IDs (for backwards compatibility with stacks created before naming standardization)
        const oldLogicalIdMap = {
            'FriggS3VPCEndpoint': 'VPCEndpointS3',
            'FriggDynamoDBVPCEndpoint': 'VPCEndpointDynamoDB',
            'FriggKMSVPCEndpoint': 'VPCEndpointKMS',
            'FriggSecretsManagerVPCEndpoint': 'VPCEndpointSecretsManager',
            'FriggSQSVPCEndpoint': 'VPCEndpointSQS'
        };
        const oldLogicalId = oldLogicalIdMap[logicalId];

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

        // Explicit stack - check both old and new logical IDs
        if (userIntent === 'stack') {
            let inStack = this.findInStack(logicalId, discovery);
            if (!inStack && oldLogicalId) {
                inStack = this.findInStack(oldLogicalId, discovery);
            }
            return this.createStackDecision(
                inStack?.physicalId,
                `User specified ownership=stack for ${endpointType} endpoint`
            );
        }

        // Auto-decide - check if in stack first (try both old and new logical IDs)
        let inStack = this.isInStack(logicalId, discovery);
        let stackResource = inStack ? this.findInStack(logicalId, discovery) : null;
        let actualLogicalId = logicalId;  // Track which ID we found
        
        // If not found with new ID, try old ID pattern
        if (!inStack && oldLogicalId) {
            inStack = this.isInStack(oldLogicalId, discovery);
            stackResource = inStack ? this.findInStack(oldLogicalId, discovery) : null;
            if (inStack) {
                actualLogicalId = oldLogicalId;  // Found with old ID - use that for resolution
            }
        }
        
        const decision = this.resolveResourceOwnership(
            'auto',
            actualLogicalId,  // Use the actual ID we found (old or new)
            'AWS::EC2::VPCEndpoint',
            discovery
        );
        
        // Override reason with more detailed explanation
        if (decision.ownership === 'stack' && decision.physicalId) {
            decision.reason = `Found in CloudFormation stack (must keep in template to avoid deletion)`;
        } else if (decision.ownership === 'stack' && !decision.physicalId) {
            decision.reason = `No existing ${endpointType} endpoint found - will create in stack`;
        } else if (decision.ownership === 'external') {
            decision.reason = `Found external ${endpointType} endpoint via discovery`;
        }
        
        return decision;
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
