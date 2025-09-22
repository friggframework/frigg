// Mock AWS SDK for local testing
const mockEC2Client = {
    send: jest.fn(),
};

const mockKMSClient = {
    send: jest.fn(),
};

const mockSTSClient = {
    send: jest.fn(),
};

// Mock VPC discovery responses
const mockVPCResponse = {
    Vpcs: [{
        VpcId: 'vpc-mock-123',
        CidrBlock: '172.31.0.0/16',
        IsDefault: true,
    }],
};

// Mock subnet discovery responses
const mockSubnetsResponse = {
    Subnets: [
        {
            SubnetId: 'subnet-private-1',
            VpcId: 'vpc-mock-123',
            AvailabilityZone: 'eu-central-1a',
            MapPublicIpOnLaunch: false,
        },
        {
            SubnetId: 'subnet-private-2',
            VpcId: 'vpc-mock-123',
            AvailabilityZone: 'eu-central-1b',
            MapPublicIpOnLaunch: false,
        },
        {
            SubnetId: 'subnet-public-1',
            VpcId: 'vpc-mock-123',
            AvailabilityZone: 'eu-central-1a',
            MapPublicIpOnLaunch: true,
        },
    ],
};

// Mock route table responses
const mockRouteTablesResponse = {
    RouteTables: [
        {
            RouteTableId: 'rtb-private',
            VpcId: 'vpc-mock-123',
            Routes: [
                {
                    DestinationCidrBlock: '172.31.0.0/16',
                    GatewayId: 'local',
                },
            ],
            Associations: [
                {
                    SubnetId: 'subnet-private-1',
                    RouteTableId: 'rtb-private',
                },
                {
                    SubnetId: 'subnet-private-2',
                    RouteTableId: 'rtb-private',
                },
            ],
        },
        {
            RouteTableId: 'rtb-public',
            VpcId: 'vpc-mock-123',
            Routes: [
                {
                    DestinationCidrBlock: '0.0.0.0/0',
                    GatewayId: 'igw-mock',
                },
                {
                    DestinationCidrBlock: '172.31.0.0/16',
                    GatewayId: 'local',
                },
            ],
            Associations: [
                {
                    SubnetId: 'subnet-public-1',
                    RouteTableId: 'rtb-public',
                },
            ],
        },
    ],
};

// Mock NAT Gateway responses
const mockNATGatewayResponse = {
    NatGateways: [],
};

const mockNATGatewayAvailableResponse = {
    NatGateways: [{
        NatGatewayId: 'nat-existing',
        State: 'available',
        SubnetId: 'subnet-public-1',
        NatGatewayAddresses: [{
            AllocationId: 'eip-existing',
            PublicIp: '1.2.3.4',
        }],
    }],
};

// Mock security group responses
const mockSecurityGroupResponse = {
    SecurityGroups: [{
        GroupId: 'sg-mock-lambda',
        GroupName: 'default',
        VpcId: 'vpc-mock-123',
    }],
};

// Mock KMS key responses
const mockKMSKeysResponse = {
    Keys: [{
        KeyId: 'key-mock-123',
        KeyArn: 'arn:aws:kms:eu-central-1:123456789:key/key-mock-123',
    }],
};

const mockKMSKeyDetailsResponse = {
    KeyMetadata: {
        KeyId: 'key-mock-123',
        Arn: 'arn:aws:kms:eu-central-1:123456789:key/key-mock-123',
        KeyManager: 'CUSTOMER',
        KeyState: 'Enabled',
        Enabled: true,
    },
};

// Mock Internet Gateway response
const mockInternetGatewayResponse = {
    InternetGateways: [{
        InternetGatewayId: 'igw-mock',
        Attachments: [{
            VpcId: 'vpc-mock-123',
            State: 'available',
        }],
    }],
};

// Mock STS response
const mockSTSResponse = {
    Account: '123456789',
    Arn: 'arn:aws:sts::123456789:assumed-role/mock-role/mock-session',
};

// Setup mock implementations
const setupMockResponses = (scenario = 'default') => {
    mockEC2Client.send.mockReset();
    mockKMSClient.send.mockReset();
    mockSTSClient.send.mockReset();

    // Setup based on scenario
    switch (scenario) {
        case 'no-nat':
            // Scenario with no existing NAT Gateway
            mockEC2Client.send.mockImplementation((command) => {
                const commandName = command.constructor.name;
                switch (commandName) {
                    case 'DescribeVpcsCommand':
                        return Promise.resolve(mockVPCResponse);
                    case 'DescribeSubnetsCommand':
                        return Promise.resolve(mockSubnetsResponse);
                    case 'DescribeRouteTablesCommand':
                        return Promise.resolve(mockRouteTablesResponse);
                    case 'DescribeNatGatewaysCommand':
                        return Promise.resolve(mockNATGatewayResponse);
                    case 'DescribeSecurityGroupsCommand':
                        return Promise.resolve(mockSecurityGroupResponse);
                    case 'DescribeInternetGatewaysCommand':
                        return Promise.resolve(mockInternetGatewayResponse);
                    default:
                        return Promise.resolve({});
                }
            });
            break;

        case 'existing-nat':
            // Scenario with existing NAT Gateway
            mockEC2Client.send.mockImplementation((command) => {
                const commandName = command.constructor.name;
                switch (commandName) {
                    case 'DescribeVpcsCommand':
                        return Promise.resolve(mockVPCResponse);
                    case 'DescribeSubnetsCommand':
                        return Promise.resolve(mockSubnetsResponse);
                    case 'DescribeRouteTablesCommand':
                        return Promise.resolve(mockRouteTablesResponse);
                    case 'DescribeNatGatewaysCommand':
                        return Promise.resolve(mockNATGatewayAvailableResponse);
                    case 'DescribeSecurityGroupsCommand':
                        return Promise.resolve(mockSecurityGroupResponse);
                    case 'DescribeInternetGatewaysCommand':
                        return Promise.resolve(mockInternetGatewayResponse);
                    default:
                        return Promise.resolve({});
                }
            });
            break;

        case 'misconfigured':
            // Scenario with misconfigured network
            const misconfiguredRouteTables = {
                ...mockRouteTablesResponse,
                RouteTables: [
                    {
                        ...mockRouteTablesResponse.RouteTables[0],
                        Routes: [
                            {
                                DestinationCidrBlock: '0.0.0.0/0',
                                NatGatewayId: 'nat-deleted', // Points to deleted NAT
                                State: 'blackhole',
                            },
                        ],
                    },
                ],
            };
            mockEC2Client.send.mockImplementation((command) => {
                const commandName = command.constructor.name;
                switch (commandName) {
                    case 'DescribeVpcsCommand':
                        return Promise.resolve(mockVPCResponse);
                    case 'DescribeSubnetsCommand':
                        return Promise.resolve(mockSubnetsResponse);
                    case 'DescribeRouteTablesCommand':
                        return Promise.resolve(misconfiguredRouteTables);
                    case 'DescribeNatGatewaysCommand':
                        return Promise.resolve(mockNATGatewayResponse);
                    case 'DescribeSecurityGroupsCommand':
                        return Promise.resolve(mockSecurityGroupResponse);
                    case 'DescribeInternetGatewaysCommand':
                        return Promise.resolve(mockInternetGatewayResponse);
                    default:
                        return Promise.resolve({});
                }
            });
            break;

        default:
            // Default scenario
            mockEC2Client.send.mockImplementation((command) => {
                const commandName = command.constructor.name;
                switch (commandName) {
                    case 'DescribeVpcsCommand':
                        return Promise.resolve(mockVPCResponse);
                    case 'DescribeSubnetsCommand':
                        return Promise.resolve(mockSubnetsResponse);
                    case 'DescribeRouteTablesCommand':
                        return Promise.resolve(mockRouteTablesResponse);
                    case 'DescribeNatGatewaysCommand':
                        return Promise.resolve(mockNATGatewayResponse);
                    case 'DescribeSecurityGroupsCommand':
                        return Promise.resolve(mockSecurityGroupResponse);
                    case 'DescribeInternetGatewaysCommand':
                        return Promise.resolve(mockInternetGatewayResponse);
                    default:
                        return Promise.resolve({});
                }
            });
    }

    // Setup KMS mock
    mockKMSClient.send.mockImplementation((command) => {
        const commandName = command.constructor.name;
        switch (commandName) {
            case 'ListKeysCommand':
                return Promise.resolve(mockKMSKeysResponse);
            case 'DescribeKeyCommand':
                return Promise.resolve(mockKMSKeyDetailsResponse);
            default:
                return Promise.resolve({});
        }
    });

    // Setup STS mock
    mockSTSClient.send.mockImplementation(() => {
        return Promise.resolve(mockSTSResponse);
    });
};

module.exports = {
    mockEC2Client,
    mockKMSClient,
    mockSTSClient,
    setupMockResponses,
    // Export individual mock responses for custom scenarios
    mockVPCResponse,
    mockSubnetsResponse,
    mockRouteTablesResponse,
    mockNATGatewayResponse,
    mockNATGatewayAvailableResponse,
    mockSecurityGroupResponse,
    mockKMSKeysResponse,
    mockKMSKeyDetailsResponse,
    mockInternetGatewayResponse,
    mockSTSResponse,
};