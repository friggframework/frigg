class ResourceDependencyAnalyzer {
    constructor({ ec2Client, elbClient, rdsClient, lambdaClient }) {
        if (!ec2Client) {
            throw new Error('ec2Client is required');
        }

        this.ec2Client = ec2Client;
        this.elbClient = elbClient;
        this.rdsClient = rdsClient;
        this.lambdaClient = lambdaClient;
    }

    async analyzeDependencies(resources) {
        const analysis = {
            canDeleteAll: true,
            blockedResources: [],
            dependencies: {},
        };

        const dependencyPromises = resources.map(async (resource) => {
            const deps = await this._checkResourceDependencies(resource);
            analysis.dependencies[resource.physicalId] = deps;

            if (deps.hasBlockingDependencies) {
                analysis.canDeleteAll = false;
                analysis.blockedResources.push({
                    resource,
                    blockingDependencies: deps.blocking,
                });
            }
        });

        await Promise.all(dependencyPromises);

        return analysis;
    }

    determineDeletionOrder(resources) {
        const phases = {
            phase1: [],
            phase2: [],
            phase3: [],
        };

        for (const resource of resources) {
            const phase = this._getDeletionPhase(resource.resourceType);
            phases[`phase${phase}`].push(resource);
        }

        phases.phase1.sort(this._compareDeletionPriority);
        phases.phase2.sort(this._compareDeletionPriority);
        phases.phase3.sort(this._compareDeletionPriority);

        return phases;
    }

    async _checkResourceDependencies(resource) {
        switch (resource.resourceType) {
            case 'AWS::EC2::VPC':
                return await this._checkVpcDependencies(resource.physicalId);
            case 'AWS::EC2::Subnet':
                return await this._checkSubnetDependencies(resource.physicalId);
            case 'AWS::EC2::SecurityGroup':
                return await this._checkSecurityGroupDependencies(resource.physicalId);
            default:
                return { hasBlockingDependencies: false, blocking: [], dependent: [] };
        }
    }

    async _checkVpcDependencies(vpcId) {
        const {
            DescribeSubnetsCommand,
            DescribeSecurityGroupsCommand,
            DescribeNatGatewaysCommand,
            DescribeInternetGatewaysCommand,
            DescribeVpcEndpointsCommand,
        } = this._loadEC2Commands();

        const [subnets, securityGroups, natGateways, igws, endpoints] = await Promise.all([
            this.ec2Client.send(
                new DescribeSubnetsCommand({
                    Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                })
            ),
            this.ec2Client.send(
                new DescribeSecurityGroupsCommand({
                    Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                })
            ),
            this.ec2Client.send(
                new DescribeNatGatewaysCommand({
                    Filter: [{ Name: 'vpc-id', Values: [vpcId] }],
                })
            ),
            this.ec2Client.send(
                new DescribeInternetGatewaysCommand({
                    Filters: [{ Name: 'attachment.vpc-id', Values: [vpcId] }],
                })
            ),
            this.ec2Client.send(
                new DescribeVpcEndpointsCommand({
                    Filters: [{ Name: 'vpc-id', Values: [vpcId] }],
                })
            ),
        ]);

        const blocking = [];

        const customSubnets = (subnets.Subnets || []).filter((s) => !s.DefaultForAz);
        const customSGs = (securityGroups.SecurityGroups || []).filter((sg) => sg.GroupName !== 'default');

        if (customSubnets.length > 0) {
            blocking.push({
                type: 'subnets',
                count: customSubnets.length,
                ids: customSubnets.map((s) => s.SubnetId),
            });
        }
        if (customSGs.length > 0) {
            blocking.push({
                type: 'security_groups',
                count: customSGs.length,
                ids: customSGs.map((sg) => sg.GroupId),
            });
        }
        if (natGateways.NatGateways?.length > 0) {
            blocking.push({ type: 'nat_gateways', count: natGateways.NatGateways.length });
        }
        if (igws.InternetGateways?.length > 0) {
            blocking.push({ type: 'internet_gateways', count: igws.InternetGateways.length });
        }
        if (endpoints.VpcEndpoints?.length > 0) {
            blocking.push({ type: 'vpc_endpoints', count: endpoints.VpcEndpoints.length });
        }

        return {
            hasBlockingDependencies: blocking.length > 0,
            blocking,
            dependent: [],
        };
    }

    async _checkSubnetDependencies(subnetId) {
        const { DescribeInstancesCommand } = this._loadEC2Commands();

        const instances = await this.ec2Client.send(
            new DescribeInstancesCommand({
                Filters: [{ Name: 'subnet-id', Values: [subnetId] }],
            })
        );

        const blocking = [];
        const allInstances = (instances.Reservations || []).flatMap((r) => r.Instances || []);

        if (allInstances.length > 0) {
            blocking.push({
                type: 'ec2_instances',
                count: allInstances.length,
                ids: allInstances.map((i) => i.InstanceId),
            });
        }

        return {
            hasBlockingDependencies: blocking.length > 0,
            blocking,
            dependent: [],
        };
    }

    async _checkSecurityGroupDependencies(sgId) {
        const { DescribeInstancesCommand } = this._loadEC2Commands();
        const { DescribeDBInstancesCommand } = this._loadRDSCommands();
        const { ListFunctionsCommand } = this._loadLambdaCommands();
        const { DescribeLoadBalancersCommand } = this._loadELBCommands();

        const [ec2Instances, rdsInstances, lambdaFunctions, loadBalancers] = await Promise.all([
            this.ec2Client.send(
                new DescribeInstancesCommand({
                    Filters: [{ Name: 'instance.group-id', Values: [sgId] }],
                })
            ),
            this.rdsClient.send(new DescribeDBInstancesCommand({})),
            this.lambdaClient.send(new ListFunctionsCommand({})),
            this.elbClient.send(new DescribeLoadBalancersCommand({})),
        ]);

        const blocking = [];

        const instances = (ec2Instances.Reservations || []).flatMap((r) => r.Instances || []);
        if (instances.length > 0) {
            blocking.push({
                type: 'ec2_instances',
                count: instances.length,
                ids: instances.map((i) => i.InstanceId),
            });
        }

        const rdsUsingThisSG = (rdsInstances.DBInstances || []).filter((db) =>
            db.VpcSecurityGroups?.some((sg) => sg.VpcSecurityGroupId === sgId)
        );
        if (rdsUsingThisSG.length > 0) {
            blocking.push({
                type: 'rds_instances',
                count: rdsUsingThisSG.length,
                ids: rdsUsingThisSG.map((db) => db.DBInstanceIdentifier),
            });
        }

        const lambdaUsingThisSG = (lambdaFunctions.Functions || []).filter((fn) =>
            fn.VpcConfig?.SecurityGroupIds?.includes(sgId)
        );
        if (lambdaUsingThisSG.length > 0) {
            blocking.push({
                type: 'lambda_functions',
                count: lambdaUsingThisSG.length,
                ids: lambdaUsingThisSG.map((fn) => fn.FunctionName),
            });
        }

        return {
            hasBlockingDependencies: blocking.length > 0,
            blocking,
            dependent: [],
        };
    }

    _getDeletionPhase(resourceType) {
        const phaseMap = {
            'AWS::EC2::VPCEndpoint': 1,
            'AWS::EC2::NatGateway': 2,
            'AWS::EC2::InternetGateway': 2,
            'AWS::EC2::RouteTable': 2,
            'AWS::EC2::NetworkAcl': 2,
            'AWS::EC2::Subnet': 2,
            'AWS::EC2::SecurityGroup': 2,
            'AWS::EC2::VPC': 3,
        };

        return phaseMap[resourceType] || 2;
    }

    _compareDeletionPriority(a, b) {
        const priorityMap = {
            'AWS::EC2::VPCEndpoint': 1,
            'AWS::EC2::NatGateway': 2,
            'AWS::EC2::InternetGateway': 3,
            'AWS::EC2::RouteTable': 4,
            'AWS::EC2::Subnet': 5,
            'AWS::EC2::SecurityGroup': 6,
            'AWS::EC2::VPC': 7,
        };

        return (priorityMap[a.resourceType] || 99) - (priorityMap[b.resourceType] || 99);
    }

    _loadEC2Commands() {
        const ec2 = require('@aws-sdk/client-ec2');
        return {
            DescribeSubnetsCommand: ec2.DescribeSubnetsCommand,
            DescribeSecurityGroupsCommand: ec2.DescribeSecurityGroupsCommand,
            DescribeNatGatewaysCommand: ec2.DescribeNatGatewaysCommand,
            DescribeInternetGatewaysCommand: ec2.DescribeInternetGatewaysCommand,
            DescribeVpcEndpointsCommand: ec2.DescribeVpcEndpointsCommand,
            DescribeInstancesCommand: ec2.DescribeInstancesCommand,
        };
    }

    _loadRDSCommands() {
        const rds = require('@aws-sdk/client-rds');
        return {
            DescribeDBInstancesCommand: rds.DescribeDBInstancesCommand,
        };
    }

    _loadLambdaCommands() {
        const lambda = require('@aws-sdk/client-lambda');
        return {
            ListFunctionsCommand: lambda.ListFunctionsCommand,
        };
    }

    _loadELBCommands() {
        const elb = require('@aws-sdk/client-elastic-load-balancing-v2');
        return {
            DescribeLoadBalancersCommand: elb.DescribeLoadBalancersCommand,
        };
    }
}

module.exports = ResourceDependencyAnalyzer;
