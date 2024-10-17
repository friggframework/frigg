const { createHandler } = require('@friggframework/core');
const { integrationFactory, createQueueWorker } = require('./../backend-utils');

const handlers = {};
integrationFactory.integrationClasses.forEach((IntegrationClass) => {
    const defaultQueueWorker = createQueueWorker(IntegrationClass);

    handlers[`${IntegrationClass.Definition.name}`] = {
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

module.exports = { handlers };
