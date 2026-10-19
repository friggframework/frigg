/**
 * Trigger Builder (ADR-055 §2)
 *
 * Domain Layer - Hexagonal Architecture
 *
 * One function per integration that declares recurring triggers: `{integration}Triggers`, with the Prisma layer.
 * It gets one serverless `schedule` event per distinct tick of the integration's `every` / `cron` triggers (and of
 * the triggers it resolves per installation, `Definition.instanceTriggers`), plus one EventBridge Scheduler event per
 * `at` trigger, with its time zone. Each tick pages through the ENABLED installations and queues the runs that are
 * due (core: integrations/use-cases/run-trigger-tick.js). Nothing is created per installation, and these resources
 * change only when a Definition does, so they live in CloudFormation and leave with the stack.
 *
 * IAM, and why this builder adds none:
 * - A `rate()` tick is an EventBridge rule; the framework adds the Lambda permission for it.
 * - An `at` trigger uses `method: scheduler`; the framework adds `scheduler.amazonaws.com` to the function role's
 *   trust policy and `lambda:InvokeFunction` on this function to it.
 * - The tick reads the integration table (the Prisma layer and the provider's database access, like the queue
 *   worker) and sends to its own `<Name>Queue`, which the provider-level `sqs:SendMessage(Batch)` statement on
 *   `${service}--${stage}-*Queue` already allows. It never calls EventBridge Scheduler at runtime, so it needs none
 *   of SchedulerBuilder's scheduler:* permissions (those stay for one-time jobs).
 */

const { InfrastructureBuilder, ValidationResult } = require('../shared/base-builder');
const { IntegrationBuilder } = require('../integration/integration-builder');
const {
    hasTriggers,
    provisioningOf,
    durationOf,
} = require('@friggframework/core/integrations/triggers');

/** EventBridge rate() for a tick in minutes: rate(1 minute), rate(5 minutes), rate(1 hour), rate(2 hours), rate(1 day). */
function rateExpression(minutes) {
    const [count, unit] =
        minutes % 1440 === 0 ? [minutes / 1440, 'day'] : minutes % 60 === 0 ? [minutes / 60, 'hour'] : [minutes, 'minute'];
    return `rate(${count} ${unit}${count === 1 ? '' : 's'})`;
}

/** The function name the trigger tick for an integration runs as. Wire contract with function-environments.js. */
function triggerFunctionName(integrationName) {
    return `${integrationName}Triggers`;
}

class TriggerBuilder extends InfrastructureBuilder {
    constructor() {
        super();
        this.name = 'TriggerBuilder';
    }

    shouldExecute(appDefinition) {
        return Array.isArray(appDefinition.integrations) && appDefinition.integrations.some((i) => hasTriggers(i));
    }

    getDependencies() {
        return ['IntegrationBuilder']; // the tick sends to the integration queue
    }

    validate(appDefinition) {
        const result = new ValidationResult();
        for (const integration of appDefinition.integrations || []) {
            if (!hasTriggers(integration)) continue;
            try {
                provisioningOf(integration);
            } catch (error) {
                result.addError(error.message);
            }
        }
        return result;
    }

    async build(appDefinition) {
        console.log(`\n[${this.name}] Configuring recurring triggers...`);
        const result = { functions: {}, resources: {}, environment: {}, custom: {}, iamStatements: [] };
        const usePrismaLayer = appDefinition.usePrismaLambdaLayer !== false;
        const functionPackageConfig = new IntegrationBuilder().createFunctionPackageConfig(usePrismaLayer, appDefinition);

        for (const integration of appDefinition.integrations || []) {
            if (!hasTriggers(integration)) continue;
            const name = integration.Definition.name;
            const { ticks, at } = provisioningOf(integration);
            const events = [
                ...ticks.map((minutes) => ({
                    schedule: {
                        rate: [rateExpression(minutes)],
                        // The rule's own firing time goes in, so a repeated delivery falls in the same tick slot.
                        inputTransformer: {
                            inputPathsMap: { time: '$.time' },
                            inputTemplate: `{"tick":"${durationOf(minutes)}","time":<time>}`,
                        },
                    },
                })),
                ...at.map((t) => ({
                    schedule: {
                        method: 'scheduler',
                        rate: [t.at],
                        ...(t.timezone ? { timezone: t.timezone } : {}),
                        input: { at: t.name, time: '<aws.scheduler.scheduled-time>' },
                    },
                })),
            ];
            result.functions[triggerFunctionName(name)] = {
                handler: `node_modules/@friggframework/core/handlers/workers/integration-triggers.handlers.${name}.tick`,
                skipEsbuild: true, // Nested exports in node_modules - skip esbuild bundling
                package: functionPackageConfig,
                ...(usePrismaLayer && { layers: [{ Ref: 'PrismaLambdaLayer' }] }), // reads the integration table
                timeout: 300, // a tick past its deadline hands its page cursor to the queue
                events,
            };
            console.log(`  ✓ ${triggerFunctionName(name)}: ticks ${ticks.map(durationOf).join(', ') || 'none'}; at ${at.map((t) => t.name).join(', ') || 'none'}`);
        }
        return result;
    }
}

module.exports = { TriggerBuilder, rateExpression, triggerFunctionName };
