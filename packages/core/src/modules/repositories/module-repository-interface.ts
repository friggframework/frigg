import type { Entity } from '../module';

export interface EntityFilter {
    _id?: string;
    id?: string;
    user?: string;
    userId?: string;
    credential?: string;
    credentialId?: string;
    name?: string;
    moduleName?: string;
    externalId?: string;
    [key: string]: unknown;
}

export interface EntityData {
    user?: string;
    userId?: string;
    credential?: string;
    credentialId?: string;
    name?: string;
    moduleName?: string;
    externalId?: string;
    [key: string]: unknown;
}

export abstract class ModuleRepositoryInterface {
    async findEntityById(_entityId: string, _userId?: string): Promise<Entity> {
        throw new Error(
            'Method findEntityById must be implemented by subclass'
        );
    }

    async findEntitiesByUserId(_userId: string): Promise<Entity[]> {
        throw new Error(
            'Method findEntitiesByUserId must be implemented by subclass'
        );
    }

    async findEntitiesByIds(_entitiesIds: string[]): Promise<Entity[]> {
        throw new Error(
            'Method findEntitiesByIds must be implemented by subclass'
        );
    }

    async findEntitiesByUserIdAndModuleName(_userId: string, _moduleName: string): Promise<Entity[]> {
        throw new Error(
            'Method findEntitiesByUserIdAndModuleName must be implemented by subclass'
        );
    }

    async unsetCredential(_entityId: string): Promise<boolean> {
        throw new Error(
            'Method unsetCredential must be implemented by subclass'
        );
    }

    async findEntity(_filter: EntityFilter): Promise<Entity | null> {
        throw new Error('Method findEntity must be implemented by subclass');
    }

    async createEntity(_entityData: EntityData): Promise<Entity> {
        throw new Error('Method createEntity must be implemented by subclass');
    }

    async updateEntity(_entityId: string, _updates: EntityData): Promise<Entity | null> {
        throw new Error('Method updateEntity must be implemented by subclass');
    }

    async deleteEntity(_entityId: string): Promise<boolean> {
        throw new Error('Method deleteEntity must be implemented by subclass');
    }
}
