const { createHandler } = require('@friggframework/core');
const { loadAppDefinition } = require('../app-definition-loader');
const { createQueueWorker } = require('../backend-utils');

let _handlers;

function ensureHandlers() {
    if (!_handlers) {
        _handlers = {};
        const { integrations: integrationClasses } = loadAppDefinition();

        integrationClasses.forEach((IntegrationClass) => {
            const defaultQueueWorker = createQueueWorker(IntegrationClass);

            _handlers[`${IntegrationClass.Definition.name}`] = {
                queueWorker: createHandler({
                    eventName: `Queue Worker for ${IntegrationClass.Definition.name}`,
                    isUserFacingResponse: false,
                    method: async (event, context) => {
                        const worker = new defaultQueueWorker();
                        await worker.run(event, context);
                        return {
                            message: 'Successfully processed the Generic Queue Worker',
                            input: event,
                        };
                    },
                }),
            };
        });
    }
    return _handlers;
}

module.exports = {
    get handlers() {
        return ensureHandlers();
    },
};
