/**
 * The one shape an entity (connected account) takes in any API response,
 * v1 or v2, for every caller including its owner.
 *
 * Repositories attach the decrypted credential to the entities they return,
 * so an entity record must never be sent as it is: an organization member
 * listing entities or integrations would receive the organization's
 * access_token, refresh_token or api_key. This keeps a fixed set of
 * descriptive fields and reduces the credential to its id and whether it
 * still works.
 */

const idOf = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') {
        const id = value.id ?? value._id;
        return id === undefined || id === null ? null : String(id);
    }
    return String(value);
};

/**
 * @param {Object|string|number|null|undefined} entity - an entity record, or
 *   an entity id (returned as is: integrations may carry bare ids)
 * @returns {Object|string|number|null}
 */
function toPublicEntity(entity) {
    if (entity === undefined || entity === null) return null;
    if (typeof entity !== 'object') return entity;
    const credential =
        entity.credential && typeof entity.credential === 'object'
            ? entity.credential
            : null;
    const result = {
        id: idOf(entity.id ?? entity._id),
        name: entity.name ?? null,
        moduleName: entity.moduleName ?? null,
        externalId: entity.externalId ?? null,
        userId: idOf(entity.userId ?? entity.user),
        credentialId: idOf(entity.credential ?? entity.credentialId),
        authIsValid:
            typeof credential?.authIsValid === 'boolean'
                ? credential.authIsValid
                : typeof entity.authIsValid === 'boolean'
                  ? entity.authIsValid
                  : null,
    };
    if (entity.organizationId !== undefined) {
        result.organizationId = idOf(entity.organizationId);
    }
    return result;
}

/** `toPublicEntity` over a list, tolerating a missing one. */
function toPublicEntities(entities) {
    return Array.isArray(entities) ? entities.map(toPublicEntity) : [];
}

module.exports = { toPublicEntity, toPublicEntities };
