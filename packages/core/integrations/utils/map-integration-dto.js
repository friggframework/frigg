/**
 * @param {import('../integration').Integration} integration
 * Convert an Integration domain instance to a plain DTO suitable for JSON responses.
 * Can also accept a plain object with an 'options' property to avoid unnecessary instantiation.
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
        options: integration.options || (typeof integration.getOptionDetails === 'function' ? integration.getOptionDetails() : null),
    };
}


const getModulesDefinitionFromIntegrationClasses = (integrationClasses) => {
    return [
        ...new Set(
            integrationClasses
                .map((integration) =>
                    Object.values(integration.Definition.modules).map(
                        (module) => module.definition
                    )
                )
                .flat()
        ),
    ];
};

module.exports = { mapIntegrationClassToIntegrationDTO, getModulesDefinitionFromIntegrationClasses }; 