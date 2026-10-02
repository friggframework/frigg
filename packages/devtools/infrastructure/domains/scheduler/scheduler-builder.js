/**
 * Scheduler Builder
 *
 * Domain Layer - Hexagonal Architecture
 *
 * Responsible for:
 * - Creating EventBridge Scheduler ScheduleGroup resource
 * - Creating IAM Role for EventBridge Scheduler to send messages to SQS
 * - Adding necessary IAM statements for Lambda to create/delete schedules
 *
 * This builder enables integrations to schedule one-time jobs (e.g., webhook renewals)
 * using AWS EventBridge Scheduler.
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');
const {
    isScopedEnvironmentActive,
    getIntegrationFunctionNames,
    getAdminFunctionNames,
} = require('../shared/function-environments');

class SchedulerBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'SchedulerBuilder';
    }

    shouldExecute(appDefinition) {
        // Enable scheduler if explicitly enabled or if any integration has webhooks
        // (webhooks often need renewal scheduling)
        if (appDefinition.scheduler?.enable === true) {
            return true;
        }

        // Check if any integration has webhooks enabled
        if (Array.isArray(appDefinition.integrations)) {
            return appDefinition.integrations.some(
                (integration) =>
                    integration?.Definition?.webhooks?.enabled === true ||
                    integration?.Definition?.webhooks === true
            );
        }

        return false;
    }

    getDependencies() {
        return ['IntegrationBuilder']; // Needs integration queues to exist
    }

    validate(appDefinition) {
        const result = new ValidationResult();
        // No validation required - scheduler is optional
        return result;
    }

    async build(appDefinition, discoveredResources) {
        console.log(`\n[${this.name}] Configuring EventBridge Scheduler...`);

        const result = {
            functions: {},
            resources: {},
            environment: {},
            custom: {},
            iamStatements: [],
        };

        // Create ScheduleGroup resource
        this.createScheduleGroup(result);

        // Create IAM Role for EventBridge Scheduler
        this.createSchedulerExecutionRole(appDefinition, result);

        // Add IAM statements for Lambda to manage schedules
        this.addSchedulerIamStatements(result);

        // Add environment variables
        this.addEnvironmentVariables(result, appDefinition);

        console.log(`[${this.name}] ✅ Scheduler configuration completed`);
        return result;
    }

    /**
     * Create EventBridge Scheduler ScheduleGroup
     * Uses stage-specific naming to allow multiple deployments in same AWS account
     */
    createScheduleGroup(result) {
        const scheduleGroupName = '${self:service}-${self:provider.stage}-schedules';

        result.resources.FriggScheduleGroup = {
            Type: 'AWS::Scheduler::ScheduleGroup',
            Properties: {
                Name: scheduleGroupName,
            },
        };

        console.log(`  ✓ Created ScheduleGroup: ${scheduleGroupName}`);
    }

    /**
     * Create IAM Role for EventBridge Scheduler to send messages to SQS
     */
    createSchedulerExecutionRole(appDefinition, result) {
        // Collect all integration queue ARNs
        const queueArns = [];
        if (Array.isArray(appDefinition.integrations)) {
            appDefinition.integrations.forEach((integration) => {
                const integrationName = integration?.Definition?.name;
                if (integrationName) {
                    const capitalizedName =
                        integrationName.charAt(0).toUpperCase() +
                        integrationName.slice(1);
                    queueArns.push({
                        'Fn::GetAtt': [`${capitalizedName}Queue`, 'Arn'],
                    });
                }
            });
        }

        // If no queues found, use a placeholder (shouldn't happen if IntegrationBuilder ran)
        if (queueArns.length === 0) {
            console.warn(
                '  ⚠ No integration queues found for scheduler role'
            );
            queueArns.push('arn:aws:sqs:*:*:*'); // Fallback
        }

        result.resources.SchedulerExecutionRole = {
            Type: 'AWS::IAM::Role',
            Properties: {
                RoleName:
                    '${self:service}-${self:provider.stage}-scheduler-role',
                AssumeRolePolicyDocument: {
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: {
                                Service: 'scheduler.amazonaws.com',
                            },
                            Action: 'sts:AssumeRole',
                        },
                    ],
                },
                Policies: [
                    {
                        PolicyName: 'SchedulerSQSPolicy',
                        PolicyDocument: {
                            Version: '2012-10-17',
                            Statement: [
                                {
                                    Effect: 'Allow',
                                    Action: ['sqs:SendMessage'],
                                    Resource: queueArns,
                                },
                            ],
                        },
                    },
                ],
            },
        };

        console.log('  ✓ Created SchedulerExecutionRole');
    }

    /**
     * Add IAM statements for Lambda functions to manage schedules
     */
    addSchedulerIamStatements(result) {
        result.iamStatements.push(
            {
                Effect: 'Allow',
                Action: [
                    'scheduler:CreateSchedule',
                    'scheduler:DeleteSchedule',
                    'scheduler:GetSchedule',
                ],
                Resource: {
                    'Fn::Sub': [
                        'arn:aws:scheduler:${AWS::Region}:${AWS::AccountId}:schedule/${GroupName}/*',
                        { GroupName: { Ref: 'FriggScheduleGroup' } },
                    ],
                },
            },
            {
                Effect: 'Allow',
                Action: ['iam:PassRole'],
                Resource: { 'Fn::GetAtt': ['SchedulerExecutionRole', 'Arn'] },
                Condition: {
                    StringEquals: {
                        'iam:PassedToService': 'scheduler.amazonaws.com',
                    },
                },
            }
        );

        console.log('  ✓ Added scheduler IAM statements');
    }

    /**
     * Add environment variables for scheduler configuration
     */
    addEnvironmentVariables(result, appDefinition = {}) {
        const environment = {
            SCHEDULER_ROLE_ARN: {
                'Fn::GetAtt': ['SchedulerExecutionRole', 'Arn'],
            },
            SCHEDULE_GROUP_NAME: {
                Ref: 'FriggScheduleGroup',
            },
        };

        if (!isScopedEnvironmentActive(appDefinition)) {
            Object.assign(result.environment, environment);
            console.log('  ✓ Added scheduler environment variables');
            return;
        }

        // Consumers: auth (runs integration actions), the executor (runs
        // admin scripts that instantiate integrations), and every
        // integration function. NOT adminScriptRouter — it carries its own
        // admin-scheduler role, set directly by the admin-script builder.
        const targets = [
            'auth',
            ...getAdminFunctionNames(appDefinition).filter(
                (fnName) => fnName !== 'adminScriptRouter'
            ),
            ...(appDefinition.integrations || []).flatMap(
                getIntegrationFunctionNames
            ),
        ];

        result.functionEnvironments = result.functionEnvironments || {};
        for (const fnName of targets) {
            result.functionEnvironments[fnName] = {
                ...result.functionEnvironments[fnName],
                ...environment,
            };
        }
        console.log(
            `  ✓ Scoped scheduler environment variables to: ${targets.join(', ')}`
        );
    }
}

module.exports = { SchedulerBuilder };
