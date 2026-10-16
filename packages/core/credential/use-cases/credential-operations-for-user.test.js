/**
 * Credential scoping (ADR-056 §3.4, §3.6) over in-memory repositories that run
 * the clauses they are handed, with the real `User`. A credential has no
 * organization of its own: it is seen through the entities that use it.
 */
const { User } = require('../../user/user');
const { matchesAnyClause } = require('../../modules/tests/doubles/ownership-matching');
const {
    ListCredentialsForUser,
    GetCredentialForUserV2,
    DeleteCredentialForUser,
} = require('./credential-operations-for-user');
const { createScopePolicy } = require('../../modules/scope-policy');

// Person 7 is in organizations 17 (the active one) and 18. Person 8 is a colleague in 17.
const entity = (id, userId, organizationId, credentialId, moduleName = 'acme') => ({
    id,
    userId: String(userId),
    organizationId: organizationId === null ? null : String(organizationId),
    moduleName,
    credential: credentialId ? { id: credentialId } : null,
});
const credential = (id, userId) => ({ id, userId: String(userId), authIsValid: true, access_token: 'tok' });

function repos({ credentials, entities }) {
    const credentialIdOf = (e) => e.credential?.id;
    return {
        credentialRepository: {
            findCredentialsByUserId: jest.fn(async (id) =>
                credentials.filter((c) => String(c.userId) === String(id))
            ),
            findCredentialById: jest.fn(async (id) => {
                if (id === 'bad id') throw new Error('Invalid ID: bad id');
                return credentials.find((c) => c.id === id) ?? null;
            }),
            deleteCredentialById: jest.fn(),
        },
        moduleRepository: {
            findEntitiesByOwnership: jest.fn(async (clauses) =>
                entities.filter((e) => matchesAnyClause(e, clauses))
            ),
            findEntitiesByUserId: jest.fn(async (id) =>
                entities.filter((e) => String(e.userId) === String(id))
            ),
            findEntities: jest.fn(async ({ credentialId }) =>
                entities.filter((e) => credentialIdOf(e) === credentialId)
            ),
            unsetCredential: jest.fn(),
        },
    };
}

const callerIn = (org, { source = 'shared-secret', role, primary = 'individual' } = {}) => {
    const user = new User(
        { id: '7', type: 'INDIVIDUAL', organizationId: null },
        org ? { id: String(org), type: 'ORGANIZATION' } : null,
        false,
        primary,
        true,
        false
    );
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};
const member = (org = 17) => callerIn(org, { source: 'adopter-jwt', role: 'MEMBER' });
const admin = (org = 17) => callerIn(org, { source: 'adopter-jwt', role: 'ADMIN' });

const world = () => ({
    credentials: [
        credential('c7', 7), // the person's account, connected in 17 and in 18
        credential('c17', 17), // the organization's account
        credential('c18', 18), // another organization's
        credential('c8', 8), // a colleague's
        credential('orphan7', 7), // the person's, no entity
        credential('orphan17', 17), // the organization's, no entity
        credential('only18', 7), // the person's, connected only in 18
    ],
    entities: [
        entity('e17', 7, 17, 'c7'),
        entity('e18', 7, 18, 'c7'),
        entity('org17', 17, 17, 'c17'),
        entity('org18', 18, 18, 'c18'),
        entity('col17', 8, 17, 'c8'),
        entity('x18', 7, 18, 'only18'),
    ],
});

const list = (w, user, filters, options = {}) => {
    const r = repos(w);
    return {
        r,
        result: new ListCredentialsForUser({ ...r, scopePolicy: createScopePolicy(options) }).execute(user, filters),
    };
};
const idsOf = (rows) => rows.map((c) => c.id).sort();

describe('listing credentials by organization', () => {
    it('lists the person, the organization and the orphan ones of both, and nothing of another organization or a colleague', async () => {
        const { result } = list(world(), member());
        expect(idsOf(await result)).toEqual(['c17', 'c7', 'orphan17', 'orphan7']);
    });

    it('a credential is listed with the entities of it the caller may see, one organization at a time', async () => {
        const in17 = (await list(world(), member(17)).result).find((c) => c.id === 'c7');
        const in18 = (await list(world(), member(18)).result).find((c) => c.id === 'c7');
        expect(in17).toMatchObject({ type: 'acme', entityIds: ['e17'] });
        expect(in18).toMatchObject({ type: 'acme', entityIds: ['e18'] });
    });

    it('a credential used only in another organization is not listed, and is not mistaken for an orphan', async () => {
        expect(idsOf(await list(world(), member(17)).result)).not.toContain('only18');
        expect(idsOf(await list(world(), member(18)).result)).toContain('only18');
    });

    it('carries scope, owner, organizationId and access from who owns the credential', async () => {
        const rows = await list(world(), member()).result;
        const byId = Object.fromEntries(rows.map((c) => [c.id, c.tenancy]));
        expect(byId.c7).toEqual({ scope: 'individual', owner: { type: 'individual', id: '7' }, organizationId: '17', access: 'manage' });
        expect(byId.c17).toEqual({ scope: 'organization', owner: { type: 'organization', id: '17' }, organizationId: '17', access: 'use' });
        // An orphan has the tenancy a new connection by its owner would have.
        expect(byId.orphan7).toMatchObject({ scope: 'individual', organizationId: '17', access: 'manage' });
        expect(byId.orphan17).toMatchObject({ scope: 'organization', access: 'use' });
    });

    it('an organization admin and a shared-secret caller manage the organization credential', async () => {
        for (const user of [admin(), callerIn(17)]) {
            const rows = await list(world(), user).result;
            expect(rows.find((c) => c.id === 'c17').tenancy.access).toBe('manage');
        }
    });

    it('sends the clauses and asks only for the caller and the active organization', async () => {
        const { r, result } = list(world(), member());
        await result;
        expect(r.moduleRepository.findEntitiesByOwnership).toHaveBeenCalledWith(
            expect.arrayContaining([
                { userId: '7', organizationId: '17' },
                { userId: '17', organizationId: '17' },
            ])
        );
        expect(r.credentialRepository.findCredentialsByUserId.mock.calls.map(([id]) => id).sort()).toEqual(['17', '7']);
    });

    it('filters ?scope and ?owner', async () => {
        expect(idsOf(await list(world(), member(), { scope: 'organization' }).result)).toEqual(['c17', 'orphan17']);
        expect(idsOf(await list(world(), member(), { owner: 'me' }).result)).toEqual(['c7', 'orphan7']);
    });

    it("under individualAcross 'all' the person's credential is in every organization, with no organization of its own", async () => {
        const w = world();
        w.entities = [entity('e', 7, null, 'c7')];
        const rows = await list(w, member(18), undefined, { ownership: { individualAcross: 'all' } }).result;
        expect(rows.find((c) => c.id === 'c7').tenancy).toMatchObject({ scope: 'individual', organizationId: null });
    });

    it("under individualAcross 'all' a credential keeps the organization of the visible entity that uses it", async () => {
        const w = world();
        w.entities = [entity('e', 7, 17, 'c7')];
        const rows = await list(w, member(17), undefined, { ownership: { individualAcross: 'all' } }).result;
        expect(rows.find((c) => c.id === 'c7').tenancy.organizationId).toBe('17');
    });

    it('with no active organization lists only the person', async () => {
        expect(idsOf(await list(world(), callerIn(null)).result)).toEqual(['orphan7']);
    });

    describe('a credential an individual entity and an organization entity both use', () => {
        // Possible only through legacy data. Whose it is follows the credential, not the order the entities load.
        const both = (ownerId, order) => {
            const w = world();
            w.credentials = [credential('shared', ownerId)];
            const mine = entity('mine', 7, 17, 'shared');
            const theirs = entity('theirs', 17, 17, 'shared');
            w.entities = order === 'mine-first' ? [mine, theirs] : [theirs, mine];
            return w;
        };

        it.each(['mine-first', 'org-first'])('owned by the person: individual, whatever the order (%s)', async (order) => {
            const [row] = await list(both(7, order), member()).result;
            expect(row.tenancy).toMatchObject({ scope: 'individual', access: 'manage' });
            expect(row.entityIds.sort()).toEqual(['mine', 'theirs']);
        });

        it.each(['mine-first', 'org-first'])('owned by the organization: organization, whatever the order (%s)', async (order) => {
            const [row] = await list(both(17, order), member()).result;
            expect(row.tenancy).toMatchObject({ scope: 'organization', access: 'use' });
        });
    });
});

describe('getting one credential', () => {
    const get = (w, id, user, options = {}) =>
        new GetCredentialForUserV2({ ...repos(w), scopePolicy: createScopePolicy(options) }).execute(id, user);
    const notFound = { output: { statusCode: 404 }, data: { code: 'CREDENTIAL_NOT_FOUND' } };

    it('returns type, the visible entities and tenancy', async () => {
        expect(await get(world(), 'c7', member())).toMatchObject({
            id: 'c7',
            type: 'acme',
            entityIds: ['e17'],
            tenancy: { scope: 'individual', organizationId: '17', access: 'manage' },
        });
    });

    it('a member uses the organization credential, an admin manages it', async () => {
        expect((await get(world(), 'c17', member())).tenancy.access).toBe('use');
        expect((await get(world(), 'c17', admin())).tenancy.access).toBe('manage');
    });

    it('404s another organization, a colleague, a missing and a malformed one', async () => {
        for (const id of ['c18', 'c8', 'nope', 'bad id']) {
            await expect(get(world(), id, member())).rejects.toMatchObject(notFound);
        }
    });

    it("404s the person's own credential when only another organization uses it", async () => {
        await expect(get(world(), 'only18', member(17))).rejects.toMatchObject(notFound);
        expect(await get(world(), 'only18', member(18))).toMatchObject({ entityIds: ['x18'] });
    });

    it('a credential no entity uses is visible to its owner, and to nobody else', async () => {
        expect(await get(world(), 'orphan7', member())).toMatchObject({ entityIds: [], type: null });
        const stranger = new User({ id: '99', type: 'INDIVIDUAL' }, { id: '17' }, false, 'individual', true, false);
        stranger.setAuthSource('adopter-jwt');
        await expect(get(world(), 'orphan7', stranger)).rejects.toMatchObject(notFound);
    });
});

describe('deleting a credential', () => {
    const remove = (w, id, user) => {
        const r = repos(w);
        const getCredentialForUser = new GetCredentialForUserV2({ ...r, scopePolicy: createScopePolicy() });
        return { r, run: () => new DeleteCredentialForUser({ ...r, getCredentialForUser }).execute(id, user) };
    };

    it('unsets the credential on the visible entities, then deletes it', async () => {
        const w = world();
        w.entities = [entity('e17', 7, 17, 'c7')];
        const { r, run } = remove(w, 'c7', member());
        expect(await run()).toEqual({ id: 'c7', entityIds: ['e17'] });
        expect(r.moduleRepository.unsetCredential).toHaveBeenCalledWith('e17');
        expect(r.credentialRepository.deleteCredentialById).toHaveBeenCalledWith('c7');
    });

    it('a member may not delete the organization credential (403), an admin may', async () => {
        const refused = remove(world(), 'c17', member());
        await expect(refused.run()).rejects.toMatchObject({ output: { statusCode: 403 }, data: { code: 'ORG_ADMIN_REQUIRED' } });
        expect(refused.r.credentialRepository.deleteCredentialById).not.toHaveBeenCalled();
        const allowed = remove(world(), 'c17', admin());
        await allowed.run();
        expect(allowed.r.credentialRepository.deleteCredentialById).toHaveBeenCalledWith('c17');
    });

    describe('a credential another organization still uses', () => {
        it('is refused with 409 CREDENTIAL_SHARED and nothing is touched', async () => {
            const { r, run } = remove(world(), 'c7', member(17));
            await expect(run()).rejects.toMatchObject({ output: { statusCode: 409 }, data: { code: 'CREDENTIAL_SHARED' } });
            expect(r.moduleRepository.unsetCredential).not.toHaveBeenCalled();
            expect(r.credentialRepository.deleteCredentialById).not.toHaveBeenCalled();
        });

        it('says nothing about the other connections: no count, no organization, no ids', async () => {
            const { run } = remove(world(), 'c7', member(17));
            const error = await run().catch((e) => e);
            expect(error.message).toBe(
                'Credential c7 is still in use by other connections and cannot be deleted from here'
            );
            expect(JSON.stringify(error.data)).not.toMatch(/otherEntityCount|e18|18/);
        });

        it('goes with the last entity: delete the entities, then it deletes', async () => {
            const w = world();
            w.entities = w.entities.filter((e) => e.id !== 'e18');
            const { r, run } = remove(w, 'c7', member(17));
            await run();
            expect(r.credentialRepository.deleteCredentialById).toHaveBeenCalledWith('c7');
        });
    });
});
