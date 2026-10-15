/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and reason codes are snake_case by spec */
const jose = require('jose');

/**
 * Key material and token signing for adopter-JWT tests. Real keys and real
 * signatures: nothing here fakes the verifier.
 */
async function createKeys() {
    const es = await jose.generateKeyPair('ES256');
    const rs = await jose.generateKeyPair('RS256');
    const attacker = await jose.generateKeyPair('ES256');
    const publicJwks = {
        keys: [
            {
                ...(await jose.exportJWK(es.publicKey)),
                kid: 'es-1',
                alg: 'ES256',
                use: 'sig',
            },
            {
                ...(await jose.exportJWK(rs.publicKey)),
                kid: 'rs-1',
                alg: 'RS256',
                use: 'sig',
            },
        ],
    };
    return {
        es,
        rs,
        attacker,
        publicJwks,
        localJwks: jose.createLocalJWKSet(publicJwks),
        hmacSecret: 'a-shared-secret-that-is-long-enough-for-hs256',
    };
}

/**
 * @param {Object} claims
 * @param {Object} opts
 * @param {Object|Uint8Array} opts.key - signing key
 * @param {string} [opts.alg='ES256']
 * @param {string} [opts.kid]
 * @param {string|null} [opts.exp='5m'] - null omits exp
 */
async function signToken(
    claims,
    { key, alg = 'ES256', kid, exp = '5m', iss, aud, nbf } = {}
) {
    const jwt = new jose.SignJWT(claims)
        .setProtectedHeader(kid ? { alg, kid } : { alg })
        .setIssuedAt();
    if (exp !== null) jwt.setExpirationTime(exp);
    if (iss) jwt.setIssuer(iss);
    if (aud) jwt.setAudience(aud);
    if (nbf) jwt.setNotBefore(nbf);
    return jwt.sign(key);
}

const b64url = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

/** An unsigned token: `alg: none`, empty signature. */
function unsignedToken(claims) {
    return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
        ...claims,
        exp: Math.floor(Date.now() / 1000) + 300,
    })}.`;
}

/**
 * Stateful fake of the user repository, built from jest.fn so every call is
 * observable. Individuals carry `organizationId`, as the real repositories
 * return it.
 */
function createUserRepositoryDouble({
    individuals = [],
    organizations = [],
} = {}) {
    const individualUsers = new Map(
        individuals.map((u) => [u.appUserId, { ...u }])
    );
    const organizationUsers = new Map(
        organizations.map((o) => [o.appOrgId, { ...o }])
    );
    let seq = 0;

    const repo = {
        findIndividualUserByAppUserId: jest.fn(
            async (appUserId) => individualUsers.get(appUserId) ?? null
        ),
        findOrganizationUserByAppOrgId: jest.fn(
            async (appOrgId) => organizationUsers.get(appOrgId) ?? null
        ),
        createIndividualUser: jest.fn(async (params) => {
            const created = {
                id: `ind-${++seq}`,
                organizationId: undefined,
                ...params,
            };
            individualUsers.set(created.appUserId, created);
            return created;
        }),
        createOrganizationUser: jest.fn(async (params) => {
            const created = { id: `org-${++seq}`, ...params };
            organizationUsers.set(created.appOrgId, created);
            return created;
        }),
        linkIndividualToOrganization: jest.fn(
            async (individualId, organizationId) => {
                for (const u of individualUsers.values()) {
                    if (u.id === individualId) {
                        u.organizationId = organizationId;
                        return { ...u };
                    }
                }
                throw new Error('individual not found');
            }
        ),
    };
    repo.state = { individualUsers, organizationUsers };
    return repo;
}

module.exports = {
    createKeys,
    signToken,
    unsignedToken,
    createUserRepositoryDouble,
};
