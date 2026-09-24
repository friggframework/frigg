const { createHandler } = require('@friggframework/core');
const { loadAppDefinition } = require('../app-definition-loader');
const { createQueueWorker } = require('../backend-utils');
// TODO(Phase 2): mount extension-declared workers in addition to the per-integration
// default queue worker. Today, getExtensionWorkers(IntegrationClass) returns the
// declared workers but they are not yet bound to dedicated SQS sources. Extension-
// contributed *events* still flow through the default queue worker below because
// _mergeExtensions() registers them in instance.events, so end-to-end webhook
// delivery for Tier 3 extensions works without this Phase 2 work.
// const { getExtensionWorkers } = require('../../integrations/extension');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

integrationClasses.forEach((IntegrationClass) => {
    const defaultQueueWorker = createQueueWorker(IntegrationClass);

    handlers[`${IntegrationClass.Definition.name}`] = {
        queueWorker: createHandler({
            eventName: `Queue Worker for ${IntegrationClass.Definition.name}`,
            isUserFacingResponse: false,
            method: async (event, context) => {
                const worker = new defaultQueueWorker();
                return await worker.run(event, context);
            },
        }),
    };
});

module.exports = { handlers };
