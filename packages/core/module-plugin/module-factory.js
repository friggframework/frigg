const { ModuleRepository } = require('./module-repository');
const { ModuleService } = require('./module-service');
const { Module } = require('./module');

class ModuleFactory {
    constructor(...params) {
        this.moduleDefinitions = params;
        this.moduleTypes = this.moduleDefinitions.map((def) => def.moduleName);
        this.moduleRepository = new ModuleRepository();
        this.moduleService = new ModuleService({
            moduleRepository: this.moduleRepository,
            moduleDefinitions: this.moduleDefinitions,
        });
    }

    checkIsValidType(entityType) {
        return this.moduleTypes.includes(entityType);
    }

    getModuleDefinitionFromTypeName(typeName) {
        return;
    }

    async getModuleInstanceFromEntityId(entityId, userId) {
        return this.moduleService.getModuleInstance(entityId, userId);
    }

    async getInstanceFromTypeName(typeName, userId) {
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.getName() === typeName
        );
        if (!moduleDefinition) {
            throw new Error(`Module definition not found for type: ${typeName}`);
        }
        return new Module({
            userId,
            definition: moduleDefinition,
        });
    }
}

module.exports = { ModuleFactory };
