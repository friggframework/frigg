/**
 * SSM Parameter Store Builder
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * Responsible for:
 * - Configuring IAM permissions for SSM Parameter Store access
 * - Setting up SSM parameter references for Lambda functions
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');
const {
    getOffloadedKeys,
    getParameterPrefix,
    isSsmOffloadActive,
    validateOffloadConfig,
} = require('./offload-utils');

class SsmBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'SsmBuilder';
    }

    shouldExecute(appDefinition) {
        // Skip SSM in local mode (when FRIGG_SKIP_AWS_DISCOVERY is set)
        // SSM Parameter Store is an AWS-specific service that should only be used in production
        if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') {
            return false;
        }

        return appDefinition.ssm?.enable === true;
    }

    validate(appDefinition) {
        const result = new ValidationResult();

        if (!appDefinition.ssm) {
            result.addError('SSM configuration is missing');
            return result;
        }

        // Validate parameters if provided
        if (appDefinition.ssm.parameters) {
            if (typeof appDefinition.ssm.parameters !== 'object' || Array.isArray(appDefinition.ssm.parameters)) {
                result.addError('ssm.parameters must be an object (not an array)');
            }
        }

        for (const error of validateOffloadConfig(appDefinition).errors) {
            result.addError(error);
        }

        return result;
    }

    /**
     * Build SSM configuration
     */
    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring SSM Parameter Store...`);

        const result = {
            iamStatements: [],
            environment: {},
        };

        const ssmActions = [
            'ssm:GetParameter',
            'ssm:GetParameters',
            'ssm:GetParametersByPath',
        ];

        const offloadActive = isSsmOffloadActive(appDefinition);

        // Broad read grant, unless the app opts into prefix-only access while
        // offload is active.
        if (!(appDefinition.ssm.restrictIamToPrefix === true && offloadActive)) {
            result.iamStatements.push({
                Effect: 'Allow',
                Action: ssmActions,
                Resource: {
                    'Fn::Sub': 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/*',
                },
            });
            console.log('  ✅ SSM Parameter Store IAM permissions added');
        }

        if (offloadActive) {
            const prefix = getParameterPrefix(appDefinition);
            const offloadedKeys = getOffloadedKeys(appDefinition);

            result.environment.SSM_PARAMETER_PREFIX = prefix;
            result.environment.FRIGG_SSM_OFFLOADED_KEYS = offloadedKeys.join(',');

            // The INIT-phase preload (NODE_OPTIONS=--import) that populates
            // process.env before app modules load is set per-function on
            // skipEsbuild handlers only — see infrastructure-composer.js. It
            // cannot go here (provider.environment is global) because a missing
            // --import target fatally aborts Node startup, and esbuild-bundled
            // functions do not package the preload file.

            // Prefix-scoped read grant. Built as a plain serverless string (not
            // Fn::Sub) because the prefix contains serverless variables like
            // ${self:service} that Fn::Sub would reject as bad substitution keys.
            result.iamStatements.push({
                Effect: 'Allow',
                Action: ssmActions,
                Resource: `arn:aws:ssm:\${self:provider.region}:\${aws:accountId}:parameter${prefix}/*`,
            });
            console.log(
                `  ✅ SSM offload enabled for ${offloadedKeys.length} variable(s) under ${prefix}`
            );

            if (appDefinition.ssm.kmsKeyArn) {
                result.iamStatements.push({
                    Effect: 'Allow',
                    Action: ['kms:Decrypt'],
                    Resource: appDefinition.ssm.kmsKeyArn,
                });
                console.log('  ✅ KMS decrypt permission added for offloaded parameters');
            }
        }

        console.log(`[${this.name}] ✅ SSM configuration completed`);

        return result;
    }
}

module.exports = { SsmBuilder };

