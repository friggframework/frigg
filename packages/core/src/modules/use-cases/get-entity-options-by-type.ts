import { Module } from '../module';
import type { ModuleDefinition } from '../module';

export class GetEntityOptionsByType {
    moduleDefinitions: ModuleDefinition[];

    constructor({ moduleDefinitions }: { moduleDefinitions: ModuleDefinition[] }) {
        this.moduleDefinitions = moduleDefinitions;
    }

    async execute(userId: string, type: string): Promise<unknown> {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.getName?.() === type
        );
        if (!moduleDefinition) {
            throw new Error(`Module definition not found for type: ${type}`);
        }
        const moduleInstance = new Module({
            userId,
            definition: moduleDefinition,
        });

        return moduleInstance.getEntityOptions();
    }
}
