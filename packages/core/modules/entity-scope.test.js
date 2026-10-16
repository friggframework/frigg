const {
    parseScopeSetting,
    resolveScope,
    resolveOwnershipConfig,
    listBindingScopes,
    accessContext,
    resolveOwnerForScope,
    resolveIntegrationOwner,
    integrationOwnerKind,
    pickExistingEntity,
    visibilityClauses,
    describeRecord,
    decideLevel,
    applyRequest,
    matchesListFilters,
    createScopePolicy,
    canManageOrganization,
    accessToOwner,
    grantsUse,
    OwnershipConfigError,
} = require('./entity-scope');

/**
 * A User as the domain sees it: `individual` is the caller's own user (with the
 * legacy `organizationId` pointer), `org` the organization this request acts in.
 */
const user = ({
    individual = { id: '7', organizationId: null },
    org = null,
    primary = 'individual',
    authSource = 'shared-secret',
    role = null,
} = {}) => ({
    config: { primary },
    getAuthSource: () => authSource,
    getOrgRole: () => role,
    getId: () => (primary === 'organization' ? org?.id : individual?.id),
    getIndividualUser: () => individual,
    getActiveOrganizationId: () => (org ? String(org.id) : null),
});

const ctxOf = (options, individualAcross, orgAdminRoles) =>
    accessContext(user(options), { individualAcross, orgAdminRoles });

describe('resolveScope (ADR-056 §3.1)', () => {
    it('falls back to individual, or organization for an organization-primary app', () => {
        expect(resolveScope({ primary: 'individual' })).toMatchObject({
            scope: 'individual',
            source: 'default',
        });
        expect(resolveScope({})).toMatchObject({ scope: 'individual' });
        expect(resolveScope({ primary: 'organization' })).toMatchObject({
            scope: 'organization',
            source: 'default',
        });
    });

    // Each level is set to a different scope and the one nearer the top must win.
    const levels = ['binding', 'integration', 'entityType', 'app'];
    it.each(levels.map((name, i) => [name, i]))(
        '%s overrides every level below it, and nothing intersects',
        (name, index) => {
            const all = {
                binding: 'global',
                integration: 'organization',
                entityType: 'individual',
                app: 'organization',
            };
            const given = {};
            for (const level of levels.slice(index)) given[level] = all[level];
            expect(resolveScope(given)).toMatchObject({
                scope: all[name],
                source: name,
            });
        }
    );

    it('uses the default of a { default, allow } setting', () => {
        expect(
            resolveScope({ entityType: { default: 'organization', allow: ['organization', 'individual'] } })
        ).toMatchObject({ scope: 'organization', allow: ['organization', 'individual'] });
    });

    it('lets a request choose only from the deciding level allow list', () => {
        const entityType = { default: 'organization', allow: ['organization', 'individual'] };
        expect(resolveScope({ request: 'individual', entityType })).toMatchObject({
            scope: 'individual',
            source: 'request',
            decidedBy: 'entityType',
        });
        // The app level says individual-only; the entity type level decides, so the
        // app's list is not consulted (nothing intersects).
        expect(
            resolveScope({ request: 'individual', entityType, app: 'organization' })
        ).toMatchObject({ scope: 'individual' });
    });

    it('refuses a request outside the allow list with 400 and names the list', () => {
        expect.assertions(3);
        try {
            resolveScope({ request: 'organization', entityType: 'individual' });
        } catch (error) {
            // The same refusal as a request for global: the app does not offer it.
            expect(error.output.statusCode).toBe(403);
            expect(error.data.code).toBe('SCOPE_NOT_ALLOWED');
            expect(error.data.details.allowed).toEqual(['individual']);
        }
    });

    it('lets a string setting be requested only as itself', () => {
        expect(resolveScope({ request: 'organization', app: 'organization' })).toMatchObject({
            scope: 'organization',
        });
        expect(() => resolveScope({ request: 'individual', app: 'organization' })).toThrow(
            /not allowed/
        );
    });

    it('never gives a tenant request global, even where the level allows it', () => {
        expect.assertions(2);
        try {
            resolveScope({ request: 'global', entityType: { default: 'global', allow: ['global'] } });
        } catch (error) {
            expect(error.output.statusCode).toBe(403);
            expect(error.data.code).toBe('SCOPE_NOT_ALLOWED');
        }
    });

    it('rejects a request that is not a scope', () => {
        expect(() => resolveScope({ request: 'team' })).toThrow(/scope must be one of/);
    });
});

describe('parseScopeSetting', () => {
    it('is null when a level sets nothing', () => {
        expect(parseScopeSetting(undefined, 'x')).toBeNull();
        expect(parseScopeSetting(null, 'x')).toBeNull();
    });

    it('reads a string as default and the only allowed value', () => {
        expect(parseScopeSetting('organization', 'x')).toEqual({
            default: 'organization',
            allow: ['organization'],
        });
    });

    it('reads allow-only with one entry as its own default, and default-only as allow of one', () => {
        expect(parseScopeSetting({ allow: ['individual'] }, 'x')).toEqual({
            default: 'individual',
            allow: ['individual'],
        });
        expect(parseScopeSetting({ default: 'organization' }, 'x')).toEqual({
            default: 'organization',
            allow: ['organization'],
        });
    });

    it('is idempotent on its own output (the resolved config round-trips)', () => {
        const parsed = parseScopeSetting({ default: 'organization', allow: ['organization', 'individual'] }, 'x');
        expect(parseScopeSetting(parsed, 'x')).toEqual(parsed);
    });

    it.each([
        ['team', 'not one of'],
        [{ default: 'individual', allow: ['organization'] }, 'must be in scope.allow'],
        [{ allow: ['individual', 'organization'] }, 'needs a default'],
        [{ default: 'individual', allow: [] }, 'one or more'],
        [{ default: 'individual', allow: ['individual', 'individual'] }, 'once each'],
        [{ default: 'individual', extra: 1 }, 'unknown scope setting'],
        [42, 'scope name or'],
    ])('rejects %j', (setting, message) => {
        expect(() => parseScopeSetting(setting, 'app scope')).toThrow(OwnershipConfigError);
        expect(() => parseScopeSetting(setting, 'app scope')).toThrow(message);
    });
});

describe('resolveOwnershipConfig (checked at app-definition load)', () => {
    const module = (name) => ({ definition: { moduleName: name } });
    const integration = (name, definition = {}) => ({
        Definition: { name, modules: { crm: module('hubspot') }, ...definition },
    });
    const registry = (scope) =>
        new Map([['hubspot', { settings: scope === undefined ? {} : { scope } }]]);

    it('returns the app level and individualAcross, defaulting to organization', () => {
        expect(resolveOwnershipConfig({ integrations: [] }, new Map())).toEqual({
            scope: null,
            individualAcross: 'organization',
            orgAdminRoles: ['ADMIN'],
        });
        expect(
            resolveOwnershipConfig(
                { ownership: { scope: 'organization', individualAcross: 'all' }, integrations: [] },
                new Map()
            )
        ).toEqual({
            scope: { default: 'organization', allow: ['organization'] },
            individualAcross: 'all',
            orgAdminRoles: ['ADMIN'],
        });
    });

    it.each([
        [{ ownership: { individualAcross: 'everywhere' } }, 'individualAcross'],
        [{ ownership: { scope: 'team' } }, 'appDefinition.ownership.scope'],
        [{ ownership: { owner: 'organization' } }, 'unknown setting'],
        [{ ownership: 'organization' }, 'must be an object'],
        [{ integrations: [integration('a', { ownership: { owner: 'team' } })] }, 'owner must be one of'],
        [{ integrations: [integration('a', { ownership: { scope: 'team' } })] }, "integration 'a' ownership"],
        [{ integrations: [integration('a', { modules: { crm: { ...module('hubspot'), scope: 'team' } } })] }, "binding 'crm'"],
    ])('rejects %j', (appDefinition, message) => {
        expect(() => resolveOwnershipConfig(appDefinition, registry())).toThrow(OwnershipConfigError);
        expect(() => resolveOwnershipConfig(appDefinition, registry())).toThrow(message);
    });

    it('rejects a bad registry scope', () => {
        expect(() => resolveOwnershipConfig({ integrations: [] }, registry('team'))).toThrow(
            "entity type 'hubspot' scope"
        );
    });

    it('rejects an organization-owned integration that binds an individual entity (§3.3)', () => {
        const app = {
            user: { primary: 'individual' },
            integrations: [integration('shared', { ownership: { owner: 'organization' } })],
        };
        // The default for an individual-primary app is individual.
        expect(() => resolveOwnershipConfig(app, registry())).toThrow(/cannot bind an 'individual' entity/);
        // Setting the binding (or the type) to organization makes it valid.
        expect(() =>
            resolveOwnershipConfig(
                { ...app, integrations: [integration('shared', { ownership: { owner: 'organization', scope: 'organization' } })] },
                registry()
            )
        ).not.toThrow();
        expect(() => resolveOwnershipConfig(app, registry('organization'))).not.toThrow();
        // An organization-primary app defaults to organization, so it is valid as written.
        expect(() =>
            resolveOwnershipConfig({ ...app, user: { primary: 'organization' } }, registry())
        ).not.toThrow();
    });

    it('accepts the deprecated entities[key].global alias as scope global', () => {
        const rows = listBindingScopes(
            {
                integrations: [
                    integration('a', { entities: { crm: { global: true } } }),
                ],
            },
            registry(),
            'individual'
        );
        expect(rows).toEqual([
            expect.objectContaining({ binding: 'crm', scope: 'global', source: 'binding' }),
        ]);
    });

    it('lists every binding with its resolved scope and where it came from', () => {
        const rows = listBindingScopes(
            {
                ownership: { scope: 'organization' },
                integrations: [
                    integration('a'),
                    integration('b', { ownership: { scope: 'individual' } }),
                ],
            },
            registry('individual'),
            'individual'
        );
        expect(rows).toEqual([
            expect.objectContaining({ integration: 'a', scope: 'individual', source: 'entityType' }),
            expect.objectContaining({ integration: 'b', scope: 'individual', source: 'integration' }),
        ]);
    });
});

describe('resolveOwnerForScope (§3.2, §3.6)', () => {
    it('individual: the person, in the active organization', () => {
        expect(
            resolveOwnerForScope('individual', ctxOf({ org: { id: 17 } }))
        ).toEqual({ scope: 'individual', ownerId: '7', organizationId: '17' });
    });

    it('individual with no organization: organizationId null', () => {
        expect(resolveOwnerForScope('individual', ctxOf({}))).toEqual({
            scope: 'individual',
            ownerId: '7',
            organizationId: null,
        });
    });

    it("individual under individualAcross 'all': stored with no organization", () => {
        expect(
            resolveOwnerForScope('individual', ctxOf({ org: { id: 17 } }, 'all'))
        ).toEqual({ scope: 'individual', ownerId: '7', organizationId: null });
    });

    it('organization: the active organization user, in that organization', () => {
        expect(
            resolveOwnerForScope('organization', ctxOf({ org: { id: 17 } }))
        ).toEqual({ scope: 'organization', ownerId: '17', organizationId: '17' });
    });

    it('organization never takes the caller as owner, whatever user.primary says', () => {
        const owner = resolveOwnerForScope(
            'organization',
            ctxOf({ org: { id: 17 }, primary: 'individual' })
        );
        expect(owner.ownerId).toBe('17');
        const individual = resolveOwnerForScope(
            'individual',
            ctxOf({ org: { id: 17 }, primary: 'organization' })
        );
        expect(individual.ownerId).toBe('7');
    });

    it('400s, naming the header, when the identity the scope needs is missing', () => {
        expect.assertions(4);
        try {
            resolveOwnerForScope('organization', ctxOf({}));
        } catch (error) {
            expect(error.output.statusCode).toBe(400);
            expect(error.data.details.field).toBe('x-frigg-apporgid');
        }
        try {
            resolveOwnerForScope('individual', ctxOf({ individual: null, org: { id: 17 } }));
        } catch (error) {
            expect(error.output.statusCode).toBe(400);
            expect(error.data.details.field).toBe('x-frigg-appuserid');
        }
    });

    it('refuses global with a clear error', () => {
        expect.assertions(2);
        try {
            resolveOwnerForScope('global', ctxOf({ org: { id: 17 } }));
        } catch (error) {
            expect(error.output.statusCode).toBe(403);
            expect(error.message).toMatch(/app owner through admin routes/);
        }
    });
});

describe('integrationOwnerKind (§3 table, §3.3)', () => {
    it.each([
        [['individual'], 'individual'],
        [['individual', 'individual'], 'individual'],
        [['organization'], 'organization'],
        [['organization', 'organization'], 'organization'],
        // Mixed: derived as the person. ResolveIntegrationOwnership then refuses it.
        [['organization', 'individual'], 'individual'],
        [[], 'individual'],
    ])('%j -> %s', (scopes, owner) => {
        expect(integrationOwnerKind(scopes)).toBe(owner);
    });

    it('lets an explicit rule override the derivation', () => {
        expect(integrationOwnerKind(['organization'], 'individual')).toBe('individual');
        expect(integrationOwnerKind(['individual'], 'organization')).toBe('organization');
        expect(integrationOwnerKind(['organization'], 'derive')).toBe('organization');
    });

    it('resolveIntegrationOwner pairs the integration with the active organization', () => {
        expect(resolveIntegrationOwner('individual', ctxOf({ org: { id: 17 } }))).toEqual({
            ownerId: '7',
            organizationId: '17',
        });
        expect(resolveIntegrationOwner('organization', ctxOf({ org: { id: 17 } }))).toEqual({
            ownerId: '17',
            organizationId: '17',
        });
        expect(() => resolveIntegrationOwner('organization', ctxOf({}))).toThrow(/no active organization/);
        expect(() => resolveIntegrationOwner('individual', ctxOf({ individual: null }))).toThrow(/no individual user/);
    });
});

describe('visibilityClauses (§3.6 list rule and legacy rows)', () => {
    const active = { org: { id: 17 } };

    it('active organization: its own rows, plus the caller in that organization', () => {
        expect(visibilityClauses(ctxOf(active), 'entity')).toEqual([
            { userId: '17', organizationId: '17' },
            { userId: '17', organizationId: null },
            { userId: '7', organizationId: '17' },
        ]);
    });

    it('no active organization: the caller rows that have none, as before scoping', () => {
        expect(visibilityClauses(ctxOf({}), 'entity')).toEqual([
            { userId: '7', organizationId: null },
        ]);
    });

    it("'all' adds the caller's organization-independent entities, only for entities", () => {
        expect(visibilityClauses(ctxOf(active, 'all'), 'entity')).toContainEqual({
            userId: '7',
            organizationId: null,
        });
        // An integration always belongs to the organization it was created in.
        expect(visibilityClauses(ctxOf(active, 'all'), 'integration')).not.toContainEqual({
            userId: '7',
            organizationId: null,
        });
    });

    it('legacy: unscoped individual rows show in the legacy organization of the person, and only there', () => {
        const inLegacyOrg = ctxOf({ individual: { id: '7', organizationId: '17' }, org: { id: 17 } });
        expect(visibilityClauses(inLegacyOrg, 'entity')).toContainEqual({ userId: '7', organizationId: null });
        expect(visibilityClauses(inLegacyOrg, 'integration')).toContainEqual({ userId: '7', organizationId: null });

        const inOtherOrg = ctxOf({ individual: { id: '7', organizationId: '99' }, org: { id: 17 } });
        expect(visibilityClauses(inOtherOrg, 'entity')).not.toContainEqual({ userId: '7', organizationId: null });
        const noPointer = ctxOf({ individual: { id: '7', organizationId: null }, org: { id: 17 } });
        expect(visibilityClauses(noPointer, 'entity')).not.toContainEqual({ userId: '7', organizationId: null });
    });

    it('legacy: organization-owned unscoped rows belong to their owner', () => {
        expect(visibilityClauses(ctxOf(active), 'entity')).toContainEqual({
            userId: '17',
            organizationId: null,
        });
    });

    it('an organization-primary request with no individual sees only the organization', () => {
        expect(
            visibilityClauses(ctxOf({ individual: null, org: { id: 17 }, primary: 'organization' }), 'entity')
        ).toEqual([
            { userId: '17', organizationId: '17' },
            { userId: '17', organizationId: null },
        ]);
    });
});

describe('describeRecord: the list and the access check agree (§3.4)', () => {
    const active = { org: { id: 17 } };
    const row = (userId, organizationId, extra = {}) => ({ id: 'x', userId, organizationId, ...extra });

    it('the caller individual entity in the active organization: manage', () => {
        expect(describeRecord(row('7', '17'), ctxOf(active), 'entity')).toEqual({
            scope: 'individual',
            owner: { type: 'individual', id: '7' },
            organizationId: '17',
            access: 'manage',
        });
    });

    it('an organization entity: scope organization, owner the organization', () => {
        expect(describeRecord(row('17', '17'), ctxOf(active), 'entity')).toEqual({
            scope: 'organization',
            owner: { type: 'organization', id: '17' },
            organizationId: '17',
            access: 'manage',
        });
    });

    it("never shows the caller's entity paired with another organization", () => {
        expect(describeRecord(row('7', '99'), ctxOf(active), 'entity')).toBeNull();
        expect(describeRecord(row('7', '99'), ctxOf({}), 'entity')).toBeNull();
    });

    it("never shows somebody else's entity, in or out of the active organization", () => {
        expect(describeRecord(row('8', '17'), ctxOf(active), 'entity')).toBeNull();
        expect(describeRecord(row('8', null), ctxOf({}), 'entity')).toBeNull();
    });

    it('never shows another organization entity', () => {
        expect(describeRecord(row('99', '99'), ctxOf(active), 'entity')).toBeNull();
    });

    it('never describes a global entity to a tenant', () => {
        expect(describeRecord(row(null, null), ctxOf(active), 'entity')).toBeNull();
        expect(describeRecord(row(undefined, undefined), ctxOf({}), 'entity')).toBeNull();
    });

    it("'all': an organization-independent individual entity shows in every organization, and only that one", () => {
        for (const org of [17, 18]) {
            expect(describeRecord(row('7', null), ctxOf({ org: { id: org } }, 'all'), 'entity')).toMatchObject({
                scope: 'individual',
                organizationId: null,
            });
        }
        // Not under the default, unless it is the legacy organization.
        expect(describeRecord(row('7', null), ctxOf(active), 'entity')).toBeNull();
        // Somebody else's, still not visible.
        expect(describeRecord(row('8', null), ctxOf(active, 'all'), 'entity')).toBeNull();
    });

    it("'all' does not apply to integrations", () => {
        expect(describeRecord(row('7', null), ctxOf(active, 'all'), 'integration')).toBeNull();
    });

    it('legacy rows keep behaving as they did: an app with no organizations sees its null-org entities', () => {
        expect(describeRecord(row('7', null), ctxOf({}), 'entity')).toMatchObject({
            scope: 'individual',
            access: 'manage',
        });
        expect(describeRecord(row('7', undefined), ctxOf({}), 'integration')).not.toBeNull();
    });

    it('legacy rows in an organization app belong to the legacy organization of the owner', () => {
        const mine = { individual: { id: '7', organizationId: '17' }, org: { id: 17 } };
        expect(describeRecord(row('7', null), ctxOf(mine), 'entity')).not.toBeNull();
        expect(describeRecord(row('7', null), ctxOf(mine), 'integration')).not.toBeNull();
        // The same person acting in a second organization does not see them.
        expect(describeRecord(row('7', null), ctxOf({ ...mine, org: { id: 18 } }), 'entity')).toBeNull();
    });

    it('legacy organization-owned rows (no organizationId) are the organization own', () => {
        expect(describeRecord(row('17', null), ctxOf(active), 'entity')).toMatchObject({
            scope: 'organization',
            organizationId: '17',
        });
    });

    it('matches what a { getId } test double has always meant: the id is the owner', () => {
        const policy = createScopePolicy();
        expect(policy.canUseEntity({ getId: () => 'u1' }, { id: 'e', userId: 'u1' })).toBe(true);
        expect(policy.canUseEntity({ getId: () => 'u1' }, { id: 'e', userId: 'u2' })).toBe(false);
    });

    it('describeRecord checks a row against the clauses the context carries, without rebuilding them', () => {
        const ctx = ctxOf({ org: { id: 17 } });
        const row = { userId: '7', organizationId: '17' };
        expect(describeRecord(row, ctx, 'entity')).not.toBeNull();
        // Same caller, but a context whose clauses say nothing is visible.
        expect(describeRecord(row, { ...ctx, clauses: { entity: [], integration: [] } }, 'entity')).toBeNull();
    });

    it('builds the clauses once per request, not once per row', () => {
        const ctx = ctxOf({ org: { id: 17 } });
        expect(visibilityClauses(ctx, 'entity')).toBe(ctx.clauses.entity);
        expect(visibilityClauses(ctx, 'entity')).toBe(visibilityClauses(ctx, 'entity'));
        const user = { getId: () => '7', getIndividualUser: jest.fn(() => ({ id: '7' })) };
        const once = accessContext(user);
        describeRecord({ userId: '7' }, once, 'entity');
        describeRecord({ userId: '7' }, once, 'entity');
        expect(user.getIndividualUser).toHaveBeenCalledTimes(1);
    });

    it('compares ids as strings: stores return numbers or strings', () => {
        expect(describeRecord(row(7, 17), ctxOf(active), 'entity')).not.toBeNull();
    });
});

describe('grantsUse: what `use` access means (§3.4, §3.5)', () => {
    it.each([
        ['use', true],
        ['manage', true],
        ['view', false],
        [undefined, false],
        [null, false],
        ['USE', false],
        ['owner', false],
    ])('%s → %s', (access, expected) => {
        expect(grantsUse(access)).toBe(expected);
    });
});

describe('pickExistingEntity (re-authorization)', () => {
    const entity = (id, organizationId) => ({ id, organizationId });

    it('prefers the entity of the same organization: the same account in two organizations is two entities', () => {
        const picked = pickExistingEntity([entity('a', '17'), entity('b', '18')], {
            scope: 'individual',
            organizationId: '18',
            legacyOrgId: null,
        });
        expect(picked.id).toBe('b');
    });

    it('finds nothing when the account was only connected in another organization', () => {
        expect(
            pickExistingEntity([entity('a', '17')], { scope: 'individual', organizationId: '18', legacyOrgId: '99' })
        ).toBeNull();
    });

    it('matches an organization-independent entity when there is no organization', () => {
        expect(
            pickExistingEntity([entity('a', null), entity('b', '17')], {
                scope: 'individual',
                organizationId: null,
            }).id
        ).toBe('a');
    });

    it('reuses a legacy unscoped individual entity only in the legacy organization', () => {
        const legacy = [entity('old', null)];
        expect(
            pickExistingEntity(legacy, { scope: 'individual', organizationId: '17', legacyOrgId: '17' }).id
        ).toBe('old');
        expect(
            pickExistingEntity(legacy, { scope: 'individual', organizationId: '17', legacyOrgId: '99' })
        ).toBeNull();
    });

    it('reuses a legacy unscoped organization entity: the owner is the organization', () => {
        expect(
            pickExistingEntity([entity('old', null)], { scope: 'organization', organizationId: '17', legacyOrgId: null }).id
        ).toBe('old');
    });

    it('prefers an exact match over a legacy row', () => {
        expect(
            pickExistingEntity([entity('old', null), entity('new', '17')], {
                scope: 'individual',
                organizationId: '17',
                legacyOrgId: '17',
            }).id
        ).toBe('new');
    });
});

describe('list filters (§3.4)', () => {
    it('filters by scope and by owner', () => {
        const mine = { scope: 'individual', owner: { type: 'individual', id: '7' } };
        const theirs = { scope: 'organization', owner: { type: 'organization', id: '17' } };
        expect(matchesListFilters(mine, {})).toBe(true);
        expect(matchesListFilters(mine, { scope: 'organization' })).toBe(false);
        expect(matchesListFilters(theirs, { owner: 'org' })).toBe(true);
        expect(matchesListFilters(theirs, { owner: 'me' })).toBe(false);
        expect(matchesListFilters(mine, { owner: 'me', scope: 'individual' })).toBe(true);
    });
});

describe('resolveScope is decideLevel then applyRequest', () => {
    it('decideLevel names the deciding level and its allow list, with no request', () => {
        expect(decideLevel({ entityType: 'organization', app: 'individual' })).toEqual({
            default: 'organization',
            allow: ['organization'],
            source: 'entityType',
        });
        expect(decideLevel({ primary: 'organization' })).toEqual({
            default: 'organization',
            allow: ['organization'],
            source: 'default',
        });
    });

    it('applyRequest changes nothing without a request and refuses an unknown scope', () => {
        const decided = decideLevel({ app: { default: 'individual', allow: ['individual', 'organization'] } });
        expect(applyRequest(decided, undefined)).toMatchObject({ scope: 'individual', source: 'app' });
        expect(applyRequest(decided, 'organization')).toMatchObject({ scope: 'organization', source: 'request', decidedBy: 'app' });
        expect(() => applyRequest(decided, 'team')).toThrow(/scope must be one of/);
    });
});

describe('createScopePolicy', () => {
    const registry = new Map([
        ['google', { settings: { scope: 'individual' } }],
        ['xero', { settings: { scope: { default: 'organization', allow: ['organization', 'individual'] } } }],
        ['plain', { settings: {} }],
    ]);

    it('resolves the owner from the registry scope, not from user.primary', () => {
        const policy = createScopePolicy({ entityTypeRegistry: registry });
        const caller = user({ org: { id: 17 }, primary: 'organization' });
        expect(policy.resolveOwnership({ entityType: 'google', user: caller })).toMatchObject({
            scope: 'individual',
            ownerId: '7',
            organizationId: '17',
        });
        expect(policy.resolveOwnership({ entityType: 'xero', user: user({ org: { id: 17 } }) })).toMatchObject({
            scope: 'organization',
            ownerId: '17',
        });
    });

    it('lets the request choose what the registry allows, and no more', () => {
        const policy = createScopePolicy({ entityTypeRegistry: registry });
        const caller = user({ org: { id: 17 } });
        expect(
            policy.resolveOwnership({ entityType: 'xero', requestScope: 'individual', user: caller })
        ).toMatchObject({ scope: 'individual', ownerId: '7', source: 'request' });
        expect(() =>
            policy.resolveOwnership({ entityType: 'google', requestScope: 'organization', user: caller })
        ).toThrow(/not allowed/);
    });

    it('falls back to the app level, then to user.primary', () => {
        const withApp = createScopePolicy({
            ownership: { scope: 'organization' },
            entityTypeRegistry: registry,
        });
        expect(withApp.resolveScope({ entityType: 'plain', user: user() })).toMatchObject({
            scope: 'organization',
            source: 'app',
        });
        const bare = createScopePolicy({ entityTypeRegistry: registry });
        expect(bare.resolveScope({ entityType: 'plain', user: user() })).toMatchObject({
            scope: 'individual',
            source: 'default',
        });
        expect(bare.resolveScope({ entityType: 'plain', user: user({ primary: 'organization' }) })).toMatchObject({
            scope: 'organization',
            source: 'default',
        });
    });

    it('carries individualAcross into the access context and the ownership', () => {
        const policy = createScopePolicy({ ownership: { individualAcross: 'all' } });
        expect(policy.individualAcross).toBe('all');
        expect(
            policy.resolveOwnership({ entityType: 'google', user: user({ org: { id: 17 } }) })
        ).toMatchObject({ organizationId: null });
    });

    it('refuses an unknown individualAcross', () => {
        expect(() => createScopePolicy({ ownership: { individualAcross: 'x' } })).toThrow(OwnershipConfigError);
    });

    it('lets a pre-resolved app config (as loadAppDefinition returns it) be passed back in', () => {
        const resolved = resolveOwnershipConfig(
            { ownership: { scope: { default: 'organization', allow: ['organization', 'individual'] } }, integrations: [] },
            new Map()
        );
        const policy = createScopePolicy({ ownership: resolved });
        expect(policy.resolveScope({ entityType: 'x', user: user(), requestScope: 'individual' }).scope).toBe(
            'individual'
        );
    });
});

describe('organization roles (ADR-056 §3 permissions)', () => {
    const member = { authSource: 'adopter-jwt', role: 'MEMBER' };

    describe('canManageOrganization: a missing role never means admin', () => {
        it.each([
            ['shared-secret', null, true],
            ['shared-secret', 'MEMBER', true],
            ['adopter-jwt', 'ADMIN', true],
            ['adopter-jwt', 'admin', true],
            ['adopter-jwt', 'MEMBER', false],
            ['adopter-jwt', null, false],
            ['adopter-jwt', '', false],
            ['bearer-token', null, false],
            ['bearer-token', 'ADMIN', true],
            [null, null, false],
            [null, 'ADMIN', true],
        ])('source %s, role %s -> %s', (authSource, orgRole, expected) => {
            expect(canManageOrganization({ authSource, orgRole })).toBe(expected);
        });

        it('takes the configured admin roles, case-insensitively, and ADMIN stops being special', () => {
            expect(canManageOrganization({ authSource: 'adopter-jwt', orgRole: 'Owner' }, ['owner', 'billing'])).toBe(true);
            expect(canManageOrganization({ authSource: 'adopter-jwt', orgRole: 'ADMIN' }, ['owner'])).toBe(false);
        });
    });

    it('a token without a role claim is a MEMBER: it cannot connect an organization-level account', () => {
        for (const options of [{ authSource: 'adopter-jwt' }, { authSource: 'bearer-token' }, member]) {
            expect(() => resolveOwnerForScope('organization', ctxOf({ org: { id: 17 }, ...options }))).toThrow(
                /organization admin/
            );
        }
        try {
            resolveOwnerForScope('organization', ctxOf({ org: { id: 17 }, ...member }));
        } catch (error) {
            expect(error.output.statusCode).toBe(403);
            expect(error.data.code).toBe('ORG_ADMIN_REQUIRED');
        }
    });

    it('an admin token, a configured admin role and a shared-secret caller may', () => {
        const owner = (options, roles) =>
            resolveOwnerForScope('organization', ctxOf({ org: { id: 17 }, ...options }, undefined, roles)).ownerId;
        expect(owner({ authSource: 'adopter-jwt', role: 'ADMIN' })).toBe('17');
        expect(owner({ authSource: 'adopter-jwt', role: 'owner' }, ['OWNER'])).toBe('17');
        expect(owner({ authSource: 'shared-secret' })).toBe('17');
    });

    it('a member still manages their own individual entity', () => {
        expect(resolveOwnerForScope('individual', ctxOf({ org: { id: 17 }, ...member })).ownerId).toBe('7');
    });

    it('an organization-owned integration needs an admin too', () => {
        expect(() => resolveIntegrationOwner('organization', ctxOf({ org: { id: 17 }, ...member }))).toThrow(
            /organization admin/
        );
        expect(resolveIntegrationOwner('organization', ctxOf({ org: { id: 17 }, authSource: 'adopter-jwt', role: 'ADMIN' }))).toEqual({
            ownerId: '17',
            organizationId: '17',
        });
        // The person's own integration does not.
        expect(resolveIntegrationOwner('individual', ctxOf({ org: { id: 17 }, ...member })).ownerId).toBe('7');
    });

    it('describeRecord: a member may use the organization entity and manage their own', () => {
        const ctx = ctxOf({ org: { id: 17 }, ...member });
        expect(describeRecord({ id: 'x', userId: '17', organizationId: '17' }, ctx, 'entity').access).toBe('use');
        expect(describeRecord({ id: 'g', userId: '7', organizationId: '17' }, ctx, 'entity').access).toBe('manage');
        const admin = ctxOf({ org: { id: 17 }, authSource: 'adopter-jwt', role: 'ADMIN' });
        expect(describeRecord({ id: 'x', userId: '17', organizationId: '17' }, admin, 'entity').access).toBe('manage');
    });

    it('accessToOwner: a record without an organization of its own (a credential)', () => {
        const ctx = ctxOf({ org: { id: 17 }, ...member });
        expect(accessToOwner('7', ctx)).toBe('manage');
        expect(accessToOwner('17', ctx)).toBe('use');
        expect(accessToOwner('99', ctx)).toBeNull();
        expect(accessToOwner(undefined, ctx)).toBeNull();
        expect(accessToOwner('17', ctxOf({ org: { id: 17 } }))).toBe('manage');
    });

    describe('user.orgAdminRoles', () => {
        const config = (orgAdminRoles) => resolveOwnershipConfig({ integrations: [], user: { orgAdminRoles } }, new Map());

        it('defaults to ADMIN and is returned with the app config', () => {
            expect(resolveOwnershipConfig({ integrations: [] }, new Map()).orgAdminRoles).toEqual(['ADMIN']);
            expect(config(['owner', 'billing']).orgAdminRoles).toEqual(['owner', 'billing']);
        });

        it.each([[[]], [['']], [['ADMIN', 3]], [[' ']], ['ADMIN'], [{}]])('rejects %j at load', (roles) => {
            expect(() => config(roles)).toThrow(OwnershipConfigError);
            expect(() => config(roles)).toThrow(/orgAdminRoles/);
        });

        it('the policy applies the configured roles', () => {
            const policy = createScopePolicy({ ownership: { scope: 'organization', orgAdminRoles: ['owner'] } });
            const ownerToken = user({ org: { id: 17 }, authSource: 'adopter-jwt', role: 'OWNER' });
            const adminToken = user({ org: { id: 17 }, authSource: 'adopter-jwt', role: 'ADMIN' });
            expect(policy.resolveOwnership({ entityType: 'x', requestScope: 'organization', user: ownerToken }).ownerId).toBe('17');
            expect(() => policy.resolveOwnership({ entityType: 'x', requestScope: 'organization', user: adminToken })).toThrow(
                /organization admin/
            );
            expect(policy.accessToOwnedBy(ownerToken, '17')).toBe('manage');
            expect(policy.accessToOwnedBy(adminToken, '17')).toBe('use');
        });
    });
});

describe('assertCanManage', () => {
    const { assertCanManage } = require('./use-cases/manage-access');
    it('only manage passes: use, no access and a missing access are all 403', () => {
        expect(() => assertCanManage('manage', 'x')).not.toThrow();
        for (const access of ['use', null, undefined]) {
            expect(() => assertCanManage(access, 'x')).toThrow(/not change or delete/);
        }
    });
});
