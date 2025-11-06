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
const { KmsResourceResolver } = require('./kms-resolver');
const { createEmptyDiscoveryResult, ResourceOwnership } = require('../shared/types');

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
     * Build KMS infrastructure using ownership-based architecture
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring KMS encryption...`);

        // Backwards compatibility: Translate old schema to new ownership schema
        appDefinition = this.translateLegacyConfig(appDefinition, discoveredResources);

        const result = {
            resources: {},
            iamStatements: [],
            environment: {},
            pluginConfig: {},
            plugins: [],
        };

        // Get structured discovery result
        const discovery = discoveredResources._structured || this.convertFlatDiscoveryToStructured(discoveredResources, appDefinition);

        // Use KmsResourceResolver to make ownership decisions
        const resolver = new KmsResourceResolver();
        const decisions = resolver.resolveAll(appDefinition, discovery);

        // Check if external key exists (for accurate logging)
        const externalKmsKey = discoveredResources?.defaultKmsKeyId ||
                              discoveredResources?.kmsKeyArn ||
                              discoveredResources?.kmsKeyId;
        const willUseExternal = decisions.key.ownership === ResourceOwnership.STACK && 
                                !decisions.key.physicalId && 
                                externalKmsKey;

        console.log('\n  📋 Resource Ownership Decisions:');
        if (willUseExternal) {
            console.log(`     Key: external - Found external KMS key (not in stack)`);
        } else {
            console.log(`     Key: ${decisions.key.ownership} - ${decisions.key.reason}`);
        }

        // Build resources based on ownership decisions
        await this.buildFromDecisions(decisions, appDefinition, discoveredResources, result);

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
     * Convert flat discovery to structured discovery
     * Provides backwards compatibility for tests
     */
    convertFlatDiscoveryToStructured(flatDiscovery, appDefinition = {}) {
        const discovery = createEmptyDiscoveryResult();

        if (!flatDiscovery) {
            return discovery;
        }

        // Check if resources are from CloudFormation stack
        const isManagedIsolated = appDefinition.managementMode === 'managed' &&
                                   (appDefinition.vpcIsolation === 'isolated' || !appDefinition.vpcIsolation);
        const hasExistingStackResources = isManagedIsolated && flatDiscovery.defaultKmsKeyId &&
                                         typeof flatDiscovery.defaultKmsKeyId === 'string';

        if (flatDiscovery.fromCloudFormationStack || hasExistingStackResources) {
            discovery.fromCloudFormation = true;
            discovery.stackName = flatDiscovery.stackName || 'assumed-stack';

            // Add stack-managed resources
            let existingLogicalIds = flatDiscovery.existingLogicalIds || [];

            // Infer logical IDs from physical IDs if needed
            if (hasExistingStackResources && existingLogicalIds.length === 0) {
                if (flatDiscovery.defaultKmsKeyId) {
                    existingLogicalIds.push('FriggKMSKey');
                    existingLogicalIds.push('FriggKMSKeyAlias');
                }
            }

            existingLogicalIds.forEach(logicalId => {
                let resourceType = '';
                let physicalId = '';

                if (logicalId === 'FriggKMSKey') {
                    resourceType = 'AWS::KMS::Key';
                    physicalId = flatDiscovery.defaultKmsKeyId;
                } else if (logicalId === 'FriggKMSKeyAlias') {
                    resourceType = 'AWS::KMS::Alias';
                    // Extract alias name from KMS key ARN or use default pattern
                    const stackName = flatDiscovery.stackName || 'unknown';
                    const stage = appDefinition.stage || 'dev';
                    physicalId = `alias/${stackName.replace(`-${stage}`, '')}-${stage}-frigg-kms`;
                }

                if (physicalId && typeof physicalId === 'string') {
                    discovery.stackManaged.push({
                        logicalId,
                        physicalId,
                        resourceType
                    });
                }
            });
        } else {
            // Resources discovered from AWS API (external)
            if (flatDiscovery.defaultKmsKeyId && typeof flatDiscovery.defaultKmsKeyId === 'string') {
                discovery.external.push({
                    physicalId: flatDiscovery.defaultKmsKeyId,
                    resourceType: 'AWS::KMS::Key',
                    source: 'aws-discovery'
                });
            }
        }

        return discovery;
    }

    /**
     * Translate legacy configuration to ownership-based configuration
     * Provides backwards compatibility
     */
    translateLegacyConfig(appDefinition, discoveredResources) {
        // If already using ownership schema, return as-is
        if (appDefinition.encryption?.ownership) {
            return appDefinition;
        }

        const translated = JSON.parse(JSON.stringify(appDefinition));

        // Initialize ownership sections
        if (!translated.encryption) translated.encryption = {};
        if (!translated.encryption.ownership) {
            translated.encryption.ownership = {};
        }

        // Handle top-level managementMode
        const globalMode = appDefinition.managementMode || 'discover';
        const vpcIsolation = appDefinition.vpcIsolation || 'shared';

        if (globalMode === 'managed') {
            if (appDefinition.encryption?.createResourceIfNoneFound !== undefined) {
                console.log(`  ⚠️  managementMode='managed' ignoring: encryption.createResourceIfNoneFound`);
            }

            if (vpcIsolation === 'isolated') {
                const hasStackKms = discoveredResources?.defaultKmsKeyId &&
                    typeof discoveredResources.defaultKmsKeyId === 'string';

                if (hasStackKms) {
                    translated.encryption.ownership.key = 'auto';
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → stack has KMS, reusing`);
                } else {
                    translated.encryption.ownership.key = 'stack';
                    console.log(`  managementMode='managed' + vpcIsolation='isolated' → no stack KMS, creating new`);
                }
            } else {
                translated.encryption.ownership.key = 'auto';
                console.log(`  managementMode='managed' + vpcIsolation='shared' → discovering KMS`);
            }
        } else {
            // Handle legacy createResourceIfNoneFound
            const createIfNoneFound = appDefinition.encryption?.createResourceIfNoneFound;
            if (createIfNoneFound === true) {
                translated.encryption.ownership.key = 'stack';
            } else if (createIfNoneFound === false || createIfNoneFound === undefined) {
                // When createResourceIfNoneFound is false or not specified:
                // - If KMS found → use it (auto)
                // - If not found → use environment variable (external)
                // We use 'auto' here; the resolver will decide based on discovery
                // But we need special handling in buildFromDecisions for the env var fallback
                translated.encryption.ownership.key = 'auto';
                translated.encryption._useEnvVarFallback = true;  // Flag for env var fallback
            }
        }

        return translated;
    }

    /**
     * Build all KMS resources based on ownership decisions
     */
    async buildFromDecisions(decisions, appDefinition, discoveredResources, result) {
        // Check for environment variable fallback flag (legacy behavior)
        const useEnvVarFallback = appDefinition.encryption?._useEnvVarFallback;

        // CRITICAL FIX: Check if KMS key exists OUTSIDE of stack (orphaned resource)
        // If key exists but not in stack, we should use it as EXTERNAL, not try to create it
        const externalKmsKey = discoveredResources?.defaultKmsKeyId ||
                              discoveredResources?.kmsKeyArn ||
                              discoveredResources?.kmsKeyId;

        if (decisions.key.ownership === ResourceOwnership.STACK && decisions.key.physicalId) {
            // Key exists in stack - add definitions (CloudFormation idempotency)
            console.log('  → Adding KMS definitions to template (existing in stack)');
            
            // Check if alias exists in stack before trying to create it
            const aliasExistsInStack = discoveredResources?.existingLogicalIds?.includes('FriggKMSKeyAlias');
            if (!aliasExistsInStack && appDefinition.encryption?.kmsKeyAlias !== false) {
                // Alias doesn't exist and user didn't explicitly disable it
                // Set kmsKeyAlias: false to avoid trying to create it (permission issues)
                console.log('  ℹ KMS alias not found in stack - skipping alias creation to avoid permission errors');
                appDefinition.encryption = appDefinition.encryption || {};
                appDefinition.encryption.kmsKeyAlias = false;
            }
            
            result.resources = this.createKmsKey(appDefinition);
            result.environment.KMS_KEY_ARN = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };
            console.log('  ✅ KMS key resources created');
        } else if (decisions.key.ownership === ResourceOwnership.STACK && !decisions.key.physicalId && externalKmsKey) {
            // ORPHANED KEY FIX: Key exists externally but not in stack
            // Use it as external instead of trying to create (would fail with "already exists")
            console.log(`  → Using external KMS key: ${externalKmsKey}`);

            // Format as ARN if it's just a key ID
            const kmsArn = externalKmsKey.startsWith('arn:')
                ? externalKmsKey
                : `arn:aws:kms:\${self:provider.region}:\${aws:accountId}:key/${externalKmsKey}`;

            result.environment.KMS_KEY_ARN = kmsArn;
        } else if (decisions.key.ownership === ResourceOwnership.STACK && !decisions.key.physicalId && !useEnvVarFallback) {
            // Create new KMS key (only if not using env var fallback and no external key found)
            console.log('  → Creating new KMS key in stack');
            result.resources = this.createKmsKey(appDefinition);
            result.environment.KMS_KEY_ARN = { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] };
            console.log('  ✅ KMS key resources created');
        } else if (decisions.key.ownership === ResourceOwnership.STACK && !decisions.key.physicalId && useEnvVarFallback) {
            // Legacy behavior: fallback to environment variable when createResourceIfNoneFound=false/undefined
            const createIfNoneFound = discoveredResources.defaultKmsKeyId ? true : appDefinition.encryption?.createResourceIfNoneFound;
            const formatAsArn = createIfNoneFound === undefined;  // Format as ARN when not specified

            if (formatAsArn) {
                console.log('  → Using environment variable for KMS key (formatted as ARN)');
                result.environment.KMS_KEY_ARN = 'arn:aws:kms:${self:provider.region}:${aws:accountId}:key/${env:AWS_DISCOVERY_KMS_KEY_ID}';
            } else {
                console.log('  → Using environment variable for KMS key');
                result.environment.KMS_KEY_ARN = '${env:AWS_DISCOVERY_KMS_KEY_ID}';
            }
        } else if (decisions.key.ownership === ResourceOwnership.EXTERNAL) {
            // Use discovered KMS key
            const kmsKeyId = decisions.key.physicalId || '${env:AWS_DISCOVERY_KMS_KEY_ID}';
            console.log(`  → Using ${decisions.key.physicalId ? 'discovered' : 'environment variable'} KMS key`);

            // Format as ARN if it's just a key ID (for IAM policies)
            const kmsArn = kmsKeyId.startsWith('arn:')
                ? kmsKeyId
                : `arn:aws:kms:\${self:provider.region}:\${aws:accountId}:key/${kmsKeyId}`;

            result.environment.KMS_KEY_ARN = kmsArn;
        } else {
            // Fallback
            console.log('  → Using environment variable for KMS key');
            result.environment.KMS_KEY_ARN = 'arn:aws:kms:${self:provider.region}:${aws:accountId}:key/${env:AWS_DISCOVERY_KMS_KEY_ID}';
        }
    }

    /**
     * Create KMS key CloudFormation resources
     */
    createKmsKey(appDefinition) {
        const resources = {
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
        };

        // Only create alias if explicitly enabled (default: true for backwards compatibility)
        const createAlias = appDefinition.encryption?.kmsKeyAlias !== false;
        if (createAlias) {
            resources.FriggKMSKeyAlias = {
                Type: 'AWS::KMS::Alias',
                DeletionPolicy: 'Retain',
                Properties: {
                    AliasName: 'alias/${self:service}-${self:provider.stage}-frigg-kms',
                    TargetKeyId: { 'Fn::GetAtt': ['FriggKMSKey', 'Arn'] },
                },
            };
        } else {
            console.log('  ℹ Skipping KMS key alias creation (kmsKeyAlias: false)');
        }

        return resources;
    }
}

module.exports = { KmsBuilder };

