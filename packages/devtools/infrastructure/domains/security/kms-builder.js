/**
 * KMS (Key Management Service) Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for:
 * - KMS key creation or discovery
 * - KMS key configuration for field-level encryption
 * - IAM permissions for KMS operations
 * - KMS grants via serverless-kms-grants plugin
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

        // Check if we should create a new KMS key
        if (!discoveredResources.defaultKmsKeyId &&
            appDefinition.encryption.createResourceIfNoneFound === true) {

            console.log('  Creating new KMS key...');
            result.resources = this.createKmsKey(appDefinition);
            result.environment.KMS_KEY_ARN = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };
            result.pluginConfig.kmsGrants = {
                kmsKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] },
            };
            console.log('  ✅ KMS key resources created');
        } else {
            // Use discovered KMS key
            const kmsKeyId = discoveredResources.defaultKmsKeyId || '${env:AWS_DISCOVERY_KMS_KEY_ID}';
            console.log(`  Using ${discoveredResources.defaultKmsKeyId ? 'discovered' : 'environment variable'} KMS key`);
            result.environment.KMS_KEY_ARN = kmsKeyId;
            result.pluginConfig.kmsGrants = { kmsKeyId };
        }

        // Add IAM permissions
        result.iamStatements.push({
            Effect: 'Allow',
            Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
            Resource: result.environment.KMS_KEY_ARN,
        });

        // Enable KMS grants plugin
        result.plugins.push('serverless-kms-grants');

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
                    KeyPolicy: {
                        Version: '2012-10-17',
                        Id: 'key-policy-1',
                        Statement: [
                            {
                                Sid: 'Enable IAM User Permissions',
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
                                Sid: 'Allow Lambda to use the key',
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

