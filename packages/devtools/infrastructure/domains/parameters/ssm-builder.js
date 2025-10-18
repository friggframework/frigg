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
            if (typeof appDefinition.ssm.parameters !== 'object') {
                result.addError('ssm.parameters must be an object');
            }
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

        // Add IAM permissions for SSM Parameter Store
        result.iamStatements.push({
            Effect: 'Allow',
            Action: [
                'ssm:GetParameter',
                'ssm:GetParameters',
                'ssm:GetParametersByPath',
            ],
            Resource: {
                'Fn::Sub': 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/*',
            },
        });

        console.log('  ✅ SSM Parameter Store IAM permissions added');
        console.log(`[${this.name}] ✅ SSM configuration completed`);

        return result;
    }
}

module.exports = { SsmBuilder };

