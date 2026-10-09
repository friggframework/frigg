/**
 * @param {import('../module').Module} moduleInstance
 * Convert a Module domain instance to a plain DTO suitable for JSON responses.
 */
function mapModuleClassToModuleDTO(moduleInstance) {
    if (!moduleInstance) return null;

    return {
        id: moduleInstance.entity.id,
        name: moduleInstance.name,
        userId: moduleInstance.userId,
        entity: moduleInstance.entity,
        credentialId: moduleInstance.credential?._id?.toString(),
        type: moduleInstance.getName()
    };
}

module.exports = { mapModuleClassToModuleDTO }; 