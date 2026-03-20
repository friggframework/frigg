import { Module } from '../module';
import type { ModuleDefinition } from '../module';
import type { ModuleRepositoryInterface } from '../repositories/module-repository-interface';

interface UserLike {
    getId(): string;
    ownsUserId(userId: string | undefined): boolean;
}

export class RefreshEntityOptions {
    moduleRepository: ModuleRepositoryInterface;
    moduleDefinitions: ModuleDefinition[];

    constructor({ moduleRepository, moduleDefinitions }: { moduleRepository: ModuleRepositoryInterface; moduleDefinitions: ModuleDefinition[] }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    async execute(entityId: string, userIdOrUser: string | UserLike, options: unknown): Promise<unknown> {
        const userId = typeof userIdOrUser === 'object' && (userIdOrUser as UserLike)?.getId
            ? (userIdOrUser as UserLike).getId()
            : userIdOrUser as string;

        const entity = await this.moduleRepository.findEntityById(
            entityId,
            userId
        );

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const isOwned = typeof userIdOrUser === 'object' && (userIdOrUser as UserLike)?.ownsUserId
            ? (userIdOrUser as UserLike).ownsUserId(entity.userId)
            : entity.userId?.toString() === userId?.toString();

        if (!isOwned) {
            throw new Error(
                `Entity ${entityId} does not belong to user ${userId}`
            );
        }

        const entityType = entity.moduleName;
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            const modelName =
                Module.getEntityModelFromDefinition(def).modelName;
            return entityType === modelName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        const moduleInstance = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        await moduleInstance.refreshEntityOptions(options);
        return moduleInstance.getEntityOptions();
    }
}
