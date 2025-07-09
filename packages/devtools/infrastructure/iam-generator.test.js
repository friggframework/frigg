const { generateIAMCloudFormation, getFeatureSummary } = require('./iam-generator');

describe('IAM Generator', () => {
    describe('getFeatureSummary', () => {
        it('should detect all features when enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: ['Integration1', 'Integration2'],
                vpc: { enable: true },
                encryption: { useDefaultKMSForFieldLevelEncryption: true },
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
    });

    describe('generateIAMCloudFormation', () => {
        it('should generate valid CloudFormation YAML', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: false },
                encryption: { useDefaultKMSForFieldLevelEncryption: false },
                ssm: { enable: false },
                websockets: { enable: false }
            };

            const yaml = generateIAMCloudFormation(appDefinition);

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

            const yaml = generateIAMCloudFormation(appDefinition);

            expect(yaml).toContain('FriggVPCPolicy');
            expect(yaml).toContain('CreateVPCPermissions');
            expect(yaml).toContain('EnableVPCSupport');
        });

        it('should include KMS policy when encryption is enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                encryption: { useDefaultKMSForFieldLevelEncryption: true }
            };

            const yaml = generateIAMCloudFormation(appDefinition);

            expect(yaml).toContain('FriggKMSPolicy');
            expect(yaml).toContain('CreateKMSPermissions');
            expect(yaml).toContain('EnableKMSSupport');
        });

        it('should include SSM policy when SSM is enabled', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                ssm: { enable: true }
            };

            const yaml = generateIAMCloudFormation(appDefinition);

            expect(yaml).toContain('FriggSSMPolicy');
            expect(yaml).toContain('CreateSSMPermissions');
            expect(yaml).toContain('EnableSSMSupport');
        });

        it('should set correct default parameter values based on features', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: [],
                vpc: { enable: true },
                encryption: { useDefaultKMSForFieldLevelEncryption: false },
                ssm: { enable: true }
            };

            const yaml = generateIAMCloudFormation(appDefinition);

            // Check parameter defaults match the enabled features
            expect(yaml).toContain('Default: true'); // VPC enabled
            expect(yaml).toContain('Default: false'); // KMS disabled  
            // SSM should be true
        });

        it('should include all core permissions', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const yaml = generateIAMCloudFormation(appDefinition);

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

        it('should include internal-error-queue pattern in SQS resources', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const yaml = generateIAMCloudFormation(appDefinition);

            expect(yaml).toContain('internal-error-queue-*');
        });

        it('should generate outputs section', () => {
            const appDefinition = {
                name: 'test-app',
                integrations: []
            };

            const yaml = generateIAMCloudFormation(appDefinition);

            expect(yaml).toContain('Outputs:');
            expect(yaml).toContain('DeploymentUserArn:');
            expect(yaml).toContain('AccessKeyId:');
            expect(yaml).toContain('SecretAccessKeyCommand:');
            expect(yaml).toContain('CredentialsSecretArn:');
        });
    });
});