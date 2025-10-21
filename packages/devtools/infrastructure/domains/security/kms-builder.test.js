/**
 * Tests for KMS Builder
 * 
 * Tests KMS key creation and configuration
 */

const { KmsBuilder } = require('./kms-builder');
const { ValidationResult } = require('../shared/base-builder');

describe('KmsBuilder', () => {
    let kmsBuilder;

    beforeEach(() => {
        kmsBuilder = new KmsBuilder();
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    afterEach(() => {
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    describe('shouldExecute()', () => {
        it('should return true when encryption method is kms', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            expect(kmsBuilder.shouldExecute(appDefinition)).toBe(true);
        });

        it('should return false when encryption method is aes', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'aes',
                },
            };

            expect(kmsBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when encryption is not defined', () => {
            const appDefinition = {};

            expect(kmsBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when fieldLevelEncryptionMethod is not defined', () => {
            const appDefinition = {
                encryption: {},
            };

            expect(kmsBuilder.shouldExecute(appDefinition)).toBe(false);
        });

        it('should return false when FRIGG_SKIP_AWS_DISCOVERY is set (local mode)', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            expect(kmsBuilder.shouldExecute(appDefinition)).toBe(false);
        });
    });

    describe('validate()', () => {
        it('should pass validation for valid KMS config', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = kmsBuilder.validate(appDefinition);

            expect(result).toBeInstanceOf(ValidationResult);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should pass validation when createResourceIfNoneFound is boolean', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: false,
                },
            };

            const result = kmsBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error if encryption configuration is missing', () => {
            const appDefinition = {};

            const result = kmsBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Encryption configuration is missing');
        });

        it('should pass when encryption method is not kms', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'aes',
                },
            };

            const result = kmsBuilder.validate(appDefinition);

            expect(result.valid).toBe(true);
        });

        it('should error when createResourceIfNoneFound is not boolean', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: 'yes',
                },
            };

            const result = kmsBuilder.validate(appDefinition);

            expect(result.valid).toBe(false);
            expect(result.errors).toContain(
                'encryption.createResourceIfNoneFound must be a boolean'
            );
        });
    });

    describe('build() - with discovered key', () => {
        it('should use discovered KMS key', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const discoveredResources = {
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456:key/abc-123',
            };

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.environment.KMS_KEY_ARN).toBe('arn:aws:kms:us-east-1:123456:key/abc-123');
            expect(result.pluginConfig.kmsGrants).toBeUndefined();
        });

        it('should add IAM permissions for KMS operations', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const discoveredResources = {
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456:key/abc',
            };

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.iamStatements).toHaveLength(1);
            expect(result.iamStatements[0]).toEqual({
                Effect: 'Allow',
                Action: ['kms:GenerateDataKey', 'kms:Decrypt', 'kms:Encrypt', 'kms:DescribeKey'],
                Resource: 'arn:aws:kms:us-east-1:123456:key/abc',
            });
        });

        it('should NOT use serverless-kms-grants plugin (deprecated)', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const discoveredResources = {
                defaultKmsKeyId: 'arn:aws:kms:us-east-1:123456:key/abc',
            };

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.plugins).not.toContain('serverless-kms-grants');
            expect(result.pluginConfig.kmsGrants).toBeUndefined();
        });
    });

    describe('build() - create new key', () => {
        it('should create new KMS key when none found and createResourceIfNoneFound is true', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const discoveredResources = {
                defaultKmsKeyId: null,
            };

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggKMSKey).toBeDefined();
            expect(result.resources.FriggKMSKey.Type).toBe('AWS::KMS::Key');
        });

        it('should create KMS key alias', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const discoveredResources = {};

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.resources.FriggKMSKeyAlias).toBeDefined();
            expect(result.resources.FriggKMSKeyAlias.Type).toBe('AWS::KMS::Alias');
        });

        it('should enable key rotation for new keys', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = await kmsBuilder.build(appDefinition, {});

            expect(result.resources.FriggKMSKey.Properties.EnableKeyRotation).toBe(true);
        });

        it('should use CloudFormation reference for new key', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = await kmsBuilder.build(appDefinition, {});

            expect(result.environment.KMS_KEY_ARN).toEqual({
                'Fn::GetAtt': ['FriggKMSKey', 'Arn'],
            });
        });

        it('should set DeletionPolicy to Retain for key resources', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = await kmsBuilder.build(appDefinition, {});

            expect(result.resources.FriggKMSKey.DeletionPolicy).toBe('Retain');
            expect(result.resources.FriggKMSKey.UpdateReplacePolicy).toBe('Retain');
        });
    });

    describe('getDependencies()', () => {
        it('should have no dependencies', () => {
            const deps = kmsBuilder.getDependencies();

            expect(deps).toEqual([]);
        });
    });

    describe('getName()', () => {
        it('should return KmsBuilder', () => {
            expect(kmsBuilder.getName()).toBe('KmsBuilder');
        });
    });

    describe('Key policies', () => {
        it('should create key policy allowing root account admin', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = await kmsBuilder.build(appDefinition, {});

            const policy = result.resources.FriggKMSKey.Properties.KeyPolicy;
            const rootStatement = policy.Statement.find(s => s.Sid === 'AllowRootAccountAdmin');

            expect(rootStatement).toBeDefined();
            expect(rootStatement.Action).toBe('kms:*');
        });

        it('should create key policy allowing Lambda service', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = await kmsBuilder.build(appDefinition, {});

            const policy = result.resources.FriggKMSKey.Properties.KeyPolicy;
            const lambdaStatement = policy.Statement.find(s => s.Sid === 'AllowLambdaService');

            expect(lambdaStatement).toBeDefined();
            expect(lambdaStatement.Action).toContain('kms:GenerateDataKey');
            expect(lambdaStatement.Action).toContain('kms:Decrypt');
        });

        it('should create key policy allowing Lambda execution role direct access', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: true,
                },
            };

            const result = await kmsBuilder.build(appDefinition, {});

            const policy = result.resources.FriggKMSKey.Properties.KeyPolicy;
            // Should NOT have AllowLambdaExecutionRole statement to avoid circular dependency
            // (KMS Key → IAM Role → KMS Key = circular)
            // IAM policies already grant KMS permissions, so key policy doesn't need to reference the role
            const roleStatement = policy.Statement.find(s => s.Sid === 'AllowLambdaExecutionRole');
            expect(roleStatement).toBeUndefined();
        });
    });

    describe('Error handling', () => {
        it('should fallback to environment variable when no key discovered and createResourceIfNoneFound is false', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    createResourceIfNoneFound: false,
                },
            };

            const discoveredResources = {
                defaultKmsKeyId: null,
            };

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.environment.KMS_KEY_ARN).toBe('${env:AWS_DISCOVERY_KMS_KEY_ID}');
        });

        it('should fallback to environment variable when createResourceIfNoneFound not specified', async () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                },
            };

            const discoveredResources = {};

            const result = await kmsBuilder.build(appDefinition, discoveredResources);

            expect(result.environment.KMS_KEY_ARN).toBe('${env:AWS_DISCOVERY_KMS_KEY_ID}');
        });
    });
});

