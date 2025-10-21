/**
 * KMS (Key Management Service) Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for:
 * - KMS key creation or discovery
 * - KMS key configuration for field-level encryption
 * - IAM permissions for KMS operations
 * - KMS key policy configuration for Lambda execution role
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');

class KmsBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'KmsBuilder';
    }

    shouldExecute(appDefinition) {
        // Skip KMS in local mode (when FRIGG_SKIP_AWS_DISCOVERY is set)
        // KMS is an AWS-specific service that should only be created in production
        if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
            return false;
        }

        return appDefinition.encryption?.fieldLevelEncryptionMethod === 'kms';
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.encryption) {
            result.addError('Encryption configuration is missing');
            return result;
        }

        const encryption = appDefinition.encryption;

        if (encryption.fieldLevelEncryptionMethod !== 'kms') {
            // Not an error - just not applicable
            return result;
        }

        // Validate createResourceIfNoneFound is boolean
        if (encryption.createResourceIfNoneFound !== undefined &&
            typeof encryption.createResourceIfNoneFound !== 'boolean') {
            result.addError('encryption.createResourceIfNoneFound must be a boolean');
        }

        return result;
    }

    /**
     * Build KMS infrastructure
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring KMS encryption...`);

        const result = {
            resources: {},
            iamStatements: [],
            environment: {},
            pluginConfig: {},
            plugins: [],
        };

        // Normalize top-level managementMode
        const globalMode = appDefinition.managementMode || 'discover';
        let createIfNoneFound = appDefinition.encryption.createResourceIfNoneFound;

        if (globalMode === 'managed') {
            // In managed mode, always create KMS if not found
            createIfNoneFound = true;
            if (appDefinition.encryption.createResourceIfNoneFound !== undefined) {
                console.log(`  ⚠️  managementMode='managed' ignoring: encryption.createResourceIfNoneFound`);
            }
        }

        // Check if we should create a new KMS key
        if (!discoveredResources.defaultKmsKeyId && createIfNoneFound === true) {
            console.log('  Creating new KMS key...');
            result.resources = this.createKmsKey(appDefinition);
            result.environment.KMS_KEY_ARN = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };
            console.log('  ✅ KMS key resources created');
        } else {
            // Use discovered KMS key
            const kmsKeyId = discoveredResources.defaultKmsKeyId || '${env:AWS_DISCOVERY_KMS_KEY_ID}';
            console.log(`  Using ${discoveredResources.defaultKmsKeyId ? 'discovered' : 'environment variable'} KMS key`);

            // Format as ARN if it's just a key ID (for IAM policies)
            const kmsArn = kmsKeyId.startsWith('arn:')
                ? kmsKeyId
                : `arn:aws:kms:\${self:provider.region}:\${aws:accountId}:key/${kmsKeyId}`;

            result.environment.KMS_KEY_ARN = kmsArn;
        }

        // Add IAM permissions for Lambda role
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['kms:GenerateDataKey', 'kms:Decrypt', 'kms:Encrypt', 'kms:DescribeKey'],
            Resource: result.environment.KMS_KEY_ARN,
        });

        console.log(`[${this.name}] ✅ KMS configuration completed`);
        return result;
    }

    /**
     * Create KMS key CloudFormation resources
     */
    createKmsKey(appDefinition) {
        return {
            FriggKMSKey: {
                Type: 'AWS::KMS::Key',
                DeletionPolicy: 'Retain',
                UpdateReplacePolicy: 'Retain',
                Properties: {
                    Description: 'Frigg Field-Level Encryption Key for ${self:service}-${self:provider.stage}',
                    EnableKeyRotation: true,
                    KeyPolicy: {
                        Version: '2012-10-17',
                        Id: 'key-policy-1',
                        Statement: [
                            {
                                Sid: 'AllowRootAccountAdmin',
                                Effect: 'Allow',
                                Principal: {
                                    AWS: {
                                        'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:root',
                                    },
                                },
                                Action: 'kms:*',
                                Resource: '*',
                            },
                            {
                                Sid: 'AllowLambdaService',
                                Effect: 'Allow',
                                Principal: {
                                    Service: 'lambda.amazonaws.com',
                                },
                                Action: [
                                    'kms:Decrypt',
                                    'kms:GenerateDataKey',
                                    'kms:CreateGrant',
                                ],
                                Resource: '*',
                                Condition: {
                                    StringEquals: {
                                        'kms:ViaService': 'lambda.${self:provider.region}.amazonaws.com',
                                    },
                                },
                            },
                            // NOTE: We do NOT add a statement referencing IamRoleLambdaExecution here
                            // because it creates a circular dependency (KMS Key → IAM Role → KMS Key).
                            // Instead, IAM policies grant the Lambda execution role permissions to use KMS.
                        ],
                    },
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-kms' },
                        { Key: 'ManagedBy', Value: 'Frigg' },
                        { Key: 'Service', Value: '${self:service}' },
                        { Key: 'Stage', Value: '${self:provider.stage}' },
                    ],
                },
            },
            FriggKMSKeyAlias: {
                Type: 'AWS::KMS::Alias',
                DeletionPolicy: 'Retain',
                Properties: {
                    AliasName: 'alias/${self:service}-${self:provider.stage}-frigg-kms',
                    TargetKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] },
                },
            },
        };
    }
}

module.exports = { KmsBuilder };

