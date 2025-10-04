/**
 * @param {import('../integration').Integration} integration
 * Convert an Integration domain instance to a plain DTO suitable for JSON responses.
 */
function mapIntegrationClassToIntegrationDTO(integration) {
    if (!integration) return null;

    return {
        id: integration.id,
        userId: integration.userId,
        entities: integration.entities,
        config: integration.config,
        status: integration.status,
        version: integration.version,
        messages: integration.messages,
        userActions: integration.userActions,
        options: integration.getOptionDetails(),
    };
}


const getModulesDefinitionFromIntegrationClasses = (integrationClasses) => {
    const moduleDefinitions = [];

    integrationClasses.forEach((integration) => {
        Object.entries(integration.Definition.modules).forEach(([moduleName, module]) => {
            moduleDefinitions.push({
                moduleName,
                definition: module.definition
            });
        });
    });

    // Remove duplicates based on moduleName
    const uniqueModules = moduleDefinitions.filter((module, index, self) =>
        index === self.findIndex(m => m.moduleName === module.moduleName)
    );

    return uniqueModules;
};

module.exports = { mapIntegrationClassToIntegrationDTO, getModulesDefinitionFromIntegrationClasses }; 