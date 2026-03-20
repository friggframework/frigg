import { Module } from '../module';
import type { ModuleDefinition } from '../module';

export class GetModuleInstanceFromType {
    moduleDefinitions: ModuleDefinition[];

    constructor({ moduleDefinitions }: { moduleDefinitions: ModuleDefinition[] }) {
        this.moduleDefinitions = moduleDefinitions;
    }

    async execute(userId: string, type: string): Promise<Module> {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.getName?.() === type
        );
        if (!moduleDefinition) {
            throw new Error(`Module definition not found for type: ${type}`);
        }
        return new Module({
            userId,
            definition: moduleDefinition,
        });
    }
}
