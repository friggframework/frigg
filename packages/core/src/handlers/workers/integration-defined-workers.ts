import { createHandler } from '../../core/create-handler';
import { loadAppDefinition } from '../app-definition-loader';
import { createQueueWorker } from '../backend-utils';

interface HandlerEntry {
    queueWorker: (event: any, context: any) => Promise<any>;
}

const handlers: Record<string, HandlerEntry> = {};
const { integrations: integrationClasses } = loadAppDefinition();

integrationClasses.forEach((IntegrationClass) => {
    const DefaultQueueWorker = createQueueWorker(IntegrationClass);

    handlers[`${IntegrationClass.Definition.name}`] = {
        queueWorker: createHandler({
            eventName: `Queue Worker for ${IntegrationClass.Definition.name}`,
            isUserFacingResponse: false,
            method: async (event, context) => {
                const worker = new DefaultQueueWorker();
                await worker.run(event as any, context as any);
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        message: 'Successfully processed the Generic Queue Worker',
                        input: event,
                    }),
                };
            },
        }),
    };
});

export { handlers };

