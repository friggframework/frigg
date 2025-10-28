/**
 * Mock CloudFormation Change Set Fixtures
 *
 * Provides reusable test data for change set testing
 */

const mockChangeSetEmpty = {
    ChangeSetId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/frigg-dry-run-123/abc-def',
    ChangeSetName: 'frigg-dry-run-123',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
    StackName: 'test-stack',
    Status: 'CREATE_COMPLETE',
    StatusReason: 'No updates are to be performed',
    Changes: [],
    CreationTime: new Date('2025-10-28T10:00:00Z'),
};

const mockChangeSetWithAdditions = {
    ChangeSetId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/frigg-dry-run-124/abc-def',
    ChangeSetName: 'frigg-dry-run-124',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
    StackName: 'test-stack',
    Status: 'CREATE_COMPLETE',
    Changes: [
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Add',
                LogicalResourceId: 'HealthLambdaFunction',
                ResourceType: 'AWS::Lambda::Function',
                Replacement: null,
                Details: [],
            },
        },
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Add',
                LogicalResourceId: 'UserLambdaFunction',
                ResourceType: 'AWS::Lambda::Function',
                Replacement: null,
                Details: [],
            },
        },
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Add',
                LogicalResourceId: 'ApiGatewayRestApi',
                ResourceType: 'AWS::ApiGateway::RestApi',
                Replacement: null,
                Details: [],
            },
        },
    ],
    CreationTime: new Date('2025-10-28T10:00:00Z'),
};

const mockChangeSetWithModifications = {
    ChangeSetId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/frigg-dry-run-125/abc-def',
    ChangeSetName: 'frigg-dry-run-125',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
    StackName: 'test-stack',
    Status: 'CREATE_COMPLETE',
    Changes: [
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Modify',
                LogicalResourceId: 'IntegrationLambdaFunction',
                PhysicalResourceId: 'test-stack-IntegrationLambdaFunction-ABC123',
                ResourceType: 'AWS::Lambda::Function',
                Replacement: null,
                Details: [
                    {
                        Target: {
                            Attribute: 'Properties',
                            Name: 'Environment',
                            RequiresRecreation: 'Never',
                        },
                        Evaluation: 'Static',
                        ChangeSource: 'DirectModification',
                    },
                ],
            },
        },
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Modify',
                LogicalResourceId: 'HealthLambdaFunction',
                PhysicalResourceId: 'test-stack-HealthLambdaFunction-XYZ789',
                ResourceType: 'AWS::Lambda::Function',
                Replacement: null,
                Details: [
                    {
                        Target: {
                            Attribute: 'VpcConfig',
                            Name: 'SecurityGroupIds',
                            RequiresRecreation: 'Always',
                        },
                        Evaluation: 'Static',
                        ChangeSource: 'DirectModification',
                    },
                ],
            },
        },
    ],
    CreationTime: new Date('2025-10-28T10:00:00Z'),
};

const mockChangeSetWithReplacements = {
    ChangeSetId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/frigg-dry-run-126/abc-def',
    ChangeSetName: 'frigg-dry-run-126',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
    StackName: 'test-stack',
    Status: 'CREATE_COMPLETE',
    Changes: [
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Modify',
                LogicalResourceId: 'DatabaseSecurityGroup',
                PhysicalResourceId: 'sg-abc123',
                ResourceType: 'AWS::EC2::SecurityGroup',
                Replacement: 'True',
                Details: [
                    {
                        Target: {
                            Attribute: 'Properties',
                            Name: 'VpcId',
                            RequiresRecreation: 'Always',
                        },
                        Evaluation: 'Static',
                        ChangeSource: 'DirectModification',
                    },
                ],
            },
        },
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Remove',
                LogicalResourceId: 'OldLambdaFunction',
                PhysicalResourceId: 'test-stack-OldLambdaFunction-OLD123',
                ResourceType: 'AWS::Lambda::Function',
                Replacement: null,
                Details: [],
            },
        },
    ],
    CreationTime: new Date('2025-10-28T10:00:00Z'),
};

const mockChangeSetWithDatabase = {
    ChangeSetId: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/frigg-dry-run-127/abc-def',
    ChangeSetName: 'frigg-dry-run-127',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
    StackName: 'test-stack',
    Status: 'CREATE_COMPLETE',
    Changes: [
        {
            Type: 'Resource',
            ResourceChange: {
                Action: 'Modify',
                LogicalResourceId: 'DatabaseCluster',
                PhysicalResourceId: 'aurora-cluster-1',
                ResourceType: 'AWS::RDS::DBCluster',
                Replacement: null,
                Details: [
                    {
                        Target: {
                            Attribute: 'Properties',
                            Name: 'EngineVersion',
                            RequiresRecreation: 'Never',
                        },
                        Evaluation: 'Static',
                        ChangeSource: 'DirectModification',
                    },
                ],
            },
        },
    ],
    CreationTime: new Date('2025-10-28T10:00:00Z'),
};

const mockAwsSdkResponses = {
    cloudformation: {
        describeStacks: {
            Stacks: [
                {
                    StackName: 'test-stack',
                    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
                    StackStatus: 'CREATE_COMPLETE',
                    CreationTime: new Date('2025-10-01T10:00:00Z'),
                },
            ],
        },
        createChangeSet: {
            Id: 'arn:aws:cloudformation:us-east-1:123456789012:changeSet/frigg-dry-run-123/abc-def',
            StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
        },
        describeChangeSet: mockChangeSetWithAdditions,
        deleteChangeSet: {},
    },
    sts: {
        getCallerIdentity: {
            UserId: 'AIDAI1234567890EXAMPLE',
            Account: '123456789012',
            Arn: 'arn:aws:iam::123456789012:user/test-user',
        },
    },
};

const mockAppDefinition = {
    name: 'test-integration',
    provider: 'aws',
    region: 'us-east-1',
    runtime: 'nodejs20.x',
    environment: {
        AWS_REGION: true,
        STAGE: true,
        DB_URI: true,
        ENCRYPTION_KEY: true,
    },
    vpc: {
        enable: true,
    },
    integrations: [
        {
            Definition: {
                name: 'hubspot',
            },
        },
    ],
};

module.exports = {
    mockChangeSetEmpty,
    mockChangeSetWithAdditions,
    mockChangeSetWithModifications,
    mockChangeSetWithReplacements,
    mockChangeSetWithDatabase,
    mockAwsSdkResponses,
    mockAppDefinition,
};
