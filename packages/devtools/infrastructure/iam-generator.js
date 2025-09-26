const path = require('path');

/**
 * Generate IAM CloudFormation template based on AppDefinition
 * @param {Object} appDefinition - Application definition object
 * @param {Object} options - Generation options
 * @param {string} [options.deploymentUserName='frigg-deployment-user'] - IAM user name
 * @param {string} [options.stackName='frigg-deployment-iam'] - CloudFormation stack name
 * @param {string} [options.mode='auto'] - Policy mode: 'basic', 'full', or 'auto' (auto-detect from appDefinition)
 * @returns {string} CloudFormation YAML template
 */
function generateIAMCloudFormation(appDefinition, options = {}) {
    const { deploymentUserName = 'frigg-deployment-user', mode = 'auto' } =
        options;

    // Determine which features are enabled based on mode
    let features;
    if (mode === 'basic') {
        features = {
            vpc: false,
            kms: false,
            ssm: false,
            websockets: appDefinition.websockets?.enable === true,
        };
    } else if (mode === 'full') {
        features = {
            vpc: true,
            kms: true,
            ssm: true,
            websockets: appDefinition.websockets?.enable === true,
        };
    } else {
        // mode === 'auto'
        features = {
            vpc: appDefinition.vpc?.enable === true,
            kms:
                appDefinition.encryption
                    ?.fieldLevelEncryptionMethod === 'kms',
            ssm: appDefinition.ssm?.enable === true,
            websockets: appDefinition.websockets?.enable === true,
        };
    }

    // Build the CloudFormation template
    const template = {
        AWSTemplateFormatVersion: '2010-09-09',
        Description: `IAM roles and policies for ${
            appDefinition.name || 'Frigg'
        } application deployment pipeline`,

        Parameters: {
            DeploymentUserName: {
                Type: 'String',
                Default: deploymentUserName,
                Description:
                    'Name for the IAM user that will deploy Frigg applications',
            },
            EnableVPCSupport: {
                Type: 'String',
                Default: features.vpc ? 'true' : 'false',
                AllowedValues: ['true', 'false'],
                Description:
                    'Enable VPC-related permissions for Frigg applications',
            },
            EnableKMSSupport: {
                Type: 'String',
                Default: features.kms ? 'true' : 'false',
                AllowedValues: ['true', 'false'],
                Description:
                    'Enable KMS encryption permissions for Frigg applications',
            },
            EnableSSMSupport: {
                Type: 'String',
                Default: features.ssm ? 'true' : 'false',
                AllowedValues: ['true', 'false'],
                Description:
                    'Enable SSM Parameter Store permissions for Frigg applications',
            },
            DeploymentKmsAliasName: {
                Type: 'String',
                Default: 'alias/frigg-deployment',
                Description:
                    'Alias name to create or manage for the deployment KMS key',
            },
            DeploymentKmsTargetKeyArn: {
                Type: 'String',
                Default: '',
                Description:
                    'Optional existing KMS key ARN that the deployment alias should reference',
            },
        },

        Conditions: {
            CreateVPCPermissions: {
                'Fn::Equals': [{ Ref: 'EnableVPCSupport' }, 'true'],
            },
            CreateKMSPermissions: {
                'Fn::Equals': [{ Ref: 'EnableKMSSupport' }, 'true'],
            },
            CreateSSMPermissions: {
                'Fn::Equals': [{ Ref: 'EnableSSMSupport' }, 'true'],
            },
            CreateKMSAlias: {
                'Fn::And': [
                    {
                        'Fn::Equals': [{ Ref: 'EnableKMSSupport' }, 'true'],
                    },
                    {
                        'Fn::Not': [
                            {
                                'Fn::Equals': [
                                    { Ref: 'DeploymentKmsTargetKeyArn' },
                                    '',
                                ],
                            },
                        ],
                    },
                ],
            },
        },

        Resources: {},
    };

    // Add IAM User
    template.Resources.FriggDeploymentUser = {
        Type: 'AWS::IAM::User',
        Properties: {
            UserName: { Ref: 'DeploymentUserName' },
            ManagedPolicyArns: [
                { Ref: 'FriggDiscoveryPolicy' },
                { Ref: 'FriggCoreDeploymentPolicy' },
            ],
        },
    };

    // Conditionally add feature-specific policies
    if (features.vpc) {
        template.Resources.FriggDeploymentUser.Properties.ManagedPolicyArns.push(
            {
                'Fn::If': [
                    'CreateVPCPermissions',
                    { Ref: 'FriggVPCPolicy' },
                    { Ref: 'AWS::NoValue' },
                ],
            }
        );
    }
    if (features.kms) {
        template.Resources.FriggDeploymentUser.Properties.ManagedPolicyArns.push(
            {
                'Fn::If': [
                    'CreateKMSPermissions',
                    { Ref: 'FriggKMSPolicy' },
                    { Ref: 'AWS::NoValue' },
                ],
            }
        );
    }
    if (features.ssm) {
        template.Resources.FriggDeploymentUser.Properties.ManagedPolicyArns.push(
            {
                'Fn::If': [
                    'CreateSSMPermissions',
                    { Ref: 'FriggSSMPolicy' },
                    { Ref: 'AWS::NoValue' },
                ],
            }
        );
    }

    // Add Access Key
    template.Resources.FriggDeploymentAccessKey = {
        Type: 'AWS::IAM::AccessKey',
        Properties: {
            UserName: { Ref: 'FriggDeploymentUser' },
        },
    };

    // Add Discovery Policy (always needed)
    template.Resources.FriggDiscoveryPolicy = {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: {
            ManagedPolicyName: 'FriggDiscoveryPolicy',
            Description:
                'Permissions for AWS resource discovery during Frigg build process',
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: [
                    {
                        Sid: 'AWSDiscoveryPermissions',
                        Effect: 'Allow',
                        Action: [
                            'sts:GetCallerIdentity',
                            'ec2:DescribeVpcs',
                            'ec2:DescribeSubnets',
                            'ec2:DescribeSecurityGroups',
                            'ec2:DescribeRouteTables',
                            'ec2:DescribeNatGateways',
                            'ec2:DescribeAddresses',
                            'kms:ListKeys',
                            'kms:DescribeKey',
                        ],
                        Resource: '*',
                    },
                ],
            },
        },
    };

    // Add Core Deployment Policy (always needed)
    const coreActions = [
        // CloudFormation permissions
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
        'cloudformation:DeleteStack',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResources',
        'cloudformation:DescribeStackResource',
        'cloudformation:ListStackResources',
        'cloudformation:GetTemplate',
        'cloudformation:DescribeChangeSet',
        'cloudformation:CreateChangeSet',
        'cloudformation:DeleteChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:ValidateTemplate',

        // Lambda permissions
        'lambda:CreateFunction',
        'lambda:UpdateFunctionCode',
        'lambda:UpdateFunctionConfiguration',
        'lambda:DeleteFunction',
        'lambda:GetFunction',
        'lambda:ListFunctions',
        'lambda:PublishVersion',
        'lambda:CreateAlias',
        'lambda:UpdateAlias',
        'lambda:DeleteAlias',
        'lambda:GetAlias',
        'lambda:AddPermission',
        'lambda:RemovePermission',
        'lambda:GetPolicy',
        'lambda:PutProvisionedConcurrencyConfig',
        'lambda:DeleteProvisionedConcurrencyConfig',
        'lambda:PutConcurrency',
        'lambda:DeleteConcurrency',
        'lambda:TagResource',
        'lambda:UntagResource',
        'lambda:ListVersionsByFunction',

        // IAM permissions
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:GetRole',
        'iam:PassRole',
        'iam:PutRolePolicy',
        'iam:DeleteRolePolicy',
        'iam:GetRolePolicy',
        'iam:AttachRolePolicy',
        'iam:DetachRolePolicy',
        'iam:TagRole',
        'iam:UntagRole',
        'iam:ListPolicyVersions',

        // S3 permissions
        's3:CreateBucket',
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject',
        's3:PutBucketPolicy',
        's3:PutBucketVersioning',
        's3:PutBucketPublicAccessBlock',
        's3:GetBucketLocation',
        's3:ListBucket',

        // SQS permissions
        'sqs:CreateQueue',
        'sqs:DeleteQueue',
        'sqs:GetQueueAttributes',
        'sqs:SetQueueAttributes',
        'sqs:GetQueueUrl',
        'sqs:TagQueue',
        'sqs:UntagQueue',

        // SNS permissions
        'sns:CreateTopic',
        'sns:DeleteTopic',
        'sns:GetTopicAttributes',
        'sns:SetTopicAttributes',
        'sns:Subscribe',
        'sns:Unsubscribe',
        'sns:ListSubscriptionsByTopic',
        'sns:TagResource',
        'sns:UntagResource',

        // CloudWatch and Logs permissions
        'cloudwatch:PutMetricAlarm',
        'cloudwatch:DeleteAlarms',
        'cloudwatch:DescribeAlarms',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:DeleteLogGroup',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
        'logs:FilterLogEvents',
        'logs:PutLogEvents',
        'logs:PutRetentionPolicy',

        // API Gateway permissions
        'apigateway:POST',
        'apigateway:PUT',
        'apigateway:DELETE',
        'apigateway:GET',
        'apigateway:PATCH',
        'apigateway:TagResource',
        'apigateway:UntagResource',
    ];

    const coreStatements = [
        {
            Sid: 'CloudFormationFriggStacks',
            Effect: 'Allow',
            Action: [
                'cloudformation:CreateStack',
                'cloudformation:UpdateStack',
                'cloudformation:DeleteStack',
                'cloudformation:DescribeStacks',
                'cloudformation:DescribeStackEvents',
                'cloudformation:DescribeStackResources',
                'cloudformation:DescribeStackResource',
                'cloudformation:ListStackResources',
                'cloudformation:GetTemplate',
                'cloudformation:DescribeChangeSet',
                'cloudformation:CreateChangeSet',
                'cloudformation:DeleteChangeSet',
                'cloudformation:ExecuteChangeSet',
            ],
            Resource: [
                {
                    'Fn::Sub':
                        'arn:aws:cloudformation:*:${AWS::AccountId}:stack/*frigg*/*',
                },
            ],
        },
        {
            Sid: 'CloudFormationValidateTemplate',
            Effect: 'Allow',
            Action: ['cloudformation:ValidateTemplate'],
            Resource: '*',
        },
        {
            Sid: 'S3DeploymentBucket',
            Effect: 'Allow',
            Action: [
                's3:CreateBucket',
                's3:PutObject',
                's3:GetObject',
                's3:DeleteObject',
                's3:PutBucketPolicy',
                's3:PutBucketVersioning',
                's3:PutBucketPublicAccessBlock',
                's3:GetBucketLocation',
                's3:ListBucket',
            ],
            Resource: [
                'arn:aws:s3:::*serverless*',
                'arn:aws:s3:::*serverless*/*',
            ],
        },
        {
            Sid: 'LambdaFriggFunctions',
            Effect: 'Allow',
            Action: [
                'lambda:CreateFunction',
                'lambda:UpdateFunctionCode',
                'lambda:UpdateFunctionConfiguration',
                'lambda:DeleteFunction',
                'lambda:GetFunction',
                'lambda:ListFunctions',
                'lambda:PublishVersion',
                'lambda:CreateAlias',
                'lambda:UpdateAlias',
                'lambda:DeleteAlias',
                'lambda:GetAlias',
                'lambda:AddPermission',
                'lambda:RemovePermission',
                'lambda:GetPolicy',
                'lambda:PutProvisionedConcurrencyConfig',
                'lambda:DeleteProvisionedConcurrencyConfig',
                'lambda:PutConcurrency',
                'lambda:DeleteConcurrency',
                'lambda:TagResource',
                'lambda:UntagResource',
                'lambda:ListVersionsByFunction',
            ],
            Resource: [
                {
                    'Fn::Sub':
                        'arn:aws:lambda:*:${AWS::AccountId}:function:*frigg*',
                },
            ],
        },
        {
            Sid: 'IAMRolesForFriggLambda',
            Effect: 'Allow',
            Action: [
                'iam:CreateRole',
                'iam:DeleteRole',
                'iam:GetRole',
                'iam:PassRole',
                'iam:PutRolePolicy',
                'iam:DeleteRolePolicy',
                'iam:GetRolePolicy',
                'iam:AttachRolePolicy',
                'iam:DetachRolePolicy',
                'iam:TagRole',
                'iam:UntagRole',
            ],
            Resource: [
                { 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/*frigg*' },
                {
                    'Fn::Sub':
                        'arn:aws:iam::${AWS::AccountId}:role/*frigg*LambdaRole*',
                },
            ],
        },
        {
            Sid: 'IAMPolicyVersionPermissions',
            Effect: 'Allow',
            Action: ['iam:ListPolicyVersions'],
            Resource: [
                { 'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:policy/*' },
            ],
        },
        {
            Sid: 'FriggMessagingServices',
            Effect: 'Allow',
            Action: [
                'sqs:CreateQueue',
                'sqs:DeleteQueue',
                'sqs:GetQueueAttributes',
                'sqs:SetQueueAttributes',
                'sqs:GetQueueUrl',
                'sqs:TagQueue',
                'sqs:UntagQueue',
            ],
            Resource: [
                { 'Fn::Sub': 'arn:aws:sqs:*:${AWS::AccountId}:*frigg*' },
                {
                    'Fn::Sub':
                        'arn:aws:sqs:*:${AWS::AccountId}:internal-error-queue-*',
                },
            ],
        },
        {
            Sid: 'FriggSNSTopics',
            Effect: 'Allow',
            Action: [
                'sns:CreateTopic',
                'sns:DeleteTopic',
                'sns:GetTopicAttributes',
                'sns:SetTopicAttributes',
                'sns:Subscribe',
                'sns:Unsubscribe',
                'sns:ListSubscriptionsByTopic',
                'sns:TagResource',
                'sns:UntagResource',
            ],
            Resource: [
                { 'Fn::Sub': 'arn:aws:sns:*:${AWS::AccountId}:*frigg*' },
            ],
        },
        {
            Sid: 'FriggMonitoringAndLogs',
            Effect: 'Allow',
            Action: [
                'cloudwatch:PutMetricAlarm',
                'cloudwatch:DeleteAlarms',
                'cloudwatch:DescribeAlarms',
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:DeleteLogGroup',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams',
                'logs:FilterLogEvents',
                'logs:PutLogEvents',
                'logs:PutRetentionPolicy',
            ],
            Resource: [
                {
                    'Fn::Sub':
                        'arn:aws:logs:*:${AWS::AccountId}:log-group:/aws/lambda/*frigg*',
                },
                {
                    'Fn::Sub':
                        'arn:aws:logs:*:${AWS::AccountId}:log-group:/aws/lambda/*frigg*:*',
                },
                {
                    'Fn::Sub':
                        'arn:aws:cloudwatch:*:${AWS::AccountId}:alarm:*frigg*',
                },
            ],
        },
        {
            Sid: 'FriggAPIGateway',
            Effect: 'Allow',
            Action: [
                'apigateway:POST',
                'apigateway:PUT',
                'apigateway:DELETE',
                'apigateway:GET',
                'apigateway:PATCH',
                'apigateway:TagResource',
                'apigateway:UntagResource',
            ],
            Resource: [
                'arn:aws:apigateway:*::/restapis',
                'arn:aws:apigateway:*::/restapis/*',
                'arn:aws:apigateway:*::/domainnames',
                'arn:aws:apigateway:*::/domainnames/*',
            ],
        },
        {
            Sid: 'FriggAPIGatewayV2',
            Effect: 'Allow',
            Action: [
                'apigateway:GET',
                'apigateway:DELETE',
                'apigateway:PATCH',
                'apigateway:POST',
                'apigateway:PUT',
            ],
            Resource: [
                'arn:aws:apigateway:*::/apis',
                'arn:aws:apigateway:*::/apis/*',
                'arn:aws:apigateway:*::/apis/*/stages',
                'arn:aws:apigateway:*::/apis/*/stages/*',
                'arn:aws:apigateway:*::/domainnames',
                'arn:aws:apigateway:*::/domainnames/*',
                'arn:aws:apigateway:*::/domainnames/*/apimappings',
            ],
        },
    ];

    template.Resources.FriggCoreDeploymentPolicy = {
        Type: 'AWS::IAM::ManagedPolicy',
        Properties: {
            ManagedPolicyName: 'FriggCoreDeploymentPolicy',
            Description: 'Core permissions for deploying Frigg applications',
            PolicyDocument: {
                Version: '2012-10-17',
                Statement: coreStatements,
            },
        },
    };

    // Add feature-specific policies only if needed
    if (features.vpc) {
        template.Resources.FriggVPCPolicy = {
            Type: 'AWS::IAM::ManagedPolicy',
            Condition: 'CreateVPCPermissions',
            Properties: {
                ManagedPolicyName: 'FriggVPCPolicy',
                Description: 'VPC-related permissions for Frigg applications',
                PolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'FriggVPCEndpointManagement',
                            Effect: 'Allow',
                            Action: [
                                'ec2:CreateVpcEndpoint',
                                'ec2:DeleteVpcEndpoint',
                                'ec2:DescribeVpcEndpoints',
                                'ec2:ModifyVpcEndpoint',
                                'ec2:CreateNatGateway',
                                'ec2:DeleteNatGateway',
                                'ec2:DescribeNatGateways',
                                'ec2:AllocateAddress',
                                'ec2:ReleaseAddress',
                                'ec2:DescribeAddresses',
                                'ec2:CreateRouteTable',
                                'ec2:DeleteRouteTable',
                                'ec2:DescribeRouteTables',
                                'ec2:CreateRoute',
                                'ec2:DeleteRoute',
                                'ec2:ReplaceRoute',
                                'ec2:AssociateRouteTable',
                                'ec2:DisassociateRouteTable',
                                'ec2:CreateSecurityGroup',
                                'ec2:DeleteSecurityGroup',
                                'ec2:AuthorizeSecurityGroupEgress',
                                'ec2:AuthorizeSecurityGroupIngress',
                                'ec2:RevokeSecurityGroupEgress',
                                'ec2:RevokeSecurityGroupIngress',
                                'ec2:DetachInternetGateway',
                                'ec2:DeleteSubnet',
                            ],
                            Resource: '*',
                        },
                    ],
                },
            },
        };
    }

    if (features.kms) {
        template.Resources.FriggKMSPolicy = {
            Type: 'AWS::IAM::ManagedPolicy',
            Condition: 'CreateKMSPermissions',
            Properties: {
                ManagedPolicyName: 'FriggKMSPolicy',
                Description:
                    'KMS encryption permissions for Frigg applications',
                PolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'FriggKMSEncryptionRuntime',
                            Effect: 'Allow',
                            Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
                            Resource: [
                                {
                                    'Fn::Sub':
                                        'arn:aws:kms:*:${AWS::AccountId}:key/*',
                                },
                            ],
                            Condition: {
                                StringEquals: {
                                    'kms:ViaService': [
                                        'lambda.*.amazonaws.com',
                                        's3.*.amazonaws.com',
                                    ],
                                },
                            },
                        },
                        {
                            Sid: 'FriggKMSManagement',
                            Effect: 'Allow',
                            Action: [
                                'kms:CreateKey',
                                'kms:PutKeyPolicy',
                                'kms:EnableKeyRotation',
                                'kms:TagResource',
                                'kms:UntagResource',
                                'kms:ListResourceTags',
                                'kms:CreateAlias',
                                'kms:UpdateAlias',
                                'kms:DeleteAlias',
                                'kms:ListAliases',
                                'kms:DescribeKey',
                            ],
                            Resource: '*',
                        },
                    ],
                },
            },
        };
    }

    template.Resources.FriggKMSKeyAlias = {
        Type: 'AWS::KMS::Alias',
        Condition: 'CreateKMSAlias',
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
        Properties: {
            AliasName: { Ref: 'DeploymentKmsAliasName' },
            TargetKeyId: { Ref: 'DeploymentKmsTargetKeyArn' },
        },
    };

    if (features.ssm) {
        template.Resources.FriggSSMPolicy = {
            Type: 'AWS::IAM::ManagedPolicy',
            Condition: 'CreateSSMPermissions',
            Properties: {
                ManagedPolicyName: 'FriggSSMPolicy',
                Description:
                    'SSM Parameter Store permissions for Frigg applications',
                PolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Sid: 'FriggSSMParameterAccess',
                            Effect: 'Allow',
                            Action: [
                                'ssm:GetParameter',
                                'ssm:GetParameters',
                                'ssm:GetParametersByPath',
                            ],
                            Resource: [
                                {
                                    'Fn::Sub':
                                        'arn:aws:ssm:*:${AWS::AccountId}:parameter/*frigg*',
                                },
                                {
                                    'Fn::Sub':
                                        'arn:aws:ssm:*:${AWS::AccountId}:parameter/*frigg*/*',
                                },
                            ],
                        },
                    ],
                },
            },
        };
    }

    // Add Secrets Manager for credentials
    template.Resources.FriggDeploymentCredentials = {
        Type: 'AWS::SecretsManager::Secret',
        Properties: {
            Name: 'frigg-deployment-credentials',
            Description: 'Access credentials for Frigg deployment user',
            SecretString: {
                'Fn::Sub': JSON.stringify({
                    AccessKeyId: '${FriggDeploymentAccessKey}',
                    SecretAccessKey:
                        '${FriggDeploymentAccessKey.SecretAccessKey}',
                }),
            },
        },
    };

    // Add Outputs
    template.Outputs = {
        DeploymentUserArn: {
            Description: 'ARN of the Frigg deployment user',
            Value: { 'Fn::GetAtt': ['FriggDeploymentUser', 'Arn'] },
            Export: {
                Name: { 'Fn::Sub': '${AWS::StackName}-UserArn' },
            },
        },
        AccessKeyId: {
            Description: 'Access Key ID for the deployment user',
            Value: { Ref: 'FriggDeploymentAccessKey' },
            Export: {
                Name: { 'Fn::Sub': '${AWS::StackName}-AccessKeyId' },
            },
        },
        SecretAccessKeyCommand: {
            Description: 'Command to retrieve the secret access key',
            Value: {
                'Fn::Sub':
                    'aws secretsmanager get-secret-value --secret-id frigg-deployment-credentials --query SecretString --output text | jq -r .SecretAccessKey',
            },
        },
        CredentialsSecretArn: {
            Description: 'ARN of the secret containing deployment credentials',
            Value: { Ref: 'FriggDeploymentCredentials' },
            Export: {
                Name: { 'Fn::Sub': '${AWS::StackName}-CredentialsSecretArn' },
            },
        },
    };

    // Convert to YAML
    return convertToYAML(template);
}

/**
 * Convert JavaScript object to CloudFormation YAML
 * @param {Object} obj - JavaScript object
 * @returns {string} YAML string
 */
function convertToYAML(obj) {
    const yaml = require('js-yaml');
    return yaml.dump(obj, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
    });
}

/**
 * Generate summary of what features will be included in the IAM policy
 * @param {Object} appDefinition - Application definition
 * @returns {Object} Feature summary
 */
function getFeatureSummary(appDefinition) {
    const features = {
        core: true, // Always enabled
        vpc: appDefinition.vpc?.enable === true,
        kms:
            appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms',
        ssm: appDefinition.ssm?.enable === true,
        websockets: appDefinition.websockets?.enable === true,
    };

    const integrationCount = appDefinition.integrations?.length || 0;

    return {
        features,
        integrationCount,
        appName: appDefinition.name || 'Unnamed Frigg App',
    };
}

/**
 * Generate basic IAM policy (JSON format) - Core Frigg permissions only
 * @returns {Object} Basic IAM policy document
 */
function generateBasicIAMPolicy() {
    const basicPolicyPath = path.join(__dirname, 'iam-policy-basic.json');
    return require(basicPolicyPath);
}

/**
 * Generate full IAM policy (JSON format) - All features enabled
 * @returns {Object} Full IAM policy document
 */
function generateFullIAMPolicy() {
    const fullPolicyPath = path.join(__dirname, 'iam-policy-full.json');
    return require(fullPolicyPath);
}

/**
 * Generate IAM policy based on mode
 * @param {string} mode - 'basic' or 'full'
 * @returns {Object} IAM policy document
 */
function generateIAMPolicy(mode = 'basic') {
    if (mode === 'full') {
        return generateFullIAMPolicy();
    }
    return generateBasicIAMPolicy();
}

module.exports = {
    generateIAMCloudFormation,
    getFeatureSummary,
    generateBasicIAMPolicy,
    generateFullIAMPolicy,
    generateIAMPolicy,
};
