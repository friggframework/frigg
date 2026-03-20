import { Module } from '../module';
import type { ModuleDefinition } from '../module';
import type { ModuleRepositoryInterface } from '../repositories/module-repository-interface';
import { mapModuleClassToModuleDTO } from '../utils/map-module-dto';
import type { ModuleDTO } from '../utils/map-module-dto';

export class GetEntitiesForUser {
    moduleRepository: ModuleRepositoryInterface;
    definitionMap: Map<string, ModuleDefinition>;

    constructor({ moduleRepository, moduleDefinitions }: { moduleRepository: ModuleRepositoryInterface; moduleDefinitions: ModuleDefinition[] }) {
        this.moduleRepository = moduleRepository;

        this.definitionMap = new Map();
        for (const definition of moduleDefinitions) {
            this.definitionMap.set(definition.moduleName, definition);
        }
    }

    async execute(userId: string): Promise<(ModuleDTO | null)[]> {
        const entities = await this.moduleRepository.findEntitiesByUserId(
            userId
        );

        return entities.map((entity) => {
            const definition = this.definitionMap.get(entity.moduleName!);

            const moduleInstance = new Module({
                userId,
                definition: definition!,
                entity: entity,
            });
            return mapModuleClassToModuleDTO(moduleInstance);
        });
    }
}
