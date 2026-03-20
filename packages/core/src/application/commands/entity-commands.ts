/* eslint-disable @typescript-eslint/no-require-imports */
import { ErrorResponse, mapErrorToResponse as _mapError } from './command-utils';
export type { ErrorResponse };
const {
    createModuleRepository,
} = require('../../modules/repositories/module-repository-factory');

export interface EntityRecord {
    id: string;
    userId: string;
    externalId: string;
    name?: string;
    moduleName: string;
    credentialId?: string;
}

export interface CreateEntityParams {
    userId: string;
    externalId: string;
    name?: string;
    moduleName: string;
    credentialId?: string;
}

export interface EntityFilter {
    externalId?: string;
    userId?: string;
    moduleName?: string;
}

export interface EntityCommands {
    createEntity(params?: CreateEntityParams): Promise<EntityRecord | ErrorResponse>;
    findEntity(filter?: EntityFilter): Promise<EntityRecord | null | ErrorResponse>;
    findEntitiesByUserId(userId: string): Promise<EntityRecord[] | ErrorResponse>;
    findEntitiesByUserIdAndModuleName(userId: string, moduleName: string): Promise<EntityRecord[] | ErrorResponse>;
    findEntityById(entityId: string): Promise<EntityRecord | ErrorResponse>;
    updateEntity(entityId: string, updates: Record<string, unknown>): Promise<EntityRecord | ErrorResponse>;
    deleteEntity(entityId: string): Promise<{ success: boolean } | ErrorResponse>;
    deleteEntityById(entityId: string): Promise<{ success: boolean } | ErrorResponse>;
    unsetCredential(entityId: string): Promise<{ success: boolean } | ErrorResponse>;
}

const ERROR_CODE_MAP: Record<string, number> = {
    ENTITY_NOT_FOUND: 404,
    INVALID_ENTITY_DATA: 400,
};

function mapErrorToResponse(error: Error & { code?: string }): ErrorResponse {
    return _mapError(ERROR_CODE_MAP, error);
}

function mapEntityRecord(entity: Record<string, unknown>): EntityRecord {
    const credential = entity.credential as Record<string, unknown> | string | undefined;
    return {
        id: entity.id as string,
        userId: entity.userId as string,
        externalId: entity.externalId as string,
        name: entity.name as string | undefined,
        moduleName: entity.moduleName as string,
        credentialId: credential && typeof credential === 'object' && credential._id
            ? (credential._id as { toString(): string }).toString()
            : credential as string | undefined,
    };
}

export function createEntityCommands(): EntityCommands {
    const moduleRepo = createModuleRepository();

    return {
        async createEntity({
            userId,
            externalId,
            name,
            moduleName,
            credentialId,
        }: CreateEntityParams = {} as CreateEntityParams) {
            try {
                if (!userId || !externalId || !moduleName) {
                    const error = new Error(
                        'userId, externalId, and moduleName are required'
                    ) as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entityData: Record<string, unknown> = {
                    user: userId,
                    externalId,
                    name,
                    moduleName,
                };

                if (credentialId) {
                    entityData.credential = credentialId;
                }

                const entity = await moduleRepo.createEntity(entityData);

                return mapEntityRecord(entity);
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findEntity(filter: EntityFilter = {}) {
            try {
                if (
                    !filter.externalId &&
                    !filter.userId &&
                    !filter.moduleName
                ) {
                    const error = new Error(
                        'At least one filter criterion is required'
                    ) as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entity = await moduleRepo.findEntity(filter);

                if (!entity) {
                    return null;
                }

                return mapEntityRecord(entity);
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findEntitiesByUserId(userId: string) {
            try {
                if (!userId) {
                    const error = new Error('userId is required') as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entities = await moduleRepo.findEntitiesByUserId(userId);

                return (entities as Record<string, unknown>[]).map(mapEntityRecord);
            } catch (error: unknown) {
                const err = error as Error & { code?: string };
                if (err.code) {
                    return mapErrorToResponse(err);
                }
                return [];
            }
        },

        async findEntitiesByUserIdAndModuleName(userId: string, moduleName: string) {
            try {
                if (!userId || !moduleName) {
                    const error = new Error(
                        'userId and moduleName are required'
                    ) as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entities =
                    await moduleRepo.findEntitiesByUserIdAndModuleName(
                        userId,
                        moduleName
                    );

                return (entities as Record<string, unknown>[]).map(mapEntityRecord);
            } catch (error: unknown) {
                const err = error as Error & { code?: string };
                if (err.code) {
                    return mapErrorToResponse(err);
                }
                return [];
            }
        },

        async findEntityById(entityId: string) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required') as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entity = await moduleRepo.findEntityById(entityId);

                return mapEntityRecord(entity);
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async updateEntity(entityId: string, updates: Record<string, unknown>) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required') as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entity = await moduleRepo.updateEntity(entityId, updates);

                if (!entity) {
                    const error = new Error(`Entity ${entityId} not found`) as Error & { code?: string };
                    error.code = 'ENTITY_NOT_FOUND';
                    throw error;
                }

                return mapEntityRecord(entity);
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteEntity(entityId: string) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required') as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                await moduleRepo.deleteEntity(entityId);

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteEntityById(entityId: string) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required') as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                await moduleRepo.deleteEntity(entityId);

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async unsetCredential(entityId: string) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required') as Error & { code?: string };
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const acknowledged = await moduleRepo.unsetCredential(entityId);

                return { success: acknowledged };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },
    };
}

export { ERROR_CODE_MAP };
