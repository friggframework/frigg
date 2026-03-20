import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Worker } from '../core/Worker';
import { IntegrationEventDispatcher } from './integration-event-dispatcher';
import type { IntegrationClass } from './app-definition-loader';

export interface RouteDefinition {
    path: string;
    method: string;
    event: string;
}

export const loadRouterFromObject = (
    IntegrationClass: IntegrationClass,
    routerObject: RouteDefinition
): Router => {
    const router = Router();
    const { path, method, event } = routerObject;

    console.log(
        `Registering ${method} ${path} for ${IntegrationClass.Definition.name}`
    );

    (router as any)[method.toLowerCase()](path, async (req: Request, res: Response, next: NextFunction) => {
        try {
            const integrationInstance = new IntegrationClass();
            const dispatcher = new IntegrationEventDispatcher(
                integrationInstance
            );
            const result = await dispatcher.dispatchHttp({
                event,
                req,
                res,
                next,
            });
            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    return router;
};

const initializeRepositories = (): {
    processRepository: any;
    integrationRepository: any;
    moduleRepository: any;
} => {
    // These are lazy-loaded to avoid circular deps in the TS source.
    // At runtime the JS shim files in the repo root still resolve correctly.
    const { createProcessRepository } = require('../integrations/repositories/process-repository-factory');
    const { createIntegrationRepository } = require('../integrations/repositories/integration-repository-factory');
    const { createModuleRepository } = require('../modules/repositories/module-repository-factory');

    const processRepository = createProcessRepository();
    const integrationRepository = createIntegrationRepository();
    const moduleRepository = createModuleRepository();

    return { processRepository, integrationRepository, moduleRepository };
};

const createModuleFactoryWithDefinitions = (
    moduleRepository: any,
    integrationClasses: IntegrationClass[]
): any => {
    const { getModulesDefinitionFromIntegrationClasses } = require('../integrations/utils/map-integration-dto');
    const { ModuleFactory } = require('../modules/module-factory');

    const moduleDefinitions =
        getModulesDefinitionFromIntegrationClasses(integrationClasses);

    return new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });
};

const loadIntegrationForWebhook = async (integrationId: string): Promise<any> => {
    const { loadAppDefinition } = require('./app-definition-loader');
    const { integrations: integrationClasses } = loadAppDefinition();
    const { GetIntegrationInstance } = require('../integrations/use-cases/get-integration-instance');

    const { integrationRepository, moduleRepository } =
        initializeRepositories();

    const moduleFactory = createModuleFactoryWithDefinitions(
        moduleRepository,
        integrationClasses
    );

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const integrationRecord = await integrationRepository.findIntegrationById(
        integrationId
    );

    const instance = await getIntegrationInstance.execute(
        integrationId,
        integrationRecord.userId
    );

    return instance;
};



const loadIntegrationForProcess = async (
    processId: string,
    integrationClass: IntegrationClass
): Promise<any> => {
    const { GetIntegrationInstance } = require('../integrations/use-cases/get-integration-instance');

    const { processRepository, integrationRepository, moduleRepository } =
        initializeRepositories();

    const moduleFactory = createModuleFactoryWithDefinitions(moduleRepository, [
        integrationClass,
    ]);

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses: [integrationClass],
        moduleFactory,
    });

    if (!processId) {
        throw new Error('processId is required in queue message data');
    }

    const process = await processRepository.findById(processId);

    if (!process) {
        throw new Error(`Process not found: ${processId}`);
    }

    const instance = await getIntegrationInstance.execute(
        process.integrationId,
        process.userId
    );

    return instance;
};

export const createQueueWorker = (integrationClass: IntegrationClass): typeof Worker => {
    class QueueWorker extends Worker {
        async _run(params: Record<string, unknown>, context: Record<string, unknown>): Promise<void> {
            try {
                let integrationInstance: any;
                const data = params.data as Record<string, unknown> | undefined;

                if (data?.processId) {
                    integrationInstance = await loadIntegrationForProcess(
                        data.processId as string,
                        integrationClass
                    );
                } else if (data?.integrationId) {
                    integrationInstance = await loadIntegrationForWebhook(
                        data.integrationId as string
                    );
                } else {
                    integrationInstance = new integrationClass();
                }

                const dispatcher = new IntegrationEventDispatcher(
                    integrationInstance
                );

                await dispatcher.dispatchJob({
                    event: params.event as string,
                    data: params.data,
                    context: context,
                });
            } catch (error) {
                console.error(
                    `Error in ${params.event} for ${integrationClass.Definition.name}:`,
                    error
                );
                throw error;
            }
        }
    }
    return QueueWorker;
};