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

// Fields every repository adds around the stored data; everything else on a
// credential record came from the provider and is treated as secret.
const CREDENTIAL_METADATA = new Set([
    'id',
    '_id',
    'userId',
    'user',
    'externalId',
    'authIsValid',
    'createdAt',
    'updatedAt',
    'type',
    'entityIds',
    'status',
]);

/**
 * Masks one stored credential value. Strings keep at most their last four
 * characters, and only when long enough that four characters reveal nothing
 * useful; objects and arrays are hidden whole. Numbers, booleans and null
 * (expiry times, flags) are not secret and pass through.
 */
function maskValue(value) {
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return value.length >= 16 ? `****${value.slice(-4)}` : '****';
    }
    return '****';
}

const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * A credential with every provider field masked. The keys stay visible so a
 * client can tell an OAuth credential from an API-key one; the values never
 * leave the server.
 */
function maskCredential(credential) {
    const data = {};
    for (const [key, value] of Object.entries(credential)) {
        if (CREDENTIAL_METADATA.has(key) || value === undefined) continue;
        data[key] = maskValue(value);
    }
    const entityIds = Array.isArray(credential.entityIds)
        ? credential.entityIds.map(String)
        : [];
    return {
        id: String(credential.id),
        type: credential.type ?? null,
        externalId: credential.externalId ?? null,
        userId: idOf(credential.userId),
        authIsValid:
            typeof credential.authIsValid === 'boolean'
                ? credential.authIsValid
                : null,
        entityIds,
        entityCount: entityIds.length,
        createdAt: toIso(credential.createdAt),
        updatedAt: toIso(credential.updatedAt),
        data,
    };
}

module.exports = {
    toEntityDto,
    toIntegrationDto,
    maskCredential,
    maskValue,
    idOf,
};
