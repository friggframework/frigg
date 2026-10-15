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
        findIndividualUserById: jest.fn(async (id) => {
            for (const u of individualUsers.values()) {
                if (u.id === id) return { ...u };
            }
            return null;
        }),
        // Like the database: sets the pointer only while it is unset.
        linkIndividualToOrganizationIfUnset: jest.fn(
            async (individualId, organizationId) => {
                for (const u of individualUsers.values()) {
                    if (u.id !== individualId) continue;
                    const unset =
                        u.organizationId === undefined ||
                        u.organizationId === null ||
                        u.organizationId === '';
                    if (unset) u.organizationId = organizationId;
                    return { ...u };
                }
                return null;
            }
        ),
    };
    repo.state = { individualUsers, organizationUsers };
    return repo;
}

/**
 * In-memory organization membership repository: atomic, like the real ones. The
 * pair is unique and `addMembership` is an upsert. It knows nothing of the
 * legacy `organizationId` pointer; the domain (user/membership.js) does.
 */
function createMembershipRepositoryDouble() {
    const { toMembership } = require('../../repositories/organization-membership-record');
    const rows = new Map();
    const key = (i, o) => `${i}|${o}`;
    let seq = 0;

    const repo = {
        findMembership: jest.fn(async (individualId, organizationId) => {
            const row = rows.get(key(individualId, organizationId));
            return row ? toMembership(row) : null;
        }),
        addMembership: jest.fn(
            async (individualId, organizationId, { orgRole } = {}) => {
                const k = key(individualId, organizationId);
                if (!rows.has(k)) {
                    rows.set(k, {
                        id: `mem-${++seq}`,
                        individualUserId: individualId,
                        organizationUserId: organizationId,
                        orgRole: orgRole ?? 'MEMBER',
                        createdAt: new Date(),
                    });
                }
                return toMembership(rows.get(k));
            }
        ),
        listMembershipsForOrganization: jest.fn(async (organizationId) =>
            [...rows.values()]
                .filter((r) => r.organizationUserId === organizationId)
                .map(toMembership)
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
