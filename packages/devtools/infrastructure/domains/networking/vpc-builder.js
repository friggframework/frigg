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
     * Build complete VPC infrastructure based on management mode
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Building VPC infrastructure...`);

        const result = {
            resources: {},
            vpcConfig: {
                securityGroupIds: [],
                subnetIds: [],
            },
            iamStatements: [],
            outputs: {},
        };

        // Add IAM permissions for VPC-enabled Lambda functions
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

        // Normalize top-level managementMode (simplified API)
        const globalMode = appDefinition.managementMode || 'discover';
        const vpcIsolation = appDefinition.vpcIsolation || 'shared';

        let management = appDefinition.vpc.management;

        if (globalMode === 'managed') {
            // Warn about ignored granular options
            this.warnIgnoredOptions(appDefinition);
            
            // Clear granular options to prevent conflicts
            delete appDefinition.vpc.management;
            if (appDefinition.vpc.subnets) delete appDefinition.vpc.subnets.management;
            if (appDefinition.vpc.natGateway) delete appDefinition.vpc.natGateway.management;
            delete appDefinition.vpc.shareAcrossStages;
            
            // Set management based on isolation strategy
            if (vpcIsolation === 'isolated') {
                management = 'create-new';
                appDefinition.vpc.natGateway = appDefinition.vpc.natGateway || {};
                appDefinition.vpc.natGateway.management = 'createAndManage';
                console.log(`  managementMode='managed' + vpcIsolation='isolated' → creating new VPC`);
            } else {
                management = 'discover';
                appDefinition.vpc.selfHeal = true;
                console.log(`  managementMode='managed' + vpcIsolation='shared' → discovering VPC`);
            }
        } else if (globalMode === 'existing') {
            management = 'use-existing';
        } else if (!management && appDefinition.vpc.shareAcrossStages !== undefined) {
            // Legacy shareAcrossStages support (backwards compatibility)
            management = appDefinition.vpc.shareAcrossStages ? 'discover' : 'create-new';
            console.log(`  VPC Sharing: ${appDefinition.vpc.shareAcrossStages ? 'shared' : 'isolated'} (translated to ${management})`);
            
            if (!appDefinition.vpc.shareAcrossStages && !appDefinition.vpc.natGateway?.management) {
                appDefinition.vpc.natGateway = appDefinition.vpc.natGateway || {};
                appDefinition.vpc.natGateway.management = 'createAndManage';
                console.log(`  NAT Gateway: creating isolated NAT (shareAcrossStages=false)`);
            }
        } else {
            management = management || 'discover';
        }
        
        console.log(`  VPC Management Mode: ${management}`);

        // Handle self-healing if enabled
        if (appDefinition.vpc.selfHeal) {
            this.performSelfHealing(discoveredResources, appDefinition);
        }

        // Build VPC based on management mode
        switch (management) {
            case 'create-new':
                await this.buildNewVpc(appDefinition, discoveredResources, result);
                break;
            case 'use-existing':
                await this.useExistingVpc(appDefinition, discoveredResources, result);
                break;
            case 'discover':
            default:
                await this.discoverVpc(appDefinition, discoveredResources, result);
                break;
        }

        // Build subnets - pass normalized management mode for correct CIDR generation
        await this.buildSubnets(appDefinition, discoveredResources, result, management);

        // Build NAT Gateway if needed
        await this.buildNatGateway(appDefinition, discoveredResources, result);

        // Build VPC Endpoints if enabled
        const vpcManagement = appDefinition.vpc.management || 'discover';
        const selfHeal = appDefinition.vpc.selfHeal !== false;
        // Check which VPC endpoints already exist
        const existingEndpoints = {
            s3: discoveredResources.s3VpcEndpointId,
            dynamodb: discoveredResources.dynamodbVpcEndpointId,
            kms: discoveredResources.kmsVpcEndpointId,
            secretsManager: discoveredResources.secretsManagerVpcEndpointId,
            sqs: discoveredResources.sqsVpcEndpointId,
        };
        const allEndpointsExist = existingEndpoints.s3 && existingEndpoints.dynamodb &&
            existingEndpoints.kms && existingEndpoints.secretsManager && existingEndpoints.sqs;
        const someEndpointsExist = existingEndpoints.s3 || existingEndpoints.dynamodb ||
            existingEndpoints.kms || existingEndpoints.secretsManager || existingEndpoints.sqs;

        if (appDefinition.vpc.enableVPCEndpoints !== false) {
            if (vpcManagement === 'create-new') {
                // Always create in create-new mode
                this.buildVpcEndpoints(appDefinition, discoveredResources, result, existingEndpoints);
            } else if (vpcManagement === 'discover') {
                if (allEndpointsExist) {
                    console.log('  All VPC endpoints already exist - skipping creation');
                } else if (selfHeal) {
                    if (someEndpointsExist) {
                        console.log('  Some VPC endpoints found - selfHeal creating missing ones');
                    } else {
                        console.log('  No VPC endpoints found - selfHeal creating them');
                    }
                    this.buildVpcEndpoints(appDefinition, discoveredResources, result, existingEndpoints);
                } else {
                    console.log('  VPC endpoints not found and selfHeal disabled - skipping');
                }
            }
        }

        // Set VPC_ENABLED environment variable so runtime can detect VPC configuration
        if (!result.environment) {
            result.environment = {};
        }
        result.environment.VPC_ENABLED = 'true';

        console.log(`[${this.name}] ✅ VPC infrastructure built successfully`);
        console.log(`  - VPC ID: ${result.vpcId || 'from discovery'}`);
        console.log(`  - Subnets: ${result.vpcConfig.subnetIds.length}`);
        console.log(`  - Security Groups: ${result.vpcConfig.securityGroupIds.length}`);

        return result;
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

        // Create a Lambda security group in the discovered VPC
        // This is needed even in discover mode so other resources can reference it
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

        result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];

        console.log(`  ✅ Discovered VPC: ${result.vpcId}`);
    }

    /**
     * Build subnet infrastructure
     * @param {Object} vpcManagement - Normalized VPC management mode (passed from build() to ensure consistency)
     */
    async buildSubnets(appDefinition, discoveredResources, result, vpcManagement) {
        // Default subnet management depends on context:
        // - use-existing mode with subnet IDs provided: use-existing
        // - create-new mode: create
        // - discover mode: create (for stage isolation)
        let defaultSubnetManagement = 'create';
        if (vpcManagement === 'use-existing' && appDefinition.vpc.subnets?.ids?.length >= 2) {
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

        // Generate CIDRs
        const cidrs = this.generateSubnetCidrs(vpcManagement);

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
     */
    generateSubnetCidrs(vpcManagement) {
        if (vpcManagement === 'create-new') {
            // Use CloudFormation Fn::Cidr for dynamic generation
            return {
                private1: { 'Fn::Select': [0, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                private2: { 'Fn::Select': [1, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                public1: { 'Fn::Select': [2, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
                public2: { 'Fn::Select': [3, { 'Fn::Cidr': ['10.0.0.0/16', 4, 8] }] },
            };
        } else {
            // Static CIDRs for existing VPC (default VPC range)
            return {
                private1: '172.31.240.0/24',
                private2: '172.31.241.0/24',
                public1: '172.31.250.0/24',
                public2: '172.31.251.0/24',
            };
        }
    }

    /**
     * Build NAT Gateway for private subnet internet access
     */
    async buildNatGateway(appDefinition, discoveredResources, result) {
        const natManagement = appDefinition.vpc.natGateway?.management || 'discover';

        console.log(`  NAT Gateway Management: ${natManagement}`);

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
        this.createPublicRouting(appDefinition, result);

        // Create routing for the new NAT Gateway (private subnets → NAT → IGW)
        this.createNatGatewayRouting(appDefinition, discoveredResources, result, { Ref: 'FriggNATGateway' });

        console.log('    ✅ NAT Gateway infrastructure created');
    }

    /**
     * Create public route table with Internet Gateway route
     * Required for NAT Gateway to have internet access
     */
    createPublicRouting(appDefinition, result) {
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

        // Associate public subnets with public route table
        result.resources.FriggPublicSubnet1RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPublicSubnet' },
                RouteTableId: { Ref: 'FriggPublicRouteTable' },
            },
        };

        result.resources.FriggPublicSubnet2RouteTableAssociation = {
            Type: 'AWS::EC2::SubnetRouteTableAssociation',
            Properties: {
                SubnetId: { Ref: 'FriggPublicSubnet2' },
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
     * Build VPC Endpoints for AWS services
     */
    buildVpcEndpoints(appDefinition, discoveredResources, result, existingEndpoints = {}) {
        const missing = [];
        if (!existingEndpoints.s3) missing.push('S3');
        if (!existingEndpoints.dynamodb) missing.push('DynamoDB');
        if (!existingEndpoints.kms && appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') missing.push('KMS');
        if (!existingEndpoints.secretsManager) missing.push('Secrets Manager');
        // SQS endpoint needed for database migrations (migration queue)
        if (!existingEndpoints.sqs && appDefinition.database?.postgres?.enable) missing.push('SQS');

        if (missing.length > 0) {
            console.log(`  Creating missing VPC Endpoints: ${missing.join(', ')}...`);
        } else {
            console.log('  All required VPC Endpoints already exist - skipping creation');
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

        // S3 Gateway Endpoint (only if missing)
        if (!existingEndpoints.s3) {
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

        // DynamoDB Gateway Endpoint (only if missing)
        if (!existingEndpoints.dynamodb) {
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

        // VPC Endpoint Security Group (only if KMS, Secrets Manager, or SQS are missing)
        if (!existingEndpoints.kms || !existingEndpoints.secretsManager || (!existingEndpoints.sqs && appDefinition.database?.postgres?.enable)) {
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

        // KMS Interface Endpoint (only if missing AND KMS encryption is enabled)
        if (!existingEndpoints.kms && appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms') {
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

        // Secrets Manager Interface Endpoint (only if missing)
        if (!existingEndpoints.secretsManager) {
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

        // SQS Interface Endpoint (only if missing AND database migrations are enabled)
        if (!existingEndpoints.sqs && appDefinition.database?.postgres?.enable) {
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

