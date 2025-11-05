/**
 * VPC Infrastructure Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for building VPC infrastructure including:
 * - VPC creation or discovery
 * - Subnet management (public/private)
 * - Security groups for Lambda functions
 * - NAT Gateways for private subnet internet access
 * - VPC Endpoints (S3, DynamoDB, KMS, Secrets Manager)
 * - Route tables and routing configuration
 * - Self-healing VPC misconfigurations
 * 
 * Supports three management modes:
 * 1. create-new: Creates complete VPC infrastructure from scratch
 * 2. use-existing: Uses explicitly provided VPC/subnet IDs
 * 3. discover (default): Discovers and uses existing AWS resources
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');
const VpcResourceResolver = require('./vpc-resolver');
const { createEmptyDiscoveryResult } = require('../shared/types/discovery-result');
const { ResourceOwnership } = require('../shared/types/resource-ownership');

class VpcBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'VpcBuilder';
    }

    shouldExecute(appDefinition) {
        // Skip VPC in local mode (when FRIGG_SKIP_AWS_DISCOVERY is set)
        // VPC is an AWS-specific service that should only be created in production
        if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
            return false;
        }

        return appDefinition.vpc?.enable === true;
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.vpc) {
            result.addError('VPC configuration is missing');
            return result;
        }

        const vpc = appDefinition.vpc;

        // Validate management mode
        const validModes = ['discover', 'create-new', 'use-existing'];
        const management = vpc.management || 'discover';
        if (!validModes.includes(management)) {
            result.addError(`Invalid vpc.management: "${management}". Must be one of: ${validModes.join(', ')}`);
        }

        // Validate use-existing mode requirements
        if (management === 'use-existing') {
            if (!vpc.vpcId) {
                result.addError('vpc.vpcId is required when management="use-existing"');
            }
            if (!vpc.securityGroupIds || vpc.securityGroupIds.length === 0) {
                result.addWarning('vpc.securityGroupIds not provided - will attempt discovery');
            }
        }

        // Validate CIDR block format
        if (vpc.cidrBlock) {
            const cidrPattern = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;
            if (!cidrPattern.test(vpc.cidrBlock)) {
                result.addError(`Invalid CIDR block format: ${vpc.cidrBlock}`);
            }
        }

        // Validate subnet configuration
        if (vpc.subnets?.management === 'use-existing') {
            if (!vpc.subnets.ids || vpc.subnets.ids.length < 2) {
                result.addError('At least 2 subnet IDs required when subnets.management="use-existing"');
            }
        }

        return result;
    }

    /**
     * Warn about ignored options when managementMode='managed'
     */
    warnIgnoredOptions(appDefinition) {
        const ignoredOptions = [];
        if (appDefinition.vpc?.management) ignoredOptions.push('vpc.management');
        if (appDefinition.vpc?.subnets?.management) ignoredOptions.push('vpc.subnets.management');
        if (appDefinition.vpc?.natGateway?.management) ignoredOptions.push('vpc.natGateway.management');
        if (appDefinition.vpc?.shareAcrossStages !== undefined) ignoredOptions.push('vpc.shareAcrossStages');

        if (ignoredOptions.length > 0) {
            console.log(`  ⚠️  managementMode='managed' ignoring: ${ignoredOptions.join(', ')}`);
        }
    }

    /**
     * Convert flat discovery result to structured discovery result
     * Provides backwards compatibility for tests using old discovery format
     *
     * @param {Object} flatDiscovery - Flat discovery object
     * @param {Object} appDefinition - App definition (used to detect stack-managed resources)
     */
    convertFlatDiscoveryToStructured(flatDiscovery, appDefinition = {}) {
        const discovery = createEmptyDiscoveryResult();

        if (!flatDiscovery) {
            return discovery;
        }

        // Special case: managementMode='managed' + vpcIsolation='isolated' with existing resources
        // These resources are from a previous deployment of this stack, so they're stack-managed
        const isManagedIsolated = appDefinition.managementMode === 'managed' &&
                                   (appDefinition.vpcIsolation === 'isolated' || !appDefinition.vpcIsolation);
        const hasExistingStackResources = isManagedIsolated && flatDiscovery.defaultVpcId &&
                                         typeof flatDiscovery.defaultVpcId === 'string';

        // Check if this came from CloudFormation stack
        if (flatDiscovery.fromCloudFormationStack || hasExistingStackResources) {
            discovery.fromCloudFormation = true;
            discovery.stackName = flatDiscovery.stackName || 'assumed-stack';

            // Add resources to stackManaged array
            let existingLogicalIds = flatDiscovery.existingLogicalIds || [];

            // If hasExistingStackResources but no existingLogicalIds provided,
            // infer logical IDs from presence of physical IDs
            if (hasExistingStackResources && existingLogicalIds.length === 0) {
                existingLogicalIds = [];
                if (flatDiscovery.defaultVpcId) existingLogicalIds.push('FriggVPC');
                if (flatDiscovery.privateSubnetId1) existingLogicalIds.push('FriggPrivateSubnet1');
                if (flatDiscovery.privateSubnetId2) existingLogicalIds.push('FriggPrivateSubnet2');
                if (flatDiscovery.publicSubnetId1) existingLogicalIds.push('FriggPublicSubnet');
                if (flatDiscovery.publicSubnetId2) existingLogicalIds.push('FriggPublicSubnet2');
            }

            existingLogicalIds.forEach(logicalId => {
                // Find the resource type and physical ID
                let resourceType = '';
                let physicalId = '';

                if (logicalId === 'FriggVPC') {
                    resourceType = 'AWS::EC2::VPC';
                    physicalId = flatDiscovery.defaultVpcId;
                } else if (logicalId === 'FriggLambdaSecurityGroup') {
                    resourceType = 'AWS::EC2::SecurityGroup';
                    physicalId = flatDiscovery.lambdaSecurityGroupId || flatDiscovery.defaultSecurityGroupId || flatDiscovery.securityGroupId;
                } else if (logicalId === 'FriggPrivateSubnet1') {
                    resourceType = 'AWS::EC2::Subnet';
                    physicalId = flatDiscovery.privateSubnetId1;
                } else if (logicalId === 'FriggPrivateSubnet2') {
                    resourceType = 'AWS::EC2::Subnet';
                    physicalId = flatDiscovery.privateSubnetId2;
                } else if (logicalId === 'FriggNATGateway') {
                    resourceType = 'AWS::EC2::NatGateway';
                    physicalId = flatDiscovery.existingNatGatewayId;
                } else if (logicalId === 'FriggLambdaRouteTable') {
                    resourceType = 'AWS::EC2::RouteTable';
                    physicalId = flatDiscovery.routeTableId;
                } else if (logicalId === 'FriggS3VPCEndpoint') {
                    resourceType = 'AWS::EC2::VPCEndpoint';
                    physicalId = flatDiscovery.s3VpcEndpointId;
                } else if (logicalId === 'FriggDynamoDBVPCEndpoint') {
                    resourceType = 'AWS::EC2::VPCEndpoint';
                    physicalId = flatDiscovery.dynamodbVpcEndpointId;
                } else if (logicalId === 'FriggKMSVPCEndpoint') {
                    resourceType = 'AWS::EC2::VPCEndpoint';
                    physicalId = flatDiscovery.kmsVpcEndpointId;
                } else if (logicalId === 'FriggSecretsManagerVPCEndpoint') {
                    resourceType = 'AWS::EC2::VPCEndpoint';
                    physicalId = flatDiscovery.secretsManagerVpcEndpointId;
                } else if (logicalId === 'FriggSQSVPCEndpoint') {
                    resourceType = 'AWS::EC2::VPCEndpoint';
                    physicalId = flatDiscovery.sqsVpcEndpointId;
                }

                if (physicalId && typeof physicalId === 'string') {
                    discovery.stackManaged.push({
                        logicalId,
                        physicalId,
                        resourceType
                    });
                }
            });

            // Also check for external resources extracted via CloudFormation queries
            // (e.g., VPC ID from security group query, subnets from route table associations)
            // These are NOT in the stack but were discovered through stack resources
            this._addExternalResourcesFromCloudFormationQueries(flatDiscovery, discovery, existingLogicalIds);
        } else {
            // Resources discovered from AWS API (not CloudFormation)
            // These go into external array

            if (flatDiscovery.defaultVpcId && typeof flatDiscovery.defaultVpcId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.defaultVpcId,
                    resourceType: 'AWS::EC2::VPC',
                    source: 'aws-discovery'
                });
            }

            if (flatDiscovery.defaultSecurityGroupId && typeof flatDiscovery.defaultSecurityGroupId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.defaultSecurityGroupId,
                    resourceType: 'AWS::EC2::SecurityGroup',
                    source: 'aws-discovery'
                });
            }

            if (flatDiscovery.privateSubnetId1 && typeof flatDiscovery.privateSubnetId1 === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.privateSubnetId1,
                    resourceType: 'AWS::EC2::Subnet',
                    source: 'aws-discovery'
                });
            }

            if (flatDiscovery.privateSubnetId2 && typeof flatDiscovery.privateSubnetId2 === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.privateSubnetId2,
                    resourceType: 'AWS::EC2::Subnet',
                    source: 'aws-discovery'
                });
            }

            // Only add NAT Gateway to external if it's NOT in a private subnet (properly placed)
            // If natGatewayInPrivateSubnet is true, we need a new NAT Gateway
            const natIsProperlyPlaced = flatDiscovery.natGatewayInPrivateSubnet !== true;

            if (flatDiscovery.natGatewayId && typeof flatDiscovery.natGatewayId === 'string' && natIsProperlyPlaced) {
                discovery.external.push({
                    physicalId: flatDiscovery.natGatewayId,
                    resourceType: 'AWS::EC2::NatGateway',
                    source: 'aws-discovery'
                });
            }

            if (flatDiscovery.existingNatGatewayId && typeof flatDiscovery.existingNatGatewayId === 'string' && natIsProperlyPlaced) {
                discovery.external.push({
                    physicalId: flatDiscovery.existingNatGatewayId,
                    resourceType: 'AWS::EC2::NatGateway',
                    source: 'aws-discovery'
                });
            }

            // VPC Endpoints
            if (flatDiscovery.s3VpcEndpointId && typeof flatDiscovery.s3VpcEndpointId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.s3VpcEndpointId,
                    resourceType: 'AWS::EC2::VPCEndpoint',
                    source: 'aws-discovery',
                    properties: { ServiceName: 's3' }
                });
            }

            if (flatDiscovery.dynamodbVpcEndpointId && typeof flatDiscovery.dynamodbVpcEndpointId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.dynamodbVpcEndpointId,
                    resourceType: 'AWS::EC2::VPCEndpoint',
                    source: 'aws-discovery',
                    properties: { ServiceName: 'dynamodb' }
                });
            }

            if (flatDiscovery.kmsVpcEndpointId && typeof flatDiscovery.kmsVpcEndpointId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.kmsVpcEndpointId,
                    resourceType: 'AWS::EC2::VPCEndpoint',
                    source: 'aws-discovery',
                    properties: { ServiceName: 'kms' }
                });
            }

            if (flatDiscovery.secretsManagerVpcEndpointId && typeof flatDiscovery.secretsManagerVpcEndpointId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.secretsManagerVpcEndpointId,
                    resourceType: 'AWS::EC2::VPCEndpoint',
                    source: 'aws-discovery',
                    properties: { ServiceName: 'secretsmanager' }
                });
            }

            if (flatDiscovery.sqsVpcEndpointId && typeof flatDiscovery.sqsVpcEndpointId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.sqsVpcEndpointId,
                    resourceType: 'AWS::EC2::VPCEndpoint',
                    source: 'aws-discovery',
                    properties: { ServiceName: 'sqs' }
                });
            }
        }

        return discovery;
    }

    /**
     * Add external resources that were discovered via CloudFormation queries
     * (e.g., VPC ID extracted from security group, subnets from route table associations)
     * 
     * @private
     */
    _addExternalResourcesFromCloudFormationQueries(flatDiscovery, discovery, existingLogicalIds) {
        // VPC ID extracted from SG or route table (NOT a stack resource)
        if (flatDiscovery.defaultVpcId && 
            typeof flatDiscovery.defaultVpcId === 'string' &&
            !existingLogicalIds.includes('FriggVPC')) {
            discovery.external.push({
                physicalId: flatDiscovery.defaultVpcId,
                resourceType: 'AWS::EC2::VPC',
                source: 'cloudformation-query'
            });
        }

        // Subnets extracted from route table associations (NOT stack resources)
        if (flatDiscovery.privateSubnetId1 && 
            typeof flatDiscovery.privateSubnetId1 === 'string' &&
            !existingLogicalIds.includes('FriggPrivateSubnet1')) {
            discovery.external.push({
                physicalId: flatDiscovery.privateSubnetId1,
                resourceType: 'AWS::EC2::Subnet',
                source: 'cloudformation-query'
            });
        }

        if (flatDiscovery.privateSubnetId2 && 
            typeof flatDiscovery.privateSubnetId2 === 'string' &&
            !existingLogicalIds.includes('FriggPrivateSubnet2')) {
            discovery.external.push({
                physicalId: flatDiscovery.privateSubnetId2,
                resourceType: 'AWS::EC2::Subnet',
                source: 'cloudformation-query'
            });
        }

        // NAT Gateway extracted from route table routes
        if (flatDiscovery.existingNatGatewayId && 
            typeof flatDiscovery.existingNatGatewayId === 'string' &&
            !existingLogicalIds.includes('FriggNATGateway') &&
            !existingLogicalIds.includes('FriggNatGateway')) {
            discovery.external.push({
                physicalId: flatDiscovery.existingNatGatewayId,
                resourceType: 'AWS::EC2::NatGateway',
                source: 'cloudformation-query'
            });
        }
    }

    /**
     * Translate legacy configuration (management modes) to new ownership-based configuration
     * Provides backwards compatibility for existing app definitions
     */
    translateLegacyConfig(appDefinition, discoveredResources) {
        // If already using new ownership schema, return as-is
        if (appDefinition.vpc?.ownership) {
            return appDefinition;
        }

        // Clone to avoid mutating original
        const translated = JSON.parse(JSON.stringify(appDefinition));

        // Initialize ownership and external sections
        if (!translated.vpc.ownership) {
            translated.vpc.ownership = {};
        }
        if (!translated.vpc.external) {
            translated.vpc.external = {};
        }
        if (!translated.vpc.config) {
            translated.vpc.config = {};
        }

        // Handle top-level managementMode
        const globalMode = appDefinition.managementMode || 'discover';
        const vpcIsolation = appDefinition.vpcIsolation || 'shared';

        if (globalMode === 'managed') {
            this.warnIgnoredOptions(appDefinition);

            if (vpcIsolation === 'isolated') {
                // Check if CloudFormation stack already has resources
                const hasStackVpc = discoveredResources?.defaultVpcId && typeof discoveredResources.defaultVpcId === 'string';

                if (hasStackVpc) {
                    // Stack has VPC - reuse it
                    translated.vpc.ownership.vpc = 'auto';
                    translated.vpc.ownership.securityGroup = 'auto';
                    translated.vpc.ownership.subnets = 'auto';
                    translated.vpc.config.selfHeal = true;
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → stack has VPC, reusing`);
                } else {
                    // No stack VPC - create new
                    translated.vpc.ownership.vpc = 'stack';
                    translated.vpc.ownership.securityGroup = 'stack';
                    translated.vpc.ownership.subnets = 'stack';
                    translated.vpc.ownership.natGateway = 'stack';
                    translated.vpc.config.natGateway = { enable: true };
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → no stack VPC, creating new`);
                }
            } else {
                // Shared VPC
                translated.vpc.ownership.vpc = 'auto';
                translated.vpc.ownership.securityGroup = 'auto';
                translated.vpc.ownership.subnets = 'auto';
                translated.vpc.config.selfHeal = true;
            }
        } else if (globalMode === 'existing') {
            translated.vpc.ownership.vpc = 'external';
            translated.vpc.ownership.securityGroup = 'external';
            translated.vpc.ownership.subnets = 'external';
        }

        // Handle legacy vpc.management modes
        const vpcManagement = appDefinition.vpc?.management;
        if (vpcManagement === 'create-new') {
            translated.vpc.ownership.vpc = 'stack';
            translated.vpc.ownership.securityGroup = 'stack';
            translated.vpc.ownership.subnets = 'stack';
        } else if (vpcManagement === 'use-existing') {
            translated.vpc.ownership.vpc = 'external';
            translated.vpc.external.vpcId = appDefinition.vpc.vpcId;

            if (appDefinition.vpc.securityGroupIds) {
                translated.vpc.ownership.securityGroup = 'external';
                translated.vpc.external.securityGroupIds = appDefinition.vpc.securityGroupIds;
            }

            if (appDefinition.vpc.subnets?.ids) {
                translated.vpc.ownership.subnets = 'external';
                translated.vpc.external.subnetIds = appDefinition.vpc.subnets.ids;
            }
        } else if (vpcManagement === 'discover') {
            // Discover mode - let auto-resolution handle it
            translated.vpc.ownership.vpc = 'auto';
            translated.vpc.ownership.securityGroup = 'auto';
            translated.vpc.ownership.subnets = 'auto';
        }

        // Handle legacy shareAcrossStages
        if (appDefinition.vpc?.shareAcrossStages !== undefined) {
            if (appDefinition.vpc.shareAcrossStages) {
                // Shared VPC - discover and reuse
                translated.vpc.ownership.vpc = 'auto';
                translated.vpc.ownership.subnets = 'auto';
            } else {
                // Isolated VPC - create stage-specific
                translated.vpc.ownership.vpc = 'stack';
                translated.vpc.ownership.subnets = 'stack';
                translated.vpc.ownership.natGateway = 'stack';
                translated.vpc.config.natGateway = { enable: true };
            }
        }

        // Handle legacy NAT Gateway management
        if (appDefinition.vpc?.natGateway?.management === 'createAndManage') {
            // Use 'auto' to allow discovering and reusing properly placed external NAT Gateways
            // The resolver will check if there's a good external NAT Gateway and reuse it,
            // or create a new one if needed (or if the existing one is misplaced)
            translated.vpc.ownership.natGateway = 'auto';
            translated.vpc.config.natGateway = { enable: true };
        } else if (appDefinition.vpc?.natGateway?.id) {
            translated.vpc.ownership.natGateway = 'external';
            translated.vpc.external.natGatewayId = appDefinition.vpc.natGateway.id;
        }

        // Handle legacy subnet management
        if (appDefinition.vpc?.subnets?.management === 'create') {
            translated.vpc.ownership.subnets = 'stack';
        } else if (appDefinition.vpc?.subnets?.management === 'use-existing' && appDefinition.vpc.subnets.ids) {
            translated.vpc.ownership.subnets = 'external';
            translated.vpc.external.subnetIds = appDefinition.vpc.subnets.ids;
        }

        // Preserve other VPC config
        if (appDefinition.vpc?.cidrBlock) {
            translated.vpc.config.cidrBlock = appDefinition.vpc.cidrBlock;
        }
        if (appDefinition.vpc?.enableVPCEndpoints !== undefined) {
            translated.vpc.config.enableVpcEndpoints = appDefinition.vpc.enableVPCEndpoints;
        }
        if (appDefinition.vpc?.selfHeal !== undefined) {
            translated.vpc.config.selfHeal = appDefinition.vpc.selfHeal;
        }

        return translated;
    }

    /**
     * Build complete VPC infrastructure using ownership-based architecture
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Building VPC infrastructure...`);

        // Backwards compatibility: Translate old schema to new ownership schema
        appDefinition = this.translateLegacyConfig(appDefinition, discoveredResources);

        // Get structured discovery result (or convert flat discovery to structured)
        // Pass appDefinition to help detect stack-managed resources in managementMode='managed'
        const discovery = discoveredResources._structured || this.convertFlatDiscoveryToStructured(discoveredResources, appDefinition);

        // Use VpcResourceResolver to make ownership decisions
        const resolver = new VpcResourceResolver();
        const decisions = resolver.resolveAll(appDefinition, discovery);

        console.log('\n  📋 Resource Ownership Decisions:');
        console.log(`     VPC: ${decisions.vpc.ownership} - ${decisions.vpc.reason}`);
        console.log(`     Security Group: ${decisions.securityGroup.ownership} - ${decisions.securityGroup.reason}`);
        console.log(`     Subnets: ${decisions.subnets.ownership} - ${decisions.subnets.reason}`);
        console.log(`     NAT Gateway: ${decisions.natGateway.ownership || 'disabled'} - ${decisions.natGateway.reason}`);
        console.log(`     VPC Endpoints:`);
        console.log(`       S3: ${decisions.vpcEndpoints.s3.ownership || 'disabled'} - ${decisions.vpcEndpoints.s3.reason}`);
        console.log(`       DynamoDB: ${decisions.vpcEndpoints.dynamodb.ownership || 'disabled'} - ${decisions.vpcEndpoints.dynamodb.reason}`);

        // Initialize result
        const result = {
            resources: {},
            vpcConfig: {
                securityGroupIds: [],
                subnetIds: [],
            },
            iamStatements: [],
            outputs: {},
            environment: {},
        };

        // Add IAM permissions for VPC-enabled Lambda functions
        this.addVpcIamPermissions(result);

        // Build VPC based on ownership decision
        this.buildVpcFromDecision(decisions.vpc, appDefinition, result);

        // Build Security Group based on ownership decision
        this.buildSecurityGroupFromDecision(decisions.securityGroup, appDefinition, result);

        // Build Subnets based on ownership decision
        this.buildSubnetsFromDecision(decisions.subnets, appDefinition, discoveredResources, result);

        // Build NAT Gateway based on ownership decision
        this.buildNatGatewayFromDecision(decisions.natGateway, appDefinition, discoveredResources, result);

        // Build VPC Endpoints based on ownership decisions
        this.buildVpcEndpointsFromDecisions(decisions.vpcEndpoints, appDefinition, result);

        // Set VPC_ENABLED environment variable
        result.environment.VPC_ENABLED = 'true';

        console.log(`\n[${this.name}] ✅ VPC infrastructure built successfully`);
        console.log(`  - VPC ID: ${result.vpcId || 'from discovery'}`);
        console.log(`  - Subnets: ${result.vpcConfig.subnetIds.length}`);
        console.log(`  - Security Groups: ${result.vpcConfig.securityGroupIds.length}`);

        return result;
    }

    /**
     * Add IAM permissions for VPC-enabled Lambda functions
     */
    addVpcIamPermissions(result) {
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                'ec2:CreateNetworkInterface',
                'ec2:DescribeNetworkInterfaces',
                'ec2:DeleteNetworkInterface',
                'ec2:AttachNetworkInterface',
                'ec2:DetachNetworkInterface',
            ],
            Resource: '*',
        });
    }

    /**
     * Build VPC based on ownership decision
     *
     * For STACK ownership: ALWAYS add definitions to template.
     * CloudFormation idempotency ensures existing resources aren't recreated.
     */
    buildVpcFromDecision(decision, appDefinition, result) {
        if (decision.ownership === ResourceOwnership.STACK) {
            // For STACK ownership: ALWAYS create definitions (CloudFormation idempotency)
            if (decision.physicalId) {
                console.log(`  → Adding VPC definition to template (existing: ${decision.physicalId})`);
            } else {
                console.log('  → Adding VPC definition to template (new)');
            }

            const cidrBlock = appDefinition.vpc?.config?.cidrBlock || appDefinition.vpc?.cidrBlock || '10.0.0.0/16';

            result.resources.FriggVPC = {
                Type: 'AWS::EC2::VPC',
                Properties: {
                    CidrBlock: cidrBlock,
                    EnableDnsHostnames: true,
                    EnableDnsSupport: true,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Service', Value: '${self:service}' },
                        { Key: 'Stage', Value: '${self:provider.stage}' },
                    ],
                },
            };

            // Internet Gateway
            result.resources.FriggInternetGateway = {
                Type: 'AWS::EC2::InternetGateway',
                Properties: {
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-igw' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };

            result.resources.FriggVPCGatewayAttachment = {
                Type: 'AWS::EC2::VPCGatewayAttachment',
                Properties: {
                    VpcId: { Ref: 'FriggVPC' },
                    InternetGatewayId: { Ref: 'FriggInternetGateway' },
                },
            };

            // Use Ref for stack-managed VPC
            result.vpcId = { Ref: 'FriggVPC' };
            console.log('  ✅ VPC definition added to template');
        } else if (decision.ownership === ResourceOwnership.EXTERNAL) {
            // Use external VPC ID (no definition in template)
            result.vpcId = decision.physicalId;
            console.log(`  ✓ Using external VPC: ${decision.physicalId}`);
        }
    }

    /**
     * Build Security Group based on ownership decision
     */
    buildSecurityGroupFromDecision(decision, appDefinition, result) {
        if (decision.ownership === ResourceOwnership.STACK) {
            // Always create security group resource in template
            // CloudFormation handles idempotency if it already exists
            console.log('  → Adding Lambda Security Group to template...');

            result.resources.FriggLambdaSecurityGroup = {
                Type: 'AWS::EC2::SecurityGroup',
                Properties: {
                    GroupDescription: 'Security group for Frigg Lambda functions',
                    VpcId: result.vpcId,
                    SecurityGroupEgress: [
                        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0', Description: 'HTTPS outbound' },
                        { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0', Description: 'HTTP outbound' },
                        { IpProtocol: 'tcp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS TCP' },
                        { IpProtocol: 'udp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS UDP' },
                        { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, CidrIp: '0.0.0.0/0', Description: 'PostgreSQL' },
                        { IpProtocol: 'tcp', FromPort: 27017, ToPort: 27017, CidrIp: '0.0.0.0/0', Description: 'MongoDB' },
                    ],
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-sg' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };

            // Use CloudFormation Ref since resource is in template
            result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];
            console.log('  ✅ Security Group added to template');
        } else if (decision.ownership === ResourceOwnership.EXTERNAL) {
            // Use external security group IDs
            const sgIds = Array.isArray(decision.physicalId) ? decision.physicalId : [decision.physicalId];
            result.vpcConfig.securityGroupIds = sgIds;
            console.log(`  ✓ Using external security group(s): ${sgIds.join(', ')}`);
        }
    }

    /**
     * Build Subnets based on ownership decision
     */
    buildSubnetsFromDecision(decision, appDefinition, discoveredResources, result) {
        if (decision.ownership === ResourceOwnership.STACK) {
            // Check if no subnets exist and selfHeal is disabled
            if (!decision.physicalIds || decision.physicalIds.length < 2) {
                const selfHeal = appDefinition.vpc?.config?.selfHeal !== false;
                if (!selfHeal) {
                    throw new Error(
                        'No subnets discovered. Enable vpc.selfHeal, set subnets.management to "create", or provide subnet IDs.'
                    );
                }
            }

            // For STACK ownership: ALWAYS add definitions to template
            // CloudFormation idempotency ensures existing resources won't be recreated
            if (decision.physicalIds && decision.physicalIds.length >= 2) {
                console.log(`  → Adding subnet definitions to template (existing: ${decision.physicalIds.join(', ')})`);
            } else {
                console.log('  → Adding subnet definitions to template (new)');
            }

            this.createSubnetsInTemplate(appDefinition, result, discoveredResources);

            // Use Refs for stack-managed resources
            result.vpcConfig.subnetIds = [
                { Ref: 'FriggPrivateSubnet1' },
                { Ref: 'FriggPrivateSubnet2' }
            ];
        } else if (decision.ownership === ResourceOwnership.EXTERNAL) {
            // Use external subnet IDs directly (no definitions in template)
            result.vpcConfig.subnetIds = decision.physicalIds;
            console.log(`  ✓ Using external subnets: ${decision.physicalIds.join(', ')}`);
        }
    }

    /**
     * Create subnet resources in CloudFormation template
     */
    createSubnetsInTemplate(appDefinition, result, discoveredResources) {
        // Determine VPC ID for subnets
        const vpcId = result.vpcId;

        // Generate subnet CIDRs
        const cidrs = this.generateSubnetCidrsForNewVpc(vpcId, discoveredResources);

        // Private Subnet 1
        result.resources.FriggPrivateSubnet1 = {
            Type: 'AWS::EC2::Subnet',
            DeletionPolicy: 'Retain',
            Properties: {
                VpcId: vpcId,
                CidrBlock: cidrs.private1,
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-1' },
                    { Key: 'Type', Value: 'Private' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Private Subnet 2
        result.resources.FriggPrivateSubnet2 = {
            Type: 'AWS::EC2::Subnet',
            DeletionPolicy: 'Retain',
            Properties: {
                VpcId: vpcId,
                CidrBlock: cidrs.private2,
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-2' },
                    { Key: 'Type', Value: 'Private' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Public Subnets (for NAT Gateway)
        result.resources.FriggPublicSubnet = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: vpcId,
                CidrBlock: cidrs.public1,
                MapPublicIpOnLaunch: true,
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-1' },
                    { Key: 'Type', Value: 'Public' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        result.resources.FriggPublicSubnet2 = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: vpcId,
                CidrBlock: cidrs.public2,
                MapPublicIpOnLaunch: true,
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-2' },
                    { Key: 'Type', Value: 'Public' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        result.vpcConfig.subnetIds = [
            { Ref: 'FriggPrivateSubnet1' },
            { Ref: 'FriggPrivateSubnet2' },
        ];

        // Map to discovered resources for other builders
        discoveredResources.privateSubnetId1 = { Ref: 'FriggPrivateSubnet1' };
        discoveredResources.privateSubnetId2 = { Ref: 'FriggPrivateSubnet2' };
        discoveredResources.publicSubnetId1 = { Ref: 'FriggPublicSubnet' };
        discoveredResources.publicSubnetId2 = { Ref: 'FriggPublicSubnet2' };

        console.log('  ✅ Subnet resources added to template');
    }

    /**
     * Generate subnet CIDRs for new VPC or existing VPC
     */
    generateSubnetCidrsForNewVpc(vpcId, discoveredResources) {
        // If VPC is a Ref (new VPC), use Fn::Cidr
        if (typeof vpcId === 'object' && vpcId.Ref === 'FriggVPC') {
            return {
                private1: { 'Fn::Select': [0, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                private2: { 'Fn::Select': [1, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                public1: { 'Fn::Select': [2, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                public2: { 'Fn::Select': [3, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
            };
        }

        // For existing VPC, find available CIDRs
        const existingCidrs = new Set();
        if (discoveredResources?.subnets) {
            for (const subnet of discoveredResources.subnets) {
                if (subnet.CidrBlock) {
                    existingCidrs.add(subnet.CidrBlock);
                }
            }
        }

        const findAvailableCidr = (startOctet, endOctet) => {
            for (let octet = startOctet; octet <= endOctet; octet++) {
                const candidate = `172.31.${octet}.0/24`;
                if (!existingCidrs.has(candidate)) {
                    existingCidrs.add(candidate);
                    return candidate;
                }
            }
            return `172.31.${startOctet}.0/24`;
        };

        return {
            private1: findAvailableCidr(240, 249),
            private2: findAvailableCidr(240, 249),
            public1: findAvailableCidr(250, 255),
            public2: findAvailableCidr(250, 255),
        };
    }

    /**
     * Build NAT Gateway based on ownership decision
     */
    buildNatGatewayFromDecision(decision, appDefinition, discoveredResources, result) {
        if (!decision.ownership) {
            console.log('  ⊝ NAT Gateway disabled');
            return;
        }

        if (decision.ownership === ResourceOwnership.STACK) {
            if (decision.physicalId) {
                // NAT Gateway exists in stack - CloudFormation will handle it
                console.log(`  ✓ NAT Gateway in stack: ${decision.physicalId}`);
                // Still need to ensure route tables are set up
                this.createNatGatewayRouting(appDefinition, discoveredResources, result, { Ref: 'FriggNATGateway' });
            } else {
                // Create new NAT Gateway
                console.log('  → Creating NAT Gateway in template...');
                this.createNatGatewayInTemplate(appDefinition, discoveredResources, result);
            }
        } else if (decision.ownership === ResourceOwnership.EXTERNAL) {
            // Use external NAT Gateway
            console.log(`  ✓ Using external NAT Gateway: ${decision.physicalId}`);
            result.natGatewayId = decision.physicalId;
            this.createNatGatewayRouting(appDefinition, discoveredResources, result, decision.physicalId);
        }
    }

    /**
     * Create NAT Gateway resources in CloudFormation template
     */
    createNatGatewayInTemplate(appDefinition, discoveredResources, result) {
        // Elastic IP for NAT Gateway
        result.resources.FriggNATGatewayEIP = {
            Type: 'AWS::EC2::EIP',
            DeletionPolicy: 'Retain',
            UpdateReplacePolicy: 'Retain',
            Properties: {
                Domain: 'vpc',
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-eip' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // NAT Gateway in public subnet
        result.resources.FriggNATGateway = {
            Type: 'AWS::EC2::NatGateway',
            DeletionPolicy: 'Retain',
            UpdateReplacePolicy: 'Retain',
            Properties: {
                AllocationId: { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] },
                SubnetId: discoveredResources.publicSubnetId1 || { Ref: 'FriggPublicSubnet' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Create public routing
        this.createPublicRouting(appDefinition, discoveredResources, result);

        // Create NAT routing
        this.createNatGatewayRouting(appDefinition, discoveredResources, result, { Ref: 'FriggNATGateway' });

        console.log('  ✅ NAT Gateway resources added to template');
    }

    /**
     * Build VPC Endpoints based on ownership decisions
     */
    buildVpcEndpointsFromDecisions(decisions, appDefinition, result) {
        const endpointsToCreate = [];
        const endpointsInStack = [];
        const externalEndpoints = [];

        // Analyze decisions
        Object.entries(decisions).forEach(([type, decision]) => {
            if (decision.ownership === ResourceOwnership.STACK && !decision.physicalId) {
                endpointsToCreate.push(type);
            } else if (decision.ownership === ResourceOwnership.STACK && decision.physicalId) {
                endpointsInStack.push(type);
            } else if (decision.ownership === ResourceOwnership.EXTERNAL) {
                externalEndpoints.push(type);
            }
        });

        if (endpointsInStack.length > 0) {
            console.log(`  ✓ VPC Endpoints in stack: ${endpointsInStack.join(', ')}`);
        }

        if (externalEndpoints.length > 0) {
            console.log(`  ✓ External VPC Endpoints: ${externalEndpoints.join(', ')}`);
        }

        if (endpointsToCreate.length === 0) {
            if (endpointsInStack.length === 0 && externalEndpoints.length === 0) {
                console.log('  ⊝ VPC Endpoints disabled');
            }
            return;
        }

        console.log(`  → Creating VPC Endpoints: ${endpointsToCreate.join(', ')}...`);

        const vpcId = result.vpcId;

        // Create route table if needed
        if (!result.resources.FriggLambdaRouteTable) {
            result.resources.FriggLambdaRouteTable = {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: vpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };
        }

        // Ensure subnet associations
        this.ensureSubnetAssociations(appDefinition, {}, result);

        // Create endpoints
        if (endpointsToCreate.includes('s3')) {
            result.resources.FriggS3VPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: [{ Ref: 'FriggLambdaRouteTable' }],
                },
            };
        }

        if (endpointsToCreate.includes('dynamodb')) {
            result.resources.FriggDynamoDBVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.dynamodb',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: [{ Ref: 'FriggLambdaRouteTable' }],
                },
            };
        }

        // Create security group for interface endpoints if needed
        const needsInterfaceEndpoints = endpointsToCreate.some(type => ['kms', 'secretsManager', 'sqs'].includes(type));
        if (needsInterfaceEndpoints) {
            result.resources.FriggVPCEndpointSecurityGroup = {
                Type: 'AWS::EC2::SecurityGroup',
                Properties: {
                    GroupDescription: 'Security group for VPC Endpoints',
                    VpcId: vpcId,
                    SecurityGroupIngress: [
                        {
                            IpProtocol: 'tcp',
                            FromPort: 443,
                            ToPort: 443,
                            SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                            Description: 'HTTPS from Lambda',
                        },
                    ],
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc-endpoint-sg' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };
        }

        if (endpointsToCreate.includes('kms')) {
            result.resources.FriggKMSVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.kms',
                    VpcEndpointType: 'Interface',
                    SubnetIds: result.vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        if (endpointsToCreate.includes('secretsManager')) {
            result.resources.FriggSecretsManagerVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.secretsmanager',
                    VpcEndpointType: 'Interface',
                    SubnetIds: result.vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        if (endpointsToCreate.includes('sqs')) {
            result.resources.FriggSQSVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.sqs',
                    VpcEndpointType: 'Interface',
                    SubnetIds: result.vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        console.log(`  ✅ VPC Endpoint resources added to template`);
    }

    /**
     * Perform self-healing checks and fixes
     */
    performSelfHealing(discoveredResources, appDefinition) {
        console.log('🔧 VPC Self-healing mode enabled - checking for misconfigurations...');

        const healingReport = {
            healed: [],
            warnings: [],
            errors: [],
        };

        // Check for NAT Gateway in private subnet
        if (discoveredResources.natGatewayInPrivateSubnet) {
            healingReport.warnings.push(
                `NAT Gateway ${discoveredResources.natGatewayInPrivateSubnet} is in a private subnet`
            );
            healingReport.healed.push(
                'Will create new NAT Gateway in public subnet'
            );
            discoveredResources.needsNewNatGateway = true;
        }

        // Check for orphaned Elastic IPs
        if (discoveredResources.orphanedElasticIps?.length > 0) {
            healingReport.warnings.push(
                `Found ${discoveredResources.orphanedElasticIps.length} orphaned Elastic IPs`
            );
        }

        // Check for subnet routing issues
        if (discoveredResources.privateSubnetsWithWrongRoutes?.length > 0) {
            healingReport.warnings.push(
                `Found ${discoveredResources.privateSubnetsWithWrongRoutes.length} subnets with wrong routes`
            );
            healingReport.healed.push('Will create correct route tables');
        }

        // Log healing report
        if (healingReport.healed.length > 0) {
            console.log('  ✅ Self-healing actions:');
            healingReport.healed.forEach(action => console.log(`     - ${action}`));
        }
        if (healingReport.warnings.length > 0) {
            console.log('  ⚠️  Issues detected:');
            healingReport.warnings.forEach(warning => console.log(`     - ${warning}`));
        }

        return healingReport;
    }

    /**
     * Build new VPC from scratch
     */
    async buildNewVpc(appDefinition, discoveredResources, result) {
        console.log('  Creating new VPC infrastructure...');

        const cidrBlock = appDefinition.vpc.cidrBlock || '10.0.0.0/16';

        // Main VPC
        result.resources.FriggVPC = {
            Type: 'AWS::EC2::VPC',
            Properties: {
                CidrBlock: cidrBlock,
                EnableDnsHostnames: true,
                EnableDnsSupport: true,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                    { Key: 'Service', Value: '${self:service}' },
                    { Key: 'Stage', Value: '${self:provider.stage}' },
                ],
            },
        };

        // Internet Gateway
        result.resources.FriggInternetGateway = {
            Type: 'AWS::EC2::InternetGateway',
            Properties: {
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-igw' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        result.resources.FriggVPCGatewayAttachment = {
            Type: 'AWS::EC2::VPCGatewayAttachment',
            Properties: {
                VpcId: { Ref: 'FriggVPC' },
                InternetGatewayId: { Ref: 'FriggInternetGateway' },
            },
        };

        // Lambda Security Group
        result.resources.FriggLambdaSecurityGroup = {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg Lambda functions',
                VpcId: { Ref: 'FriggVPC' },
                SecurityGroupEgress: [
                    { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0', Description: 'HTTPS outbound' },
                    { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0', Description: 'HTTP outbound' },
                    { IpProtocol: 'tcp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS TCP' },
                    { IpProtocol: 'udp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS UDP' },
                    { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, CidrIp: '0.0.0.0/0', Description: 'PostgreSQL' },
                    { IpProtocol: 'tcp', FromPort: 27017, ToPort: 27017, CidrIp: '0.0.0.0/0', Description: 'MongoDB' },
                ],
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-sg' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        result.vpcId = { Ref: 'FriggVPC' };
        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];

        console.log('  ✅ New VPC infrastructure resources created');
    }

    /**
     * Use existing VPC (explicitly provided)
     */
    async useExistingVpc(appDefinition, discoveredResources, result) {
        console.log('  Using existing VPC...');

        if (!appDefinition.vpc.vpcId) {
            throw new Error('vpc.vpcId is required when management="use-existing"');
        }

        result.vpcId = appDefinition.vpc.vpcId;
        result.vpcConfig.securityGroupIds = appDefinition.vpc.securityGroupIds ||
            (discoveredResources.defaultSecurityGroupId ? [discoveredResources.defaultSecurityGroupId] : []);

        console.log(`  ✅ Using VPC: ${result.vpcId}`);
    }

    /**
     * Discover existing VPC from AWS
     */
    async discoverVpc(appDefinition, discoveredResources, result) {
        console.log('  Discovering existing VPC...');

        if (!discoveredResources.defaultVpcId) {
            throw new Error(
                'VPC discovery failed: No VPC found. Set vpc.management to "create-new" or provide vpc.vpcId with "use-existing".'
            );
        }

        result.vpcId = discoveredResources.defaultVpcId;

        // Check if resources came from CloudFormation stack
        const fromCfStack = discoveredResources.fromCloudFormationStack === true;
        const existingLogicalIds = discoveredResources.existingLogicalIds || [];

        if (fromCfStack && existingLogicalIds.length > 0) {
            console.log(`  ✓ VPC discovered from CloudFormation stack: ${discoveredResources.stackName}`);
            console.log(`  ✓ Found ${existingLogicalIds.length} existing resources in stack`);
            console.log('  ℹ Adding resources to template for idempotent deployment');
        } else {
            // VPC discovered from AWS API (not from CF stack)
            console.log('  ℹ VPC discovered from AWS API - will create Lambda security group');
        }

        // Always create Lambda security group in template for idempotent deployments
        // CloudFormation will recognize it already exists and won't recreate it
        result.resources.FriggLambdaSecurityGroup = {
            Type: 'AWS::EC2::SecurityGroup',
            Properties: {
                GroupDescription: 'Security group for Frigg Lambda functions',
                VpcId: result.vpcId,
                SecurityGroupEgress: [
                    { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0', Description: 'HTTPS outbound' },
                    { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0', Description: 'HTTP outbound' },
                    { IpProtocol: 'tcp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS TCP' },
                    { IpProtocol: 'udp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0', Description: 'DNS UDP' },
                    { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, CidrIp: '0.0.0.0/0', Description: 'PostgreSQL' },
                    { IpProtocol: 'tcp', FromPort: 27017, ToPort: 27017, CidrIp: '0.0.0.0/0', Description: 'MongoDB' },
                ],
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-sg' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Always use Ref since resource is in template
        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];

        console.log(`  ✅ Discovered VPC: ${result.vpcId}`);
    }

    /**
     * Build subnet infrastructure
     * @param {Object} vpcManagement - Normalized VPC management mode (passed from build() to ensure consistency)
     */
    async buildSubnets(appDefinition, discoveredResources, result, vpcManagement) {
        // Default subnet management depends on context:
        // - Stack-managed subnets discovered: discover (reuse existing)
        // - use-existing mode with subnet IDs provided: use-existing
        // - create-new mode: create
        // - discover mode without stack subnets: create (for stage isolation)
        let defaultSubnetManagement = 'create';

        // Check if stack-managed subnets were discovered from CloudFormation
        // Only reuse if they're actual subnet IDs (strings), not CloudFormation Refs (objects)
        const hasStackManagedSubnets =
            discoveredResources?.privateSubnetId1 &&
            discoveredResources?.privateSubnetId2 &&
            typeof discoveredResources.privateSubnetId1 === 'string' &&
            typeof discoveredResources.privateSubnetId2 === 'string';

        if (hasStackManagedSubnets) {
            defaultSubnetManagement = 'discover';
        } else if (vpcManagement === 'use-existing' && appDefinition.vpc.subnets?.ids?.length >= 2) {
            defaultSubnetManagement = 'use-existing';
        }

        const subnetManagement = appDefinition.vpc.subnets?.management || defaultSubnetManagement;

        console.log(`  Subnet Management Mode: ${subnetManagement} (default: ${defaultSubnetManagement}, explicit: ${appDefinition.vpc.subnets?.management})`);

        switch (subnetManagement) {
            case 'create':
                this.createSubnets(appDefinition, discoveredResources, result, vpcManagement);
                break;
            case 'use-existing':
                this.useExistingSubnets(appDefinition, result);
                break;
            case 'discover':
            default:
                this.discoverSubnets(appDefinition, discoveredResources, result);
                break;
        }
    }

    /**
     * Create new subnets
     */
    createSubnets(appDefinition, discoveredResources, result, vpcManagement) {
        console.log('    Creating new subnets...');

        const subnetVpcId = vpcManagement === 'create-new' ? { Ref: 'FriggVPC' } : result.vpcId;

        // Generate CIDRs - pass discovered resources to avoid conflicts
        const cidrs = this.generateSubnetCidrs(vpcManagement, discoveredResources);

        // Private Subnet 1
        result.resources.FriggPrivateSubnet1 = {
            Type: 'AWS::EC2::Subnet',
            DeletionPolicy: 'Retain',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: cidrs.private1,
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-1' },
                    { Key: 'Type', Value: 'Private' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Private Subnet 2
        result.resources.FriggPrivateSubnet2 = {
            Type: 'AWS::EC2::Subnet',
            DeletionPolicy: 'Retain',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: cidrs.private2,
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-private-2' },
                    { Key: 'Type', Value: 'Private' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Public Subnets (for NAT Gateway and Aurora if publicly accessible)
        result.resources.FriggPublicSubnet = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: cidrs.public1,
                MapPublicIpOnLaunch: true,
                AvailabilityZone: { 'Fn::Select': [0, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-1' },
                    { Key: 'Type', Value: 'Public' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        result.resources.FriggPublicSubnet2 = {
            Type: 'AWS::EC2::Subnet',
            Properties: {
                VpcId: subnetVpcId,
                CidrBlock: cidrs.public2,
                MapPublicIpOnLaunch: true,
                AvailabilityZone: { 'Fn::Select': [1, { 'Fn::GetAZs': '' }] },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-2' },
                    { Key: 'Type', Value: 'Public' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        result.vpcConfig.subnetIds = [
            { Ref: 'FriggPrivateSubnet1' },
            { Ref: 'FriggPrivateSubnet2' },
        ];

        // Map to discovered resources for other builders (Aurora, etc.)
        discoveredResources.privateSubnetId1 = { Ref: 'FriggPrivateSubnet1' };
        discoveredResources.privateSubnetId2 = { Ref: 'FriggPrivateSubnet2' };
        discoveredResources.publicSubnetId1 = { Ref: 'FriggPublicSubnet' };
        discoveredResources.publicSubnetId2 = { Ref: 'FriggPublicSubnet2' };

        console.log('    ✅ Subnets created');
    }

    /**
     * Use existing subnets
     */
    useExistingSubnets(appDefinition, result) {
        console.log('    Using existing subnets...');

        if (!appDefinition.vpc.subnets?.ids || appDefinition.vpc.subnets.ids.length < 2) {
            throw new Error(
                'At least 2 subnet IDs required when subnets.management="use-existing"'
            );
        }

        result.vpcConfig.subnetIds = appDefinition.vpc.subnets.ids;
        console.log(`    ✅ Using ${result.vpcConfig.subnetIds.length} existing subnets`);
    }

    /**
     * Discover existing subnets from AWS
     */
    discoverSubnets(appDefinition, discoveredResources, result) {
        console.log('    Discovering subnets...');

        // Use explicitly provided subnet IDs first
        if (appDefinition.vpc.subnets?.ids?.length >= 2) {
            result.vpcConfig.subnetIds = appDefinition.vpc.subnets.ids;
            console.log(`    ✅ Using ${result.vpcConfig.subnetIds.length} provided subnets`);
            return;
        }

        // User explicitly set subnets.management: 'discover', so use discovered subnets
        // NOTE: This may cause route table conflicts if multiple stages share subnets
        // Default behavior is now to create stage-specific subnets (subnets.management: 'create')
        if (discoveredResources.privateSubnetId1 && discoveredResources.privateSubnetId2) {
            result.vpcConfig.subnetIds = [
                discoveredResources.privateSubnetId1,
                discoveredResources.privateSubnetId2,
            ];
            console.log('    ✅ Using discovered subnets (backwards compatibility mode)');
            return;
        }

        // No subnets found - create if self-heal enabled
        if (appDefinition.vpc.selfHeal) {
            console.log('    ⚠️  No subnets found - self-heal will create them');
            this.createSubnets(appDefinition, discoveredResources, result, 'discover');
        } else {
            throw new Error(
                'No subnets discovered. Enable vpc.selfHeal, set subnets.management to "create", or provide subnet IDs.'
            );
        }
    }

    /**
     * Generate subnet CIDR blocks
     * Finds available CIDRs that don't conflict with existing subnets
     */
    generateSubnetCidrs(vpcManagement, discoveredResources) {
        if (vpcManagement === 'create-new') {
            // Use CloudFormation Fn::Cidr for dynamic generation
            return {
                private1: { 'Fn::Select': [0, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                private2: { 'Fn::Select': [1, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                public1: { 'Fn::Select': [2, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                public2: { 'Fn::Select': [3, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
            };
        } else {
            // Find available CIDRs for existing VPC by checking existing subnets
            const existingCidrs = new Set();

            // Collect all existing subnet CIDRs
            if (discoveredResources?.subnets) {
                for (const subnet of discoveredResources.subnets) {
                    if (subnet.CidrBlock) {
                        existingCidrs.add(subnet.CidrBlock);
                    }
                }
            }

            console.log(`    Found ${existingCidrs.size} existing subnet CIDRs in VPC`);

            // Generate candidates in the default VPC range (172.31.0.0/16)
            // Private subnets: 240-249, Public subnets: 250-255
            const findAvailableCidr = (startOctet, endOctet) => {
                for (let octet = startOctet; octet <= endOctet; octet++) {
                    const candidate = `172.31.${octet}.0/24`;
                    if (!existingCidrs.has(candidate)) {
                        existingCidrs.add(candidate); // Mark as used immediately
                        return candidate;
                    }
                }
                // Fallback if range exhausted
                return `172.31.${startOctet}.0/24`;
            };

            const privateRange = { start: 240, end: 249 };
            const publicRange = { start: 250, end: 255 };

            const cidrs = {
                private1: findAvailableCidr(privateRange.start, privateRange.end),
                private2: findAvailableCidr(privateRange.start, privateRange.end),
                public1: findAvailableCidr(publicRange.start, publicRange.end),
                public2: findAvailableCidr(publicRange.start, publicRange.end),
            };

            console.log(`    Using available CIDRs: ${Object.values(cidrs).join(', ')}`);

            return cidrs;
        }
    }

    /**
     * Build NAT Gateway for private subnet internet access
     */
    async buildNatGateway(appDefinition, discoveredResources, result) {
        const natManagement = appDefinition.vpc.natGateway?.management || 'discover';

        console.log(`  NAT Gateway Management: ${natManagement}`);

        // Check if resources came from CloudFormation stack
        const fromCfStack = discoveredResources.fromCloudFormationStack === true;
        const existingLogicalIds = discoveredResources.existingLogicalIds || [];

        if (fromCfStack && existingLogicalIds.length > 0) {
            console.log('    Skipping NAT Gateway - will reuse from CloudFormation stack');
            return;
        }

        // Check if we should create NAT Gateway
        const needsNatGateway = natManagement === 'createAndManage' ||
            discoveredResources.needsNewNatGateway === true;

        if (!needsNatGateway && natManagement === 'discover') {
            console.log('    Skipping NAT Gateway (discovery mode)');
            return;
        }

        // Check if we should reuse existing
        if (appDefinition.vpc.natGateway?.id) {
            console.log(`    Using existing NAT Gateway: ${appDefinition.vpc.natGateway.id}`);
            result.natGatewayId = appDefinition.vpc.natGateway.id;
            return;
        }

        if (discoveredResources.existingNatGatewayId && !discoveredResources.natGatewayInPrivateSubnet) {
            console.log(`    Reusing discovered NAT Gateway: ${discoveredResources.existingNatGatewayId}`);
            result.natGatewayId = discoveredResources.existingNatGatewayId;

            // Still need to create route table and associations for discovered NAT
            this.createNatGatewayRouting(appDefinition, discoveredResources, result, discoveredResources.existingNatGatewayId);
            return;
        }

        // Create new NAT Gateway
        console.log('    Creating new NAT Gateway...');

        // Elastic IP for NAT Gateway
        result.resources.FriggNATGatewayEIP = {
            Type: 'AWS::EC2::EIP',
            DeletionPolicy: 'Retain',
            UpdateReplacePolicy: 'Retain',
            Properties: {
                Domain: 'vpc',
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat-eip' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // NAT Gateway in public subnet
        result.resources.FriggNATGateway = {
            Type: 'AWS::EC2::NatGateway',
            DeletionPolicy: 'Retain',
            UpdateReplacePolicy: 'Retain',
            Properties: {
                AllocationId: { 'Fn::GetAtt': ['FriggNATGatewayEIP', 'AllocationId'] },
                SubnetId: discoveredResources.publicSubnetId1 || { Ref: 'FriggPublicSubnet' },
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-nat' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Create public routing (public subnets → Internet Gateway)
        this.createPublicRouting(appDefinition, discoveredResources, result);

        // Create routing for the new NAT Gateway (private subnets → NAT → IGW)
        this.createNatGatewayRouting(appDefinition, discoveredResources, result, { Ref: 'FriggNATGateway' });

        console.log('    ✅ NAT Gateway infrastructure created');
    }

    /**
     * Create public route table with Internet Gateway route
     * Required for NAT Gateway to have internet access
     */
    createPublicRouting(appDefinition, discoveredResources, result) {
        // Public route table with Internet Gateway route
        result.resources.FriggPublicRouteTable = {
            Type: 'AWS::EC2::RouteTable',
            Properties: {
                VpcId: result.vpcId,
                Tags: [
                    { Key: 'Name', Value: '${self:service}-${self:provider.stage}-public-rt' },
                    { Key: 'ManagedBy', Value: 'Frigg' },
                ],
            },
        };

        // Route to Internet Gateway
        result.resources.FriggPublicRoute = {
            Type: 'AWS::EC2::Route',
            DependsOn: 'FriggVPCGatewayAttachment',
            Properties: {
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                GatewayId: { Ref: 'FriggInternetGateway' },
            },
        };

        // Use discovered public subnets or created ones
        const publicSubnet1 = discoveredResources.publicSubnetId1 || { Ref: 'FriggPublicSubnet' };
        const publicSubnet2 = discoveredResources.publicSubnetId2 || { Ref: 'FriggPublicSubnet2' };

        // Associate public subnets with public route table
        result.resources.FriggPublicSubnet1RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: publicSubnet1,
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
            },
        };

        result.resources.FriggPublicSubnet2RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: publicSubnet2,
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
            },
        };
    }

    /**
     * Create route table and associations for NAT Gateway
     */
    createNatGatewayRouting(appDefinition, discoveredResources, result, natGatewayId) {
        // Private route table with NAT Gateway route
        if (!result.resources.FriggLambdaRouteTable) {
            result.resources.FriggLambdaRouteTable = {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: result.vpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };
        }

        result.resources.FriggPrivateRoute = {
            Type: 'AWS::EC2::Route',
            Properties: {
                RouteTableId: { Ref: 'FriggLambdaRouteTable' },
                DestinationCidrBlock: '0.0.0.0/0',
                NatGatewayId: natGatewayId,
            },
        };

        // Associate route table with private subnets
        // Use discovered subnet IDs or CloudFormation references
        const subnet1Id = discoveredResources.privateSubnetId1 || { Ref: 'FriggPrivateSubnet1' };
        const subnet2Id = discoveredResources.privateSubnetId2 || { Ref: 'FriggPrivateSubnet2' };

        result.resources.FriggPrivateSubnet1RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: subnet1Id,
                RouteTableId: { Ref: 'FriggLambdaRouteTable' },
            },
        };

        result.resources.FriggPrivateSubnet2RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: subnet2Id,
                RouteTableId: { Ref: 'FriggLambdaRouteTable' },
            },
        };

        console.log('    ✅ Route table and subnet associations created');
    }

    /**
     * Ensure subnet associations with route table
     * Called to heal missing associations when route table exists but associations don't
     */
    ensureSubnetAssociations(appDefinition, discoveredResources, result) {
        // Skip if associations already created (by NAT Gateway routing)
        if (result.resources.FriggPrivateSubnet1RouteTableAssociation) {
            return; // Already handled by NAT Gateway routing
        }

        const routeTableId = discoveredResources.routeTableId || { Ref: 'FriggLambdaRouteTable' };
        const subnet1Id = discoveredResources.privateSubnetId1 || { Ref: 'FriggPrivateSubnet1' };
        const subnet2Id = discoveredResources.privateSubnetId2 || { Ref: 'FriggPrivateSubnet2' };

        result.resources.FriggPrivateSubnet1RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: subnet1Id,
                RouteTableId: routeTableId,
            },
        };

        result.resources.FriggPrivateSubnet2RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: subnet2Id,
                RouteTableId: routeTableId,
            },
        };

        console.log('  ✓ Ensured subnet associations with route table');
    }

    /**
     * Build VPC Endpoints for AWS services
     */
    buildVpcEndpoints(appDefinition, discoveredResources, result, existingEndpoints = {}) {
        // Check if endpoints are from CloudFormation stack (string IDs)
        // Stack-managed resources should be reused, not recreated
        const stackManagedEndpoints = {
            s3: discoveredResources.s3VpcEndpointId && typeof discoveredResources.s3VpcEndpointId === 'string',
            dynamodb: discoveredResources.dynamoDbVpcEndpointId && typeof discoveredResources.dynamoDbVpcEndpointId === 'string',
            kms: discoveredResources.kmsVpcEndpointId && typeof discoveredResources.kmsVpcEndpointId === 'string',
            secretsManager: discoveredResources.secretsManagerVpcEndpointId && typeof discoveredResources.secretsManagerVpcEndpointId === 'string',
            sqs: discoveredResources.sqsVpcEndpointId && typeof discoveredResources.sqsVpcEndpointId === 'string',
        };

        // Build list of what needs creation (not stack-managed, not existing elsewhere)
        const missing = [];
        if (!stackManagedEndpoints.s3 && !existingEndpoints.s3) missing.push('S3');
        if (!stackManagedEndpoints.dynamodb && !existingEndpoints.dynamodb) missing.push('DynamoDB');
        if (!stackManagedEndpoints.kms && !existingEndpoints.kms && appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') missing.push('KMS');
        if (!stackManagedEndpoints.secretsManager && !existingEndpoints.secretsManager) missing.push('Secrets Manager');
        // SQS endpoint needed for job queues and async processing
        if (!stackManagedEndpoints.sqs && !existingEndpoints.sqs) missing.push('SQS');

        // Log reused stack-managed endpoints
        const reused = [];
        if (stackManagedEndpoints.s3) reused.push('S3');
        if (stackManagedEndpoints.dynamodb) reused.push('DynamoDB');
        if (stackManagedEndpoints.kms) reused.push('KMS');
        if (stackManagedEndpoints.secretsManager) reused.push('Secrets Manager');
        if (stackManagedEndpoints.sqs) reused.push('SQS');

        if (reused.length > 0) {
            console.log(`  ✓ Reusing stack-managed VPC endpoints: ${reused.join(', ')}`);
        }

        if (missing.length > 0) {
            console.log(`  Creating missing VPC Endpoints: ${missing.join(', ')}...`);
        } else if (reused.length === 0) {
            console.log('  All required VPC Endpoints already exist - skipping creation');
            return;
        } else {
            // All endpoints are stack-managed, no creation needed
            return;
        }

        const vpcId = result.vpcId || discoveredResources.defaultVpcId;

        // Create route table for VPC endpoints if it doesn't exist
        // VPC endpoints (S3, DynamoDB) need to reference a route table
        if (!result.resources.FriggLambdaRouteTable) {
            result.resources.FriggLambdaRouteTable = {
                Type: 'AWS::EC2::RouteTable',
                Properties: {
                    VpcId: vpcId,
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-rt' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };
        }

        // Ensure subnet associations exist (healing for VPC endpoints without NAT Gateway)
        if (result.resources.FriggLambdaRouteTable || discoveredResources.routeTableId) {
            this.ensureSubnetAssociations(appDefinition, discoveredResources, result);
        }

        // S3 Gateway Endpoint (only if not stack-managed and missing)
        if (!stackManagedEndpoints.s3 && !existingEndpoints.s3) {
            result.resources.FriggS3VPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.s3',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: [{ Ref: 'FriggLambdaRouteTable' }],
                },
            };
        }

        // DynamoDB Gateway Endpoint (only if not stack-managed and missing)
        if (!stackManagedEndpoints.dynamodb && !existingEndpoints.dynamodb) {
            result.resources.FriggDynamoDBVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.dynamodb',
                    VpcEndpointType: 'Gateway',
                    RouteTableIds: [{ Ref: 'FriggLambdaRouteTable' }],
                },
            };
        }

        // VPC Endpoint Security Group (only if KMS, Secrets Manager, or SQS are not stack-managed and missing)
        const needsSecurityGroup =
            (!stackManagedEndpoints.kms && !existingEndpoints.kms && appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') ||
            (!stackManagedEndpoints.secretsManager && !existingEndpoints.secretsManager) ||
            (!stackManagedEndpoints.sqs && !existingEndpoints.sqs);

        if (needsSecurityGroup) {
            result.resources.FriggVPCEndpointSecurityGroup = {
                Type: 'AWS::EC2::SecurityGroup',
                Properties: {
                    GroupDescription: 'Security group for VPC Endpoints',
                    VpcId: vpcId,
                    SecurityGroupIngress: [
                        {
                            IpProtocol: 'tcp',
                            FromPort: 443,
                            ToPort: 443,
                            SourceSecurityGroupId: { Ref: 'FriggLambdaSecurityGroup' },
                            Description: 'HTTPS from Lambda',
                        },
                    ],
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-vpc-endpoint-sg' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                    ],
                },
            };
        }

        // KMS Interface Endpoint (only if not stack-managed, missing, AND KMS encryption is enabled)
        if (!stackManagedEndpoints.kms && !existingEndpoints.kms && appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') {
            result.resources.FriggKMSVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.kms',
                    VpcEndpointType: 'Interface',
                    SubnetIds: result.vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        // Secrets Manager Interface Endpoint (only if not stack-managed and missing)
        if (!stackManagedEndpoints.secretsManager && !existingEndpoints.secretsManager) {
            result.resources.FriggSecretsManagerVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.secretsmanager',
                    VpcEndpointType: 'Interface',
                    SubnetIds: result.vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        // SQS Interface Endpoint (only if not stack-managed and missing)
        // Used for job queues and async processing (not just database migrations)
        if (!stackManagedEndpoints.sqs && !existingEndpoints.sqs) {
            result.resources.FriggSQSVPCEndpoint = {
                Type: 'AWS::EC2::VPCEndpoint',
                Properties: {
                    VpcId: vpcId,
                    ServiceName: 'com.amazonaws.${self:provider.region}.sqs',
                    VpcEndpointType: 'Interface',
                    SubnetIds: result.vpcConfig.subnetIds,
                    SecurityGroupIds: [{ Ref: 'FriggVPCEndpointSecurityGroup' }],
                    PrivateDnsEnabled: true,
                },
            };
        }

        console.log(`    ✅ Created ${missing.length} VPC endpoint(s): ${missing.join(', ')}`);
    }
}

module.exports = { VpcBuilder };

