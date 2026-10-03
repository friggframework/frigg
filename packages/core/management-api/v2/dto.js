/**
 * Response shapes for Management API v2. Use cases return domain records;
 * these functions decide what leaves the server. Credential material never
 * does (see maskCredential).
 */

const idOf = (value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') {
        const id = value.id ?? value._id;
        return id === undefined || id === null ? null : String(id);
    }
    return String(value);
};

/** An entity (connected account). */
function toEntityDto(entity) {
    const credential =
        entity.credential && typeof entity.credential === 'object'
            ? entity.credential
            : null;
    return {
        id: String(entity.id),
        type: entity.moduleName ?? null,
        name: entity.name ?? null,
        externalId: entity.externalId ?? null,
        credentialId: idOf(entity.credential ?? entity.credentialId),
        userId: idOf(entity.userId ?? entity.user),
        authIsValid:
            typeof credential?.authIsValid === 'boolean'
                ? credential.authIsValid
                : null,
    };
}

/** An integration, from a hydrated instance or a stored DTO. */
function toIntegrationDto(integration) {
    return {
        id: String(integration.id),
        entities: integration.entities ?? [],
        status: integration.status ?? null,
        config: integration.config ?? {},
        version: integration.version ?? null,
        messages: integration.messages ?? {},
    };
}

module.exports = { toEntityDto, toIntegrationDto, idOf };
