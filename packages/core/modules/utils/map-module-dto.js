/**
 * @param {import('../module').Module} moduleInstance
 * Convert a Module domain instance to a plain DTO suitable for JSON responses.
 */
const { toPublicEntity } = require('./public-entity');

function mapModuleClassToModuleDTO(moduleInstance) {
    if (!moduleInstance) return null;

    return {
        id: moduleInstance.entity.id,
        name: moduleInstance.name,
        userId: moduleInstance.userId,
        // Never the entity record itself: it carries the decrypted credential.
        entity: toPublicEntity({
            ...moduleInstance.entity,
            credential: moduleInstance.credential ?? moduleInstance.entity?.credential,
        }),
        credentialId: moduleInstance.credential?._id?.toString(),
        type: moduleInstance.getName()
    };
}

module.exports = { mapModuleClassToModuleDTO }; 