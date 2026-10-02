const fs = require('fs');
const path = require('path');
const {
    generateIAMCloudFormation,
    getFeatureSummary,
    generateBasicIAMPolicy,
    generateFullIAMPolicy,
} = require('./iam-generator');

describe('IAM Generator', () => {
    describe('getFeatureSummary', () => {
        it('should detect all features when enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: ['Integration1', 'Integration2'],
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'kms' },
                ssm: { enable: true },
                websockets: { enable: true }
            };

            const summary = getFeatureSummary(appDefinition);

            expect(summary.appName).toBe('test-app');
            expect(summary.integrationCount).toBe(2);
            expect(summary.features.core).toBe(true);
            expect(summary.features.vpc).toBe(true);
            expect(summary.features.kms).toBe(true);
            expect(summary.features.ssm).toBe(true);
            expect(summary.features.websockets).toBe(true);
        });

        it('should detect minimal features when disabled', () => {
            const appDefinition = {
                integrations: []
            };

            const summary = getFeatureSummary(appDefinition);

            expect(summary.appName).toBe('Unnamed Frigg App');
            expect(summary.integrationCount).toBe(0);
            expect(summary.features.core).toBe(true);
            expect(summary.features.vpc).toBe(false);
            expect(summary.features.kms).toBe(false);
            expect(summary.features.ssm).toBe(false);
            expect(summary.features.websockets).toBe(false);
        });

        it('should surface ssm.kmsKeyArn from the app definition', () => {
            const appDefinition = {
                name: 'test-app',
                ssm: {
                    enable: true,
                    kmsKeyArn:
                        'arn:aws:kms:us-east-1:123456789012:key/abcd-1234'
                }
            };

            const summary = getFeatureSummary(appDefinition);

            expect(summary.ssmKmsKeyArn).toBe(
                'arn:aws:kms:us-east-1:123456789012:key/abcd-1234'
            );
        });

        it('should leave ssmKmsKeyArn undefined when not configured', () => {
            const appDefinition = {
                name: 'test-app',
                ssm: { enable: true }
            };

            const summary = getFeatureSummary(appDefinition);

            expect(summary.ssmKmsKeyArn).toBeUndefined();
        });
    });

    describe('generateIAMCloudFormation', () => {
        it('should generate valid CloudFormation YAML', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: false },
                encryption: { fieldLevelEncryptionMethod: 'aes' },
                ssm: { enable: false },
                websockets: { enable: false }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('AWSTemplateFormatVersion');
            expect(yaml).toContain('FriggDeploymentUser');
            expect(yaml).toContain('FriggCoreDeploymentPolicy');
            expect(yaml).toContain('FriggDiscoveryPolicy');
        });

        it('should include VPC policy when VPC is enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('FriggVPCPolicy');
            expect(yaml).toContain('CreateVPCPermissions');
            expect(yaml).toContain('EnableVPCSupport');
            expect(yaml).toContain('ec2:ReplaceRoute');
        });

        it('should include KMS policy when encryption is enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                encryption: { fieldLevelEncryptionMethod: 'kms' }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('FriggKMSPolicy');
            expect(yaml).toContain('CreateKMSPermissions');
            expect(yaml).toContain('EnableKMSSupport');
            expect(yaml).toContain('FriggKMSKeyAlias');
            expect(yaml).toContain('kms:CreateAlias');
        });

        it('should include SSM policy when SSM is enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                ssm: { enable: true }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('FriggSSMPolicy');
            expect(yaml).toContain('CreateSSMPermissions');
            expect(yaml).toContain('EnableSSMSupport');
        });

        it('should grant SSM-mediated KMS access via ssm.*.amazonaws.com when SSM is enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                ssm: { enable: true }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('FriggSSMParameterKMSEncryption');
            expect(yaml).toContain('kms:Encrypt');
            expect(yaml).toContain('ssm.*.amazonaws.com');
            // No customer-managed key configured: falls back to the account key wildcard
            expect(yaml).toContain('arn:aws:kms:*:${AWS::AccountId}:key/*');

            // The regional ViaService wildcard must be matched with StringLike;
            // StringEquals would compare literally and never match
            // ssm.<region>.amazonaws.com, denying the SecureString KMS call.
            const ssmKmsBlock = yaml.slice(
                yaml.indexOf('FriggSSMParameterKMSEncryption'),
                yaml.indexOf('FriggSSMParameterKMSEncryption') + 600
            );
            expect(ssmKmsBlock).toContain('StringLike');
            expect(ssmKmsBlock).not.toContain('StringEquals');
        });

        it('should scope the SSM KMS grant to ssm.kmsKeyArn when provided', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                ssm: {
                    enable: true,
                    kmsKeyArn:
                        'arn:aws:kms:us-east-1:123456789012:key/abcd-1234'
                }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features,
                ssmKmsKeyArn: appDefinition.ssm.kmsKeyArn
            });

            expect(yaml).toContain('FriggSSMParameterKMSEncryption');
            expect(yaml).toContain(
                'arn:aws:kms:us-east-1:123456789012:key/abcd-1234'
            );
            expect(yaml).not.toContain('arn:aws:kms:*:${AWS::AccountId}:key/*');
        });

        it('should set correct default parameter values based on features', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                encryption: { fieldLevelEncryptionMethod: 'aes' },
                ssm: { enable: true }
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            // Check parameter defaults match the enabled features
            expect(yaml).toContain("Default: 'true'"); // VPC enabled
            expect(yaml).toContain("Default: 'false'"); // KMS disabled
            expect(yaml).toContain('alias/frigg-deployment');
        });

        it('should include all core permissions', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            // Check for core permissions
            expect(yaml).toContain('cloudformation:CreateStack');
            expect(yaml).toContain('cloudformation:ListStackResources');
            expect(yaml).toContain('lambda:CreateFunction');
            expect(yaml).toContain('iam:CreateRole');
            expect(yaml).toContain('s3:CreateBucket');
            expect(yaml).toContain('sqs:CreateQueue');
            expect(yaml).toContain('sns:CreateTopic');
            expect(yaml).toContain('logs:CreateLogGroup');
            expect(yaml).toContain('apigateway:POST');
            expect(yaml).toContain('lambda:ListVersionsByFunction');
            expect(yaml).toContain('iam:ListPolicyVersions');
        });

        it('should grant logs:DeleteRetentionPolicy so logging.retentionInDays can be removed', () => {
            const yaml = generateIAMCloudFormation({
                appName: 'test-app',
                features: getFeatureSummary({ name: 'test-app' }).features,
            });

            expect(yaml).toContain('logs:PutRetentionPolicy');
            expect(yaml).toContain('logs:DeleteRetentionPolicy');
        });

        it('should grant logs:DeleteRetentionPolicy in the static policy templates', () => {
            for (const policy of [generateBasicIAMPolicy(), generateFullIAMPolicy()]) {
                const actions = policy.Statement.flatMap((statement) => statement.Action);
                expect(actions).toContain('logs:DeleteRetentionPolicy');
            }
            const stackYaml = fs.readFileSync(
                path.join(__dirname, 'templates/frigg-deployment-iam-stack.yaml'),
                'utf8'
            );
            expect(stackYaml).toContain("'logs:DeleteRetentionPolicy'");
        });

        it('should include internal-error-queue pattern in SQS resources', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('internal-error-queue-*');
        });

        it('should generate outputs section', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const summary = getFeatureSummary(appDefinition);
            const yaml = generateIAMCloudFormation({
                appName: summary.appName,
                features: summary.features
            });

            expect(yaml).toContain('Outputs:');
            expect(yaml).toContain('DeploymentUserArn:');
            expect(yaml).toContain('AccessKeyId:');
            expect(yaml).toContain('SecretAccessKeyCommand:');
            expect(yaml).toContain('CredentialsSecretArn:');
        });
    });

    describe("scoping to the app's own resources", () => {
        const yaml = require('js-yaml');
        const policyResources = (template, policy) =>
            template.Resources[
                policy
            ].Properties.PolicyDocument.Statement.flatMap((statement) =>
                [].concat(statement.Resource)
            ).map((r) => (typeof r === 'string' ? r : r['Fn::Sub']));

        // `frigg deploy` names everything after the service (Definition.name):
        // stack my-app-prod, functions my-app-prod-auth, role
        // my-app-prod-us-east-1-lambdaRole, queues my-app-internal-error-queue-prod
        // and my-app-prod-DbMigrationQueue, layer my-app-prisma-prod, and
        // CloudFormation-named topics, alarms and buckets prefixed my-app-prod.
        const generate = (appDefinition) => {
            const summary = getFeatureSummary(appDefinition);
            return yaml.load(
                generateIAMCloudFormation({
                    appName: summary.appName,
                    serviceName: summary.serviceName,
                    features: summary.features,
                })
            );
        };

        it('reports the service name osls deploys under', () => {
            expect(getFeatureSummary({ name: 'my-app' }).serviceName).toBe(
                'my-app'
            );
            expect(getFeatureSummary({}).serviceName).toBe('create-frigg-app');
        });

        it('lets an app whose name does not contain "frigg" deploy its stack and resources', () => {
            const resources = policyResources(
                generate({ name: 'my-app' }),
                'FriggCoreDeploymentPolicy'
            );

            for (const expected of [
                'arn:aws:cloudformation:*:${AWS::AccountId}:stack/*my-app*/*',
                'arn:aws:lambda:*:${AWS::AccountId}:function:*my-app*',
                'arn:aws:iam::${AWS::AccountId}:role/*my-app*',
                'arn:aws:sqs:*:${AWS::AccountId}:*my-app*',
                'arn:aws:sns:*:${AWS::AccountId}:*my-app*',
                'arn:aws:logs:*:${AWS::AccountId}:log-group:/aws/lambda/*my-app*',
                'arn:aws:logs:*:${AWS::AccountId}:log-group:/aws/lambda/*my-app*:*',
                'arn:aws:cloudwatch:*:${AWS::AccountId}:alarm:*my-app*',
                'arn:aws:lambda:*:${AWS::AccountId}:layer:*my-app*',
                'arn:aws:lambda:*:${AWS::AccountId}:layer:*my-app*:*',
                'arn:aws:s3:::*my-app*',
                'arn:aws:s3:::*my-app*/*',
            ]) {
                expect(resources).toContain(expected);
            }
            // Existing grants for frigg-named resources are kept.
            expect(resources).toContain(
                'arn:aws:lambda:*:${AWS::AccountId}:function:*frigg*'
            );
        });

        it('matches S3 bucket names in lower case', () => {
            const resources = policyResources(
                generate({ name: 'MyApp' }),
                'FriggCoreDeploymentPolicy'
            );
            expect(resources).toContain('arn:aws:s3:::*myapp*');
        });

        it('scopes the SSM parameter grant to the app too', () => {
            const template = generate({
                name: 'my-app',
                ssm: { enable: true },
            });
            const resources = policyResources(template, 'FriggSSMPolicy');
            expect(resources).toContain(
                'arn:aws:ssm:*:${AWS::AccountId}:parameter/*my-app*'
            );
        });

        it('does not duplicate grants for an app named frigg', () => {
            const resources = policyResources(
                generate({ name: 'frigg' }),
                'FriggCoreDeploymentPolicy'
            );
            expect(
                resources.filter(
                    (r) =>
                        r ===
                        'arn:aws:lambda:*:${AWS::AccountId}:function:*frigg*'
                )
            ).toHaveLength(1);
        });
    });
});
