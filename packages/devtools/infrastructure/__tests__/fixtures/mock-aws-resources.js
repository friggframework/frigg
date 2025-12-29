/**
 * Mock AWS resources for consistent testing across all VPC/KMS/SSM tests
 */

const mockVpc = {
    VpcId: 'vpc-12345678',
    IsDefault: true,
    State: 'available',
    CidrBlock: '10.0.0.0/16',
    DhcpOptionsId: 'dopt-12345678',
    InstanceTenancy: 'default'
};

const mockSubnets = [
    {
        SubnetId: 'subnet-private-1',
        VpcId: 'vpc-12345678',
        CidrBlock: '10.0.1.0/24',
        AvailabilityZone: 'us-east-1a',
        State: 'available',
        MapPublicIpOnLaunch: false
    },
    {
        SubnetId: 'subnet-private-2',
        VpcId: 'vpc-12345678',
        CidrBlock: '10.0.2.0/24',
        AvailabilityZone: 'us-east-1b',
        State: 'available',
        MapPublicIpOnLaunch: false
    },
    {
        SubnetId: 'subnet-public-1',
        VpcId: 'vpc-12345678',
        CidrBlock: '10.0.3.0/24',
        AvailabilityZone: 'us-east-1a',
        State: 'available',
        MapPublicIpOnLaunch: true
    }
];

const mockSecurityGroups = [
    {
        GroupId: 'sg-frigg-12345678',
        GroupName: 'frigg-lambda-sg',
        Description: 'Security group for Frigg Lambda functions',
        VpcId: 'vpc-12345678'
    },
    {
        GroupId: 'sg-default-12345678',
        GroupName: 'default',
        Description: 'Default security group',
        VpcId: 'vpc-12345678'
    }
];

const mockRouteTables = [
    {
        RouteTableId: 'rtb-private-12345678',
        VpcId: 'vpc-12345678',
        Routes: [
            {
                DestinationCidrBlock: '10.0.0.0/16',
                GatewayId: 'local',
                State: 'active'
            },
            {
                DestinationCidrBlock: '0.0.0.0/0',
                NatGatewayId: 'nat-12345678',
                State: 'active'
            }
        ],
        Associations: [
            {
                RouteTableAssociationId: 'rtbassoc-12345678',
                RouteTableId: 'rtb-private-12345678',
                SubnetId: 'subnet-private-1'
            }
        ]
    },
    {
        RouteTableId: 'rtb-public-12345678',
        VpcId: 'vpc-12345678',
        Routes: [
            {
                DestinationCidrBlock: '10.0.0.0/16',
                GatewayId: 'local',
                State: 'active'
            },
            {
                DestinationCidrBlock: '0.0.0.0/0',
                GatewayId: 'igw-12345678',
                State: 'active'
            }
        ],
        Associations: [
            {
                RouteTableAssociationId: 'rtbassoc-87654321',
                RouteTableId: 'rtb-public-12345678',
                SubnetId: 'subnet-public-1'
            }
        ]
    }
];

const mockKmsKeys = [
    {
        KeyId: '12345678-1234-1234-1234-123456789012',
        Arn: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
    },
    {
        KeyId: '87654321-8765-4321-8765-876543218765',
        Arn: 'arn:aws:kms:us-east-1:123456789012:key/87654321-8765-4321-8765-876543218765'
    }
];

const mockKmsKeyMetadata = {
    KeyId: '12345678-1234-1234-1234-123456789012',
    Arn: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    CreationDate: new Date('2023-01-01'),
    Enabled: true,
    Description: 'Default KMS key for Frigg encryption',
    KeyUsage: 'ENCRYPT_DECRYPT',
    KeyState: 'Enabled',
    Origin: 'AWS_KMS',
    KeyManager: 'CUSTOMER',
    CustomerMasterKeySpec: 'SYMMETRIC_DEFAULT'
};

const mockStsCallerIdentity = {
    UserId: 'AIDACKCEVSQ6C2EXAMPLE',
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:user/test-user'
};

const mockDiscoveredResources = {
    defaultVpcId: mockVpc.VpcId,
    defaultSecurityGroupId: mockSecurityGroups[0].GroupId,
    privateSubnetId1: mockSubnets[0].SubnetId,
    privateSubnetId2: mockSubnets[1].SubnetId,
    privateRouteTableId: mockRouteTables[0].RouteTableId,
    defaultKmsKeyId: mockKmsKeyMetadata.Arn
};

// App definitions for testing different scenarios
const mockAppDefinitions = {
    vpcOnly: {
        name: 'vpc-test-app',
        vpc: { enable: true },
        integrations: []
    },
    
    kmsOnly: {
        name: 'kms-test-app',
        encryption: { fieldLevelEncryptionMethod: 'kms' },
        integrations: []
    },
    
    ssmOnly: {
        name: 'ssm-test-app',
        ssm: { enable: true },
        integrations: []
    },
    
    allFeatures: {
        name: 'full-feature-app',
        vpc: { enable: true },
        encryption: { fieldLevelEncryptionMethod: 'kms' },
        ssm: { enable: true },
        integrations: [{
            Definition: {
                name: 'testIntegration'
            }
        }]
    },
    
    noFeatures: {
        name: 'minimal-app',
        integrations: []
    },
    
    multipleIntegrations: {
        name: 'multi-integration-app',
        vpc: { enable: true },
        integrations: [
            {
                Definition: {
                    name: 'hubspot'
                }
            },
            {
                Definition: {
                    name: 'salesforce'
                }
            }
        ]
    }
};

// Mock serverless service configurations
const mockServerlessServices = {
    withVpc: {
        provider: {
            name: 'aws',
            region: 'us-east-1',
            vpc: '${self:custom.vpc.${self:provider.stage}}'
        },
        plugins: [],
        custom: {
            vpc: {
                '${self:provider.stage}': {
                    securityGroupIds: ['${env:AWS_DISCOVERY_SECURITY_GROUP_ID}'],
                    subnetIds: [
                        '${env:AWS_DISCOVERY_SUBNET_ID_1}',
                        '${env:AWS_DISCOVERY_SUBNET_ID_2}'
                    ]
                }
            }
        },
        functions: {}
    },
    
    withKms: {
        provider: {
            name: 'aws',
            region: 'us-east-1'
        },
        plugins: ['serverless-kms-grants'],
        custom: {
            kmsGrants: {
                kmsKeyId: '${env:AWS_DISCOVERY_KMS_KEY_ID}'
            }
        },
        functions: {}
    },
    
    withSsm: {
        provider: {
            name: 'aws',
            region: 'us-east-1',
            layers: [
                'arn:aws:lambda:us-east-1:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11'
            ]
        },
        plugins: [],
        custom: {},
        functions: {}
    },
    
    withAll: {
        provider: {
            name: 'aws',
            region: 'us-east-1',
            vpc: '${self:custom.vpc.${self:provider.stage}}',
            layers: [
                'arn:aws:lambda:us-east-1:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11'
            ]
        },
        plugins: ['serverless-kms-grants'],
        custom: {
            vpc: {
                '${self:provider.stage}': {
                    securityGroupIds: ['${env:AWS_DISCOVERY_SECURITY_GROUP_ID}'],
                    subnetIds: [
                        '${env:AWS_DISCOVERY_SUBNET_ID_1}',
                        '${env:AWS_DISCOVERY_SUBNET_ID_2}'
                    ]
                }
            },
            kmsGrants: {
                kmsKeyId: '${env:AWS_DISCOVERY_KMS_KEY_ID}'
            }
        },
        functions: {}
    }
};

// Environment variables for testing
const mockEnvironmentVariables = {
    AWS_DISCOVERY_VPC_ID: mockVpc.VpcId,
    AWS_DISCOVERY_SECURITY_GROUP_ID: mockSecurityGroups[0].GroupId,
    AWS_DISCOVERY_SUBNET_ID_1: mockSubnets[0].SubnetId,
    AWS_DISCOVERY_SUBNET_ID_2: mockSubnets[1].SubnetId,
    AWS_DISCOVERY_ROUTE_TABLE_ID: mockRouteTables[0].RouteTableId,
    AWS_DISCOVERY_KMS_KEY_ID:mockKmsKeyMetadata.Arn
};

// Fallback environment variables for error scenarios
const mockFallbackEnvironmentVariables = {
    AWS_DISCOVERY_VPC_ID: 'vpc-fallback',
    AWS_DISCOVERY_SECURITY_GROUP_ID: 'sg-fallback',
    AWS_DISCOVERY_SUBNET_ID_1: 'subnet-fallback-1',
    AWS_DISCOVERY_SUBNET_ID_2: 'subnet-fallback-2',
    AWS_DISCOVERY_ROUTE_TABLE_ID: 'rtb-fallback',
    AWS_DISCOVERY_KMS_KEY_ID:'arn:aws:kms:*:*:key/*'
};

// Mock AWS SDK responses
const mockAwsSdkResponses = {
    ec2: {
        describeVpcs: {
            default: {
                Vpcs: [mockVpc]
            },
            empty: {
                Vpcs: []
            },
            multiple: {
                Vpcs: [mockVpc, { ...mockVpc, VpcId: 'vpc-87654321', IsDefault: false }]
            }
        },
        
        describeSubnets: {
            private: {
                Subnets: mockSubnets.slice(0, 2) // Only private subnets
            },
            mixed: {
                Subnets: mockSubnets // All subnets
            },
            empty: {
                Subnets: []
            }
        },
        
        describeSecurityGroups: {
            frigg: {
                SecurityGroups: [mockSecurityGroups[0]]
            },
            default: {
                SecurityGroups: [mockSecurityGroups[1]]
            },
            empty: {
                SecurityGroups: []
            }
        },
        
        describeRouteTables: {
            private: {
                RouteTables: [mockRouteTables[0]]
            },
            public: {
                RouteTables: [mockRouteTables[1]]
            },
            mixed: {
                RouteTables: mockRouteTables
            }
        }
    },
    
    kms: {
        listKeys: {
            withKeys: {
                Keys: mockKmsKeys
            },
            empty: {
                Keys: []
            }
        },
        
        describeKey: {
            customer: {
                KeyMetadata: mockKmsKeyMetadata
            },
            aws: {
                KeyMetadata: {
                    ...mockKmsKeyMetadata,
                    KeyManager: 'AWS'
                }
            }
        }
    },
    
    sts: {
        getCallerIdentity: mockStsCallerIdentity
    }
};

module.exports = {
    mockVpc,
    mockSubnets,
    mockSecurityGroups,
    mockRouteTables,
    mockKmsKeys,
    mockKmsKeyMetadata,
    mockStsCallerIdentity,
    mockDiscoveredResources,
    mockAppDefinitions,
    mockServerlessServices,
    mockEnvironmentVariables,
    mockFallbackEnvironmentVariables,
    mockAwsSdkResponses
};