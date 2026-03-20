/* eslint-disable @typescript-eslint/no-require-imports */
import type { Request, Response } from 'express';
import { get } from '../assertions';
import { CreateIntegration } from './use-cases/create-integration';
import { DeleteIntegrationForUser } from './use-cases/delete-integration-for-user';
import { GetIntegrationsForUser } from './use-cases/get-integrations-for-user';
import { GetIntegrationInstance } from './use-cases/get-integration-instance';
import { UpdateIntegration } from './use-cases/update-integration';
import { GetPossibleIntegrations } from './use-cases/get-possible-integrations';
import { getModulesDefinitionFromIntegrationClasses } from './utils/map-integration-dto';
import { createIntegrationRepository } from './repositories/integration-repository-factory';

const express = require('express');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');

// Unconverted JS dependencies
const { createCredentialRepository } = require('../credential/repositories/credential-repository-factory');
const { GetCredentialForUser } = require('../credential/use-cases/get-credential-for-user');
const { ModuleFactory } = require('../modules/module-factory');
const { createModuleRepository } = require('../modules/repositories/module-repository-factory');
const { GetEntitiesForUser } = require('../modules/use-cases/get-entities-for-user');
const { loadAppDefinition } = require('../handlers/app-definition-loader');
const { GetModuleInstanceFromType } = require('../modules/use-cases/get-module-instance-from-type');
const { GetEntityOptionsByType } = require('../modules/use-cases/get-entity-options-by-type');
const { TestModuleAuth } = require('../modules/use-cases/test-module-auth');
const { GetModule } = require('../modules/use-cases/get-module');
const { GetEntityOptionsById } = require('../modules/use-cases/get-entity-options-by-id');
const { RefreshEntityOptions } = require('../modules/use-cases/refresh-entity-options');
const { createUserRepository } = require('../user/repositories/user-repository-factory');
const { GetUserFromBearerToken } = require('../user/use-cases/get-user-from-bearer-token');
const { GetUserFromXFriggHeaders } = require('../user/use-cases/get-user-from-x-frigg-headers');
const { GetUserFromAdopterJwt } = require('../user/use-cases/get-user-from-adopter-jwt');
const { AuthenticateWithSharedSecret } = require('../user/use-cases/authenticate-with-shared-secret');
const { AuthenticateUser } = require('../user/use-cases/authenticate-user');
const { ProcessAuthorizationCallback } = require('../modules/use-cases/process-authorization-callback');

interface User {
    getId(): string;
    [key: string]: unknown;
}

interface AuthenticateUserUseCase {
    execute(req: Request): Promise<User>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface UseCase { execute(...args: any[]): Promise<any> }

interface IntegrationUseCases {
    createIntegration: UseCase;
    deleteIntegrationForUser: UseCase;
    getIntegrationsForUser: UseCase;
    getEntitiesForUser: UseCase;
    getIntegrationInstance: UseCase;
    updateIntegration: UseCase;
    getPossibleIntegrations: UseCase;
}

interface EntityUseCases {
    getCredentialForUser: UseCase;
    getModuleInstanceFromType: UseCase;
    getEntityOptionsByType: UseCase;
    testModuleAuth: UseCase;
    getModule: UseCase;
    getEntityOptionsById: UseCase;
    refreshEntityOptions: UseCase;
    processAuthorizationCallback: UseCase;
}

export function createIntegrationRouter(): unknown {
    const { integrations: integrationClasses, userConfig } = loadAppDefinition();
    const moduleRepository = createModuleRepository();
    const integrationRepository = createIntegrationRepository();
    const credentialRepository = createCredentialRepository();
    const userRepository = createUserRepository();

    const getUserFromBearerToken = new GetUserFromBearerToken({
        userRepository,
        userConfig,
    });

    const getUserFromXFriggHeaders = new GetUserFromXFriggHeaders({
        userRepository,
        userConfig,
    });

    const getUserFromAdopterJwt = new GetUserFromAdopterJwt({
        userRepository,
        userConfig,
    });

    const authenticateWithSharedSecret = new AuthenticateWithSharedSecret();

    const authenticateUser = new AuthenticateUser({
        getUserFromBearerToken,
        getUserFromXFriggHeaders,
        getUserFromAdopterJwt,
        authenticateWithSharedSecret,
        userConfig,
    });

    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const deleteIntegrationForUser = new DeleteIntegrationForUser({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const getIntegrationsForUser = new GetIntegrationsForUser({
        integrationRepository,
        integrationClasses,
        moduleFactory,
        moduleRepository,
    });

    const getCredentialForUser = new GetCredentialForUser({
        credentialRepository,
    });

    const createIntegration = new CreateIntegration({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const getEntitiesForUser = new GetEntitiesForUser({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getIntegrationInstance = new GetIntegrationInstance({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const updateIntegration = new UpdateIntegration({
        integrationRepository,
        integrationClasses,
        moduleFactory,
    });

    const getModuleInstanceFromType = new GetModuleInstanceFromType({
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getEntityOptionsByType = new GetEntityOptionsByType({
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const testModuleAuth = new TestModuleAuth({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getModule = new GetModule({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getEntityOptionsById = new GetEntityOptionsById({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const refreshEntityOptions = new RefreshEntityOptions({
        moduleRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const getPossibleIntegrations = new GetPossibleIntegrations({
        integrationClasses,
    });

    const processAuthorizationCallback = new ProcessAuthorizationCallback({
        moduleRepository,
        credentialRepository,
        moduleDefinitions: getModulesDefinitionFromIntegrationClasses(integrationClasses),
    });

    const router = express();

    setIntegrationRoutes(router, authenticateUser, {
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    });
    setEntityRoutes(router, authenticateUser, {
        getCredentialForUser,
        getModuleInstanceFromType,
        getEntityOptionsByType,
        testModuleAuth,
        getModule,
        getEntityOptionsById,
        refreshEntityOptions,
        processAuthorizationCallback,
    });
    return router;
}

export function checkRequiredParams(
    params: Record<string, unknown>,
    requiredKeys: string[]
): Record<string, unknown> {
    const missingKeys: string[] = [];
    const returnDict: Record<string, unknown> = {};
    for (const key of requiredKeys) {
        const val = get(params, key, null);
        if (val) {
            returnDict[key] = val;
        } else {
            missingKeys.push(key);
        }
    }

    if (missingKeys.length > 0) {
        throw Boom.badRequest(
            `Missing Parameter${
                missingKeys.length === 1 ? '' : 's'
            }: ${missingKeys.join(', ')} ${
                missingKeys.length === 1 ? 'is' : 'are'
            } required.`
        );
    }
    return returnDict;
}

function setIntegrationRoutes(
    router: unknown,
    authenticateUser: AuthenticateUserUseCase,
    useCases: IntegrationUseCases
): void {
    const {
        createIntegration,
        deleteIntegrationForUser,
        getIntegrationsForUser,
        getEntitiesForUser,
        getIntegrationInstance,
        updateIntegration,
        getPossibleIntegrations,
    } = useCases;

    const app = router as {
        route(path: string): {
            get(handler: unknown): unknown;
            post(handler: unknown): unknown;
            patch(handler: unknown): unknown;
            delete(handler: unknown): unknown;
            all(handler: unknown): unknown;
        };
    };

    app.route('/api/integrations').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const integrations = await getIntegrationsForUser.execute(userId);
            const results = {
                entities: {
                    options: await getPossibleIntegrations.execute(),
                    authorized: await getEntitiesForUser.execute(userId),
                },
                integrations: integrations,
            };

            res.json(results);
        })
    );

    app.route('/api/integrations').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, ['entities', 'config']);

            get(params.config as Record<string, unknown>, 'type');

            const integration = await createIntegration.execute(
                params.entities,
                userId,
                params.config
            );

            res.status(201).json(integration);
        })
    );

    app.route('/api/integrations/:integrationId').patch(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, ['config']);

            const integration = await updateIntegration.execute(
                req.params.integrationId,
                userId,
                params.config
            );
            res.json(integration);
        })
    );

    app.route('/api/integrations/:integrationId').delete(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['integrationId']);
            await deleteIntegrationForUser.execute(
                params.integrationId,
                user.getId()
            );
            res.status(204).json({});
        })
    );

    app.route('/api/integrations/:integrationId/config/options').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { send: (event: string, data?: unknown) => Promise<unknown> };
            res.json(await integration.send('GET_CONFIG_OPTIONS'));
        })
    );

    app.route('/api/integrations/:integrationId/config/options/refresh').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { send: (event: string, data?: unknown) => Promise<unknown> };

            res.json(await integration.send('REFRESH_CONFIG_OPTIONS', req.body));
        })
    );

    app.route('/api/integrations/:integrationId/actions').all(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { send: (event: string, data?: unknown) => Promise<unknown> };
            res.json(await integration.send('GET_USER_ACTIONS', req.body));
        })
    );

    app.route('/api/integrations/:integrationId/actions/:actionId/options').all(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, [
                'integrationId',
                'actionId',
            ]);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { send: (event: string, data?: unknown) => Promise<unknown> };

            res.json(
                await integration.send('GET_USER_ACTION_OPTIONS', {
                    actionId: params.actionId,
                    data: req.body,
                })
            );
        })
    );

    app.route('/api/integrations/:integrationId/actions/:actionId/options/refresh').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, [
                'integrationId',
                'actionId',
            ]);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { send: (event: string, data?: unknown) => Promise<unknown> };

            res.json(
                await integration.send('REFRESH_USER_ACTION_OPTIONS', {
                    actionId: params.actionId,
                    data: req.body,
                })
            );
        })
    );

    app.route('/api/integrations/:integrationId/actions/:actionId').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, [
                'integrationId',
                'actionId',
            ]);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { send: (event: string, data?: unknown) => Promise<unknown> };
            res.json(await integration.send(params.actionId as string, req.body));
        })
    );

    app.route('/api/integrations/:integrationId').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);

            if (!user) {
                throw Boom.forbidden('User not found');
            }

            const params = checkRequiredParams(req.params as Record<string, unknown>, ['integrationId']);
            const integration = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { id: string; entities: unknown; status: string; config: unknown };

            res.json({
                id: integration.id,
                entities: integration.entities,
                status: integration.status,
                config: integration.config,
            });
        })
    );

    app.route('/api/integrations/:integrationId/test-auth').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['integrationId']);
            const instance = await getIntegrationInstance.execute(
                params.integrationId,
                user.getId()
            ) as { testAuth: () => Promise<void>; record: { messages?: { errors?: Array<{ timestamp: number }> } } } | null;

            if (!instance) {
                throw Boom.notFound();
            }

            const start = Date.now();
            await instance.testAuth();
            const errors = instance.record.messages?.errors?.filter(
                ({ timestamp }: { timestamp: number }) => timestamp >= start
            );

            if (errors?.length) {
                res.status(400);
                res.json({ errors });
            } else {
                res.json({ status: 'ok' });
            }
        })
    );
}

function setEntityRoutes(
    router: unknown,
    authenticateUser: AuthenticateUserUseCase,
    useCases: EntityUseCases
): void {
    const {
        getCredentialForUser,
        getModuleInstanceFromType,
        getEntityOptionsByType,
        testModuleAuth,
        getModule,
        getEntityOptionsById,
        refreshEntityOptions,
        processAuthorizationCallback,
    } = useCases;

    const app = router as {
        route(path: string): {
            get(handler: unknown): unknown;
            post(handler: unknown): unknown;
        };
    };

    app.route('/api/authorize').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.query as Record<string, unknown>, ['entityType']);
            const module = await getModuleInstanceFromType.execute(
                userId,
                params.entityType
            ) as { validateAuthorizationRequirements: () => boolean; getAuthorizationRequirements: () => unknown };
            const areRequirementsValid = module.validateAuthorizationRequirements();
            if (!areRequirementsValid) {
                throw new Error(
                    `Error: Entity of type ${params.entityType} requires a valid url`
                );
            }

            res.json(module.getAuthorizationRequirements());
        })
    );

    app.route('/api/authorize').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, ['entityType', 'data']);

            const entityDetails = await processAuthorizationCallback.execute(
                userId,
                params.entityType,
                params.data
            );

            res.json(entityDetails);
        })
    );

    app.route('/api/entity').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const params = checkRequiredParams(req.body, ['entityType', 'data']);
            checkRequiredParams(req.body.data, ['credential_id']);

            const credential = await getCredentialForUser.execute(
                (params.data as Record<string, unknown>).credential_id,
                userId
            );

            if (!credential) {
                throw Boom.badRequest('Invalid credential ID');
            }

            const module = await getModuleInstanceFromType.execute(
                userId,
                params.entityType
            ) as { api: unknown; getEntityDetails: (...args: unknown[]) => Promise<unknown>; findOrCreateEntity: (details: unknown) => Promise<unknown> };
            const entityDetails = await module.getEntityDetails(
                module.api,
                null,
                null,
                userId
            );

            res.json(await module.findOrCreateEntity(entityDetails));
        })
    );

    app.route('/api/entity/options/:credentialId').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const userId = user.getId();
            const credential = await getCredentialForUser.execute(
                req.params.credentialId,
                userId
            ) as { userId: { toString: () => string } };
            if (credential.userId.toString() !== userId) {
                throw Boom.forbidden('Credential does not belong to user');
            }

            const params = checkRequiredParams(req.query as Record<string, unknown>, ['entityType']);
            const entityOptions = await getEntityOptionsByType.execute(
                userId,
                params.entityType
            );

            res.json(entityOptions);
        })
    );

    app.route('/api/entities/:entityId/test-auth').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['entityId']);
            const testAuthResponse = await testModuleAuth.execute(
                params.entityId,
                user
            );

            if (testAuthResponse) {
                res.json({ status: 'ok' });
            } else {
                res.status(400);
                res.json({
                    errors: [
                        {
                            title: 'Authentication Error',
                            message: 'There was an error with your Entity. Please reconnect/re-authenticate, or reach out to Support for assistance.',
                            timestamp: Date.now(),
                        },
                    ],
                });
            }
        })
    );

    app.route('/api/entities/:entityId').get(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['entityId']);
            const module = await getModule.execute(params.entityId, user);

            res.json(module);
        })
    );

    app.route('/api/entities/:entityId/options').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['entityId']);

            const entityOptions = await getEntityOptionsById.execute(
                params.entityId,
                user
            );

            res.json(entityOptions);
        })
    );

    app.route('/api/entities/:entityId/options/refresh').post(
        catchAsyncError(async (req: Request, res: Response) => {
            const user = await authenticateUser.execute(req);
            const params = checkRequiredParams(req.params as Record<string, unknown>, ['entityId']);
            const updatedOptions = await refreshEntityOptions.execute(
                params.entityId,
                user,
                req.body
            );

            res.json(updatedOptions);
        })
    );
}
