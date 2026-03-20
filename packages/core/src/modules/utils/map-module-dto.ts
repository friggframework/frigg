import type { Module } from '../module';

export interface ModuleDTO {
    id: string | undefined;
    name: string;
    userId: string | null;
    entity: Module['entity'];
    credentialId: string | undefined;
    type: string;
}

export function mapModuleClassToModuleDTO(moduleInstance: Module): ModuleDTO | null {
    if (!moduleInstance) return null;

    return {
        id: moduleInstance.entity?.id,
        name: moduleInstance.name,
        userId: moduleInstance.userId,
        entity: moduleInstance.entity,
        credentialId: moduleInstance.credential?.id?.toString(),
        type: moduleInstance.getName()
    };
}
