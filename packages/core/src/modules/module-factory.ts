import { Module } from './module';
import type { ModuleDefinition } from './module';
import type { ModuleRepositoryInterface } from './repositories/module-repository-interface';

export interface ModuleFactoryParams {
    moduleRepository: ModuleRepositoryInterface;
    moduleDefinitions: ModuleDefinition[];
}

export class ModuleFactory {
    moduleRepository: ModuleRepositoryInterface;
    moduleDefinitions: ModuleDefinition[];

    constructor({ moduleRepository, moduleDefinitions }: ModuleFactoryParams) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    async getModuleInstance(entityId: string, userId: string): Promise<Module> {
        const entity = await this.moduleRepository.findEntityById(
            entityId,
            userId
        );

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        if (entity.userId !== userId) {
            throw new Error(
                `Entity ${entityId} does not belong to user ${userId}`
            );
        }

        const moduleName = entity.moduleName;
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            return moduleName === def.moduleName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for module: ${moduleName}`
            );
        }

        return new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });
    }
}
