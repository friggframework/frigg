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
 * Resolves each `wait()` only once `parties` callers have arrived, so a test
 * can make concurrent requests all read before any of them writes.
 */
function createBarrier(parties) {
    let arrived = 0;
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    return {
        async wait() {
            arrived += 1;
            if (arrived >= parties) release();
            await gate;
        },
    };
}

/**
 * Stateful fake of the user repository, built from jest.fn so every call is
 * observable. Individuals carry `organizationId`, as the real repositories
 * return it. Like the database, it refuses a second individual with the same
 * `appUserId` (a Prisma-shaped `P2002`), which is what a first-login race hits.
 *
 * @param {Object} [options]
 * @param {number} [options.findBarrier] Make the first N calls to
 *   `findIndividualUserByAppUserId` wait for each other (see createBarrier).
 */
function createUserRepositoryDouble({
    individuals = [],
    organizations = [],
    findBarrier = 0,
} = {}) {
    const individualUsers = new Map(
        individuals.map((u) => [u.appUserId, { ...u }])
    );
    const organizationUsers = new Map(
        organizations.map((o) => [o.appOrgId, { ...o }])
    );
    const barrier = findBarrier > 1 ? createBarrier(findBarrier) : null;
    let barrierCalls = 0;
    let seq = 0;

    const repo = {
        findIndividualUserByAppUserId: jest.fn(async (appUserId) => {
            const found = individualUsers.get(appUserId) ?? null;
            if (barrier && barrierCalls < findBarrier) {
                barrierCalls += 1;
                await barrier.wait();
            }
            return found && { ...found };
        }),
        findOrganizationUserByAppOrgId: jest.fn(
            async (appOrgId) => organizationUsers.get(appOrgId) ?? null
        ),
        createIndividualUser: jest.fn(async (params) => {
            if (individualUsers.has(params.appUserId)) {
                throw Object.assign(
                    new Error('Unique constraint failed on appUserId'),
                    { code: 'P2002' }
                );
            }
            const created = {
                id: `ind-${++seq}`,
                organizationId: undefined,
                ...params,
            };
            individualUsers.set(created.appUserId, created);
            return { ...created };
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

/**
 * In-memory organization membership repository over the same state as
 * `userRepo`, so the legacy `organizationId` pointer is visible to it as it is
 * to the real adapters. The pair is unique and `addMembership` is an upsert;
 * the legacy-pointer rules are the real ones from organization-membership-model.
 */
function createMembershipRepositoryDouble(userRepo) {
    const {
        toMembership,
        implicitMembership,
        withLegacyMembership,
    } = require('../../repositories/organization-membership-model');
    const rows = new Map();
    const key = (i, o) => `${i}|${o}`;
    let seq = 0;
    const individualById = (id) =>
        [...userRepo.state.individualUsers.values()].find((u) => u.id === id);

    const repo = {
        findMembership: jest.fn(async (individualId, organizationId) => {
            const row = rows.get(key(individualId, organizationId));
            if (row) return toMembership(row);
            return implicitMembership(
                individualById(individualId),
                organizationId
            );
        }),
        addMembership: jest.fn(
            async (individualId, organizationId, { role } = {}) => {
                const k = key(individualId, organizationId);
                if (!rows.has(k)) {
                    rows.set(k, {
                        id: `mem-${++seq}`,
                        individualUserId: individualId,
                        organizationUserId: organizationId,
                        role: role ?? null,
                        createdAt: new Date(),
                    });
                }
                return toMembership(rows.get(k));
            }
        ),
        listMembershipsForIndividual: jest.fn(async (individualId) =>
            withLegacyMembership(
                [...rows.values()]
                    .filter((r) => r.individualUserId === individualId)
                    .map(toMembership),
                individualById(individualId)
            )
        ),
    };
    repo.rows = rows;
    return repo;
}

module.exports = {
    createKeys,
    signToken,
    unsignedToken,
    createUserRepositoryDouble,
    createMembershipRepositoryDouble,
};
