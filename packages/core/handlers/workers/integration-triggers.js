/**
 * The `{integration}Triggers` functions (ADR-055 §2-3): one per integration that declares triggers. Devtools gives
 * each one schedule per distinct tick (`{ tick: '5m', time }`) and one per `at` trigger (`{ at, time }`); this only
 * hands the event to the tick use case.
 */
const { createHandler } = require('@friggframework/core');
const { loadAppDefinition } = require('../app-definition-loader');
const { hasTriggers } = require('../../integrations/triggers');
const { runTriggerTick } = require('../../integrations/use-cases/run-trigger-tick');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

for (const IntegrationClass of integrationClasses) {
    if (!hasTriggers(IntegrationClass)) continue;
    handlers[IntegrationClass.Definition.name] = {
        tick: createHandler({
            eventName: `Trigger tick for ${IntegrationClass.Definition.name}`,
            isUserFacingResponse: false,
            method: async (event, context) => runTriggerTick(IntegrationClass, event || {}, context),
        }),
    };
}

module.exports = { handlers };
