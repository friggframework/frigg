/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and reason codes are snake_case by spec */
const jose = require('jose');
const {
    GetUserFromAdopterJwt,
} = require('../../use-cases/get-user-from-adopter-jwt');
const {
    EnsureOrganizationMembership,
} = require('../../use-cases/ensure-organization-membership');
const { createMemorySink } = require('../../../logs');
const {
    createKeys,
    signToken,
    unsignedToken,
    createUserRepositoryDouble,
    createMembershipRepositoryDouble,
} = require('../doubles/adopter-jwt-fixtures');
const { createAdopterTokenVerifier } = require('../../adopter-token-verifier');

const ISS = 'https://login.example.com/';
const AUD = 'frigg-api';

describe('GetUserFromAdopterJwt (ADR-056 §2)', () => {
    let keys;
    let repo;
    let memberships;

    const userConfig = (overrides = {}) => ({
        usePassword: false,
        primary: 'organization',
        individualUserRequired: true,
        organizationUserRequired: true,
        authModes: { adopterJwt: true },
        jwtConfig: {
            jwksUri: 'https://login.example.com/jwks.json',
            issuer: ISS,
            audience: AUD,
        },
        ...overrides,
    });

    // `keySource` null means "derive the key from jwtConfig" (HMAC secret).
    const build = (config = userConfig(), keySource = keys.localJwks) =>
        new GetUserFromAdopterJwt({
            userRepository: repo,
            ensureOrganizationMembership: new EnsureOrganizationMembership({
                userRepository: repo,
                organizationMembershipRepository: memberships,
            }),
            userConfig: config,
            tokenVerifier: createAdopterTokenVerifier({
                jwtConfig: config.jwtConfig,
                keySource: keySource ?? undefined,
            }),
        });

    const es = (claims, opts = {}) =>
        signToken(claims, {
            key: keys.es.privateKey,
            kid: 'es-1',
            iss: ISS,
            aud: AUD,
            ...opts,
        });

    const reasonOf = async (promise) => {
        try {
            await promise;
        } catch (error) {
            expect(error.isBoom).toBe(true);
            return {
                status: error.output.statusCode,
                reason: error.data?.reason,
                error,
            };
        }
        throw new Error('expected a rejection');
    };

    beforeAll(async () => {
        keys = await createKeys();
    });

    beforeEach(() => {
        repo = createUserRepositoryDouble();
        memberships = createMembershipRepositoryDouble();
    });

    // Re-seed both doubles together: the membership double reads the legacy
    // pointer from the user double's state.
    const seed = (options) => {
        repo = createUserRepositoryDouble(options);
        memberships = createMembershipRepositoryDouble();
    };

    describe('verification', () => {
        it('accepts an ES256 token verified against a JWKS', async () => {
            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'o1' })
            );

            expect(user.getAppUserId()).toBe('u1');
            expect(user.getAppOrgId()).toBe('o1');
        });

        it('accepts an RS256 token verified against the same JWKS', async () => {
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: keys.rs.privateKey,
                    alg: 'RS256',
                    kid: 'rs-1',
                    iss: ISS,
                    aud: AUD,
                }
            );

            const user = await build().execute(token);

            expect(user.getAppUserId()).toBe('u1');
        });

        it('accepts an HS256 token verified with a shared secret', async () => {
            const config = userConfig({
                jwtConfig: { secret: keys.hmacSecret },
            });
            const token = await signToken(
                { sub: 'u1' },
                { key: new TextEncoder().encode(keys.hmacSecret), alg: 'HS256' }
            );

            const user = await build(config, null).execute(token);

            expect(user.getAppUserId()).toBe('u1');
        });

        it('does not check iss or aud in HMAC mode when they are not configured', async () => {
            const config = userConfig({
                jwtConfig: { secret: keys.hmacSecret },
            });
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: new TextEncoder().encode(keys.hmacSecret),
                    alg: 'HS256',
                    iss: 'anyone',
                    aud: 'anything',
                }
            );

            await expect(
                build(config, null).execute(token)
            ).resolves.toBeDefined();
        });

        it('accepts any one audience of a configured list', async () => {
            const config = userConfig({
                jwtConfig: {
                    jwksUri: 'https://x.example/jwks',
                    issuer: ISS,
                    audience: ['other', AUD],
                },
            });

            await expect(
                build(config).execute(await es({ sub: 'u1' }))
            ).resolves.toBeDefined();
        });

        it('honours a custom userIdClaim and orgIdClaim', async () => {
            const config = userConfig({
                jwtConfig: {
                    jwksUri: 'https://x.example/jwks',
                    audience: AUD,
                    userIdClaim: 'uid',
                    orgIdClaim: 'tenant',
                },
            });
            const token = await signToken(
                { uid: 'u9', tenant: 't9' },
                { key: keys.es.privateKey, kid: 'es-1', aud: AUD }
            );

            const user = await build(config).execute(token);

            expect(user.getAppUserId()).toBe('u9');
            expect(user.getAppOrgId()).toBe('t9');
        });

        it('exposes the role claim on the user without persisting it', async () => {
            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'o1', org_role: 'admin' })
            );

            expect(user.getOrgRole()).toBe('admin');
            for (const call of [
                ...repo.createIndividualUser.mock.calls,
                ...repo.createOrganizationUser.mock.calls,
            ]) {
                expect(JSON.stringify(call)).not.toContain('admin');
            }
        });

        it('reads the role from a custom roleClaim, and is null when absent', async () => {
            const config = userConfig({
                jwtConfig: {
                    jwksUri: 'https://x.example/jwks',
                    audience: AUD,
                    roleClaim: 'r',
                },
            });
            const withRole = await signToken(
                { sub: 'u1', r: 'owner' },
                { key: keys.es.privateKey, kid: 'es-1', aud: AUD }
            );
            const without = await signToken(
                { sub: 'u2', org_role: 'admin' },
                { key: keys.es.privateKey, kid: 'es-1', aud: AUD }
            );

            expect((await build(config).execute(withRole)).getOrgRole()).toBe(
                'owner'
            );
            expect(
                (await build(config).execute(without)).getOrgRole()
            ).toBeNull();
        });

        it('accepts a token that expired inside the clock tolerance, and refuses one outside it', async () => {
            const justExpired = await es(
                { sub: 'u1' },
                { exp: Math.floor(Date.now() / 1000) - 10 }
            );
            const longExpired = await es(
                { sub: 'u1' },
                { exp: Math.floor(Date.now() / 1000) - 120 }
            );

            await expect(build().execute(justExpired)).resolves.toBeDefined();
            expect((await reasonOf(build().execute(longExpired))).reason).toBe(
                'token_expired'
            );
        });

        it('applies a configured clockToleranceSec of 0 strictly', async () => {
            const config = userConfig({
                jwtConfig: {
                    jwksUri: 'https://x.example/jwks',
                    audience: AUD,
                    clockToleranceSec: 0,
                },
            });
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: keys.es.privateKey,
                    kid: 'es-1',
                    aud: AUD,
                    exp: Math.floor(Date.now() / 1000) - 5,
                }
            );

            expect((await reasonOf(build(config).execute(token))).reason).toBe(
                'token_expired'
            );
        });
    });

    describe('rejections: 401 with a stable reason', () => {
        const cases = {
            token_expired: () =>
                es(
                    { sub: 'u1' },
                    { exp: Math.floor(Date.now() / 1000) - 3600 }
                ),
            token_invalid_signature: () =>
                signToken(
                    { sub: 'u1' },
                    {
                        key: keys.attacker.privateKey,
                        kid: 'es-1',
                        iss: ISS,
                        aud: AUD,
                    }
                ),
            token_wrong_issuer: () =>
                es({ sub: 'u1' }, { iss: 'https://evil.example/' }),
            token_wrong_audience: () =>
                es({ sub: 'u1' }, { aud: 'someone-else' }),
            token_missing_user_claim: () => es({ org_id: 'o1' }),
            token_malformed: () => Promise.resolve('not.a.jwt'),
        };

        it.each(Object.entries(cases))('%s', async (reason, makeToken) => {
            const { status, reason: actual } = await reasonOf(
                build().execute(await makeToken())
            );

            expect(status).toBe(401);
            expect(actual).toBe(reason);
        });

        it('rejects a token whose iss is missing when an issuer is configured', async () => {
            const token = await signToken(
                { sub: 'u1' },
                { key: keys.es.privateKey, kid: 'es-1', aud: AUD }
            );

            expect((await reasonOf(build().execute(token))).reason).toBe(
                'token_wrong_issuer'
            );
        });

        it('rejects a token whose aud is missing when an audience is configured', async () => {
            const token = await signToken(
                { sub: 'u1' },
                { key: keys.es.privateKey, kid: 'es-1', iss: ISS }
            );

            expect((await reasonOf(build().execute(token))).reason).toBe(
                'token_wrong_audience'
            );
        });

        it('rejects a token that is not yet valid', async () => {
            const token = await es(
                { sub: 'u1' },
                { nbf: Math.floor(Date.now() / 1000) + 3600 }
            );

            expect((await reasonOf(build().execute(token))).reason).toBe(
                'token_not_yet_valid'
            );
        });

        it('rejects a token with no exp, however well signed', async () => {
            const { status, reason } = await reasonOf(
                build().execute(await es({ sub: 'u1' }, { exp: null }))
            );

            expect(status).toBe(401);
            expect(reason).toBe('token_malformed');
        });

        it('rejects a token whose user claim is not a usable id', async () => {
            for (const sub of ['', '   ', {}, [], true]) {
                const { reason } = await reasonOf(
                    build().execute(await es({ sub }))
                );
                expect(reason).toBe('token_missing_user_claim');
            }
        });

        it('rejects an org claim of an unusable type rather than ignoring it', async () => {
            const { reason } = await reasonOf(
                build().execute(await es({ sub: 'u1', org_id: { id: 'o1' } }))
            );

            expect(reason).toBe('token_malformed');
            expect(repo.createIndividualUser).not.toHaveBeenCalled();
        });

        it('rejects a token signed with a kid the JWKS does not hold', async () => {
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: keys.es.privateKey,
                    kid: 'unknown-kid',
                    iss: ISS,
                    aud: AUD,
                }
            );

            const { reason } = await reasonOf(build().execute(token));

            expect(reason).toBe('token_invalid_signature');
        });

        it('rejects an HS256 token when only ES256 is allowed (algorithm confusion)', async () => {
            // The classic attack: sign with HMAC, using the public key's bytes as the secret.
            const publicJwk = keys.publicJwks.keys[0];
            const forged = await signToken(
                { sub: 'admin' },
                {
                    key: new TextEncoder().encode(JSON.stringify(publicJwk)),
                    alg: 'HS256',
                    kid: 'es-1',
                    iss: ISS,
                    aud: AUD,
                }
            );
            const config = userConfig({
                jwtConfig: {
                    jwksUri: 'https://x.example/jwks',
                    audience: AUD,
                    algorithms: ['ES256'],
                },
            });

            const { status, reason } = await reasonOf(
                build(config).execute(forged)
            );

            expect(status).toBe(401);
            expect(reason).toBe('token_invalid_signature');
            expect(repo.createIndividualUser).not.toHaveBeenCalled();
        });

        it('rejects an RS256 token when only ES256 is allowed', async () => {
            const config = userConfig({
                jwtConfig: {
                    jwksUri: 'https://x.example/jwks',
                    audience: AUD,
                    algorithms: ['ES256'],
                },
            });
            const token = await signToken(
                { sub: 'u1' },
                { key: keys.rs.privateKey, alg: 'RS256', kid: 'rs-1' }
            );

            expect((await reasonOf(build(config).execute(token))).reason).toBe(
                'token_invalid_signature'
            );
        });

        it('rejects alg: none', async () => {
            const { status, reason } = await reasonOf(
                build().execute(unsignedToken({ sub: 'u1', org_id: 'o1' }))
            );

            expect(status).toBe(401);
            expect(reason).toBe('token_invalid_signature');
            expect(repo.createIndividualUser).not.toHaveBeenCalled();
        });

        it('rejects alg: none even when "none" is the only thing the attacker controls and the secret mode is on', async () => {
            const config = userConfig({
                jwtConfig: { secret: keys.hmacSecret },
            });

            const { reason } = await reasonOf(
                build(config, null).execute(unsignedToken({ sub: 'u1' }))
            );

            expect(reason).toBe('token_invalid_signature');
        });

        it('rejects an HS256 token with the wrong secret', async () => {
            const config = userConfig({
                jwtConfig: { secret: keys.hmacSecret },
            });
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: new TextEncoder().encode(
                        'some-other-secret-of-sufficient-length'
                    ),
                    alg: 'HS256',
                }
            );

            expect(
                (await reasonOf(build(config, null).execute(token))).reason
            ).toBe('token_invalid_signature');
        });

        it('rejects non-string and empty tokens as malformed', async () => {
            for (const token of ['', undefined, null, 42]) {
                const { status, reason } = await reasonOf(
                    build().execute(token)
                );
                expect(status).toBe(401);
                expect(reason).toBe('token_malformed');
            }
        });

        it('never puts the token or its claims in the message, data or the log', async () => {
            const sink = createMemorySink();
            const secretClaim = 'claim-value-that-must-not-leak';
            const token = await es(
                { sub: secretClaim, email: secretClaim },
                { iss: 'https://evil.example/' }
            );

            const { error } = await reasonOf(build().execute(token));

            const everything = JSON.stringify({
                message: error.message,
                data: error.data,
                payload: error.output.payload,
                logs: sink.records,
            });
            expect(everything).not.toContain(secretClaim);
            expect(everything).not.toContain(token.split('.')[1]);
            expect(everything).not.toContain(token.split('.')[2]);
            expect(error.data).toEqual({ reason: 'token_wrong_issuer' });
        });
    });

    describe('key source failures', () => {
        it('answers 503 jwks_unavailable, not 401, when the key source cannot be read', async () => {
            const failing = async () => {
                throw new jose.errors.JWKSTimeout();
            };

            const { status, reason } = await reasonOf(
                build(userConfig(), failing).execute(await es({ sub: 'u1' }))
            );

            expect(status).toBe(503);
            expect(reason).toBe('jwks_unavailable');
        });

        it('answers 500 when jwtConfig has no key source and none was injected', async () => {
            const config = userConfig({ jwtConfig: { issuer: ISS } });

            const { status, reason } = await reasonOf(
                build(config, null).execute(await es({ sub: 'u1' }))
            );

            expect(status).toBe(500);
            expect(reason).toBe('jwt_config_invalid');
        });
    });

    describe('find or create', () => {
        it('creates a new person and a new org once, and links them', async () => {
            const token = await es({ sub: 'u1', org_id: 'o1' });

            const user = await build().execute(token);

            expect(repo.createIndividualUser).toHaveBeenCalledTimes(1);
            expect(repo.createIndividualUser).toHaveBeenCalledWith({
                appUserId: 'u1',
                username: 'app-user-u1',
                email: 'u1@app.local',
            });
            expect(repo.createOrganizationUser).toHaveBeenCalledTimes(1);
            expect(repo.createOrganizationUser).toHaveBeenCalledWith({
                appOrgId: 'o1',
            });
            expect(repo.linkIndividualToOrganizationIfUnset).toHaveBeenCalledTimes(1);
            const org = repo.state.organizationUsers.get('o1');
            const individual = repo.state.individualUsers.get('u1');
            expect(repo.linkIndividualToOrganizationIfUnset).toHaveBeenCalledWith(
                individual.id,
                org.id
            );
            expect(user.getOrganizationUser().id).toBe(org.id);
            expect(user.getIndividualUser().organizationId).toBe(org.id);
        });

        it('creates nothing on a second call with the same token', async () => {
            const token = await es({ sub: 'u1', org_id: 'o1' });
            await build().execute(token);
            jest.clearAllMocks();

            const user = await build().execute(token);

            expect(repo.createIndividualUser).not.toHaveBeenCalled();
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganizationIfUnset).not.toHaveBeenCalled();
            expect(user.getAppUserId()).toBe('u1');
            expect(user.getAppOrgId()).toBe('o1');
            expect(repo.state.individualUsers.size).toBe(1);
            expect(repo.state.organizationUsers.size).toBe(1);
        });

        it('turns a numeric org claim into a string app org id', async () => {
            await build().execute(await es({ sub: 'u1', org_id: 42 }));

            expect(repo.findOrganizationUserByAppOrgId).toHaveBeenCalledWith(
                '42'
            );
            expect(repo.createOrganizationUser).toHaveBeenCalledWith({
                appOrgId: '42',
            });
        });

        it('turns a numeric user claim into a string app user id', async () => {
            await build().execute(await es({ sub: 7 }));

            expect(repo.createIndividualUser).toHaveBeenCalledWith(
                expect.objectContaining({ appUserId: '7' })
            );
        });

        it('creates only the individual when the token has no org claim', async () => {
            await build().execute(await es({ sub: 'u1' }));

            expect(repo.createIndividualUser).toHaveBeenCalledTimes(1);
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(repo.findOrganizationUserByAppOrgId).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganizationIfUnset).not.toHaveBeenCalled();
        });

        it('ignores the org claim when organizationUserRequired is not set, as x-frigg headers do', async () => {
            const config = userConfig({ organizationUserRequired: false });

            const user = await build(config).execute(
                await es({ sub: 'u1', org_id: 'o1' })
            );

            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(user.getOrganizationUser()).toBeNull();
        });

        it('skips the individual when individualUserRequired is false', async () => {
            const config = userConfig({ individualUserRequired: false });

            await build(config).execute(await es({ sub: 'u1', org_id: 'o1' }));

            expect(repo.findIndividualUserByAppUserId).not.toHaveBeenCalled();
            expect(repo.createIndividualUser).not.toHaveBeenCalled();
            expect(repo.createOrganizationUser).toHaveBeenCalledTimes(1);
        });

        it('builds the User with the same constructor arguments as GetUserFromXFriggHeaders', async () => {
            const config = userConfig({
                usePassword: false,
                primary: 'organization',
                individualUserRequired: true,
                organizationUserRequired: true,
            });

            const user = await build(config).execute(
                await es({ sub: 'u1', org_id: 'o1' })
            );

            expect(user.config).toEqual({
                primary: 'organization',
                individualUserRequired: true,
                organizationUserRequired: true,
            });
            expect(user.usePassword).toBe(false);
            expect(user.getId()).toBe(user.getOrganizationUser().id);
        });
    });

    describe('organization membership (ADR-056 §3.6)', () => {
        const personInA = (extra = {}) => ({
            individuals: [
                { id: 'ind-x', appUserId: 'u1', organizationId: 'org-a' },
            ],
            organizations: [
                { id: 'org-a', appOrgId: 'oA' },
                { id: 'org-b', appOrgId: 'oB' },
            ],
            ...extra,
        });

        it('records a membership for a new person and sets the legacy pointer on that first link', async () => {
            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'o1', org_role: 'admin' })
            );

            const org = repo.state.organizationUsers.get('o1');
            const individual = repo.state.individualUsers.get('u1');
            expect(memberships.rows.size).toBe(1);
            expect(memberships.addMembership).toHaveBeenCalledWith(
                individual.id,
                org.id,
                { orgRole: 'admin' }
            );
            expect(individual.organizationId).toBe(org.id);
            expect(user.getActiveOrganizationId()).toBe(org.id);
        });

        it('links an existing individual who has no organization yet, and adds the membership', async () => {
            seed({
                individuals: [{ id: 'ind-x', appUserId: 'u1' }],
                organizations: [{ id: 'org-x', appOrgId: 'o1' }],
            });

            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'o1' })
            );

            expect(repo.createIndividualUser).not.toHaveBeenCalled();
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganizationIfUnset).toHaveBeenCalledWith(
                'ind-x',
                'org-x'
            );
            expect(memberships.addMembership).toHaveBeenCalledWith(
                'ind-x',
                'org-x',
                { orgRole: null }
            );
            expect(user.getIndividualUser().organizationId).toBe('org-x');
        });

        it('a person in A who logs in with B gets a membership in B, runs as B, and keeps organizationId = A', async () => {
            seed(personInA());

            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'oB', org_role: 'member' })
            );

            expect(user.getActiveOrganizationId()).toBe('org-b');
            expect(user.getId()).toBe('org-b'); // primary: 'organization'
            expect(user.getAppOrgId()).toBe('oB');
            expect(user.getOrgRole()).toBe('member');
            expect(repo.state.individualUsers.get('u1').organizationId).toBe(
                'org-a'
            );
            expect(repo.linkIndividualToOrganizationIfUnset).not.toHaveBeenCalled();
            // A is the legacy pointer (no row needed); B has a stored row.
            const rows = [...memberships.rows.values()];
            expect(rows.map((r) => r.organizationUserId)).toEqual(['org-b']);
            expect(rows[0].orgRole).toBe('member');
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
        });

        it('creates a brand-new organization for a person in A and never moves them out of A', async () => {
            seed(personInA());

            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'brand-new' })
            );

            expect(repo.createOrganizationUser).toHaveBeenCalledTimes(1);
            expect(user.getAppOrgId()).toBe('brand-new');
            expect(repo.state.individualUsers.get('u1').organizationId).toBe(
                'org-a'
            );
            expect(memberships.rows.size).toBe(1);
        });

        it('the same person logging in with A again runs as A and writes nothing', async () => {
            seed(personInA());
            await build().execute(await es({ sub: 'u1', org_id: 'oB' }));
            jest.clearAllMocks();

            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'oA' })
            );

            expect(user.getActiveOrganizationId()).toBe('org-a');
            expect(user.getId()).toBe('org-a');
            expect(user.getAppOrgId()).toBe('oA');
            expect(memberships.addMembership).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganizationIfUnset).not.toHaveBeenCalled();
        });

        it('treats the legacy organizationId as a membership: logging in with that org adds no row', async () => {
            seed(personInA());

            await build().execute(await es({ sub: 'u1', org_id: 'oA' }));

            expect(memberships.findMembership).toHaveBeenCalledWith(
                'ind-x',
                'org-a'
            );
            expect(memberships.addMembership).not.toHaveBeenCalled();
            expect(memberships.rows.size).toBe(0);
        });

        it('compares org ids as strings, since stores return numbers or strings', async () => {
            seed({
                individuals: [
                    { id: 'ind-x', appUserId: 'u1', organizationId: '7' },
                ],
                organizations: [{ id: 7, appOrgId: 'o1' }],
            });

            await build().execute(await es({ sub: 'u1', org_id: 'o1' }));

            expect(memberships.addMembership).not.toHaveBeenCalled();
        });

        it('lets an individual in an org authenticate with no org claim, unchanged', async () => {
            seed(personInA());

            const user = await build().execute(await es({ sub: 'u1' }));

            expect(user.getAppUserId()).toBe('u1');
            expect(user.getActiveOrganizationId()).toBeNull();
            expect(memberships.findMembership).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganizationIfUnset).not.toHaveBeenCalled();
        });

        it('no longer answers 403 multi_org_unsupported', async () => {
            seed(personInA());

            await expect(
                build().execute(await es({ sub: 'u1', org_id: 'oB' }))
            ).resolves.toBeDefined();
        });

        it('hands the use case the created users and the role claim, and builds the User from what it returns', async () => {
            const returned = { id: 'ind-stub', appUserId: 'u1' };
            const ensureOrganizationMembership = {
                execute: jest.fn(async () => ({
                    individual: returned,
                    membership: null,
                })),
            };
            const adopter = new GetUserFromAdopterJwt({
                userRepository: repo,
                ensureOrganizationMembership,
                userConfig: userConfig(),
                tokenVerifier: createAdopterTokenVerifier({
                    jwtConfig: userConfig().jwtConfig,
                    keySource: keys.localJwks,
                }),
            });

            const user = await adopter.execute(
                await es({ sub: 'u1', org_id: 'o1', org_role: 'admin' })
            );

            const call = ensureOrganizationMembership.execute.mock.calls[0][0];
            expect(call.individual.appUserId).toBe('u1');
            expect(call.organization.appOrgId).toBe('o1');
            expect(call.orgRole).toBe('admin');
            expect(user.getIndividualUser()).toBe(returned);
        });
    });

    describe('first-login races', () => {
        it('two concurrent first logins for the same new person in different orgs both succeed', async () => {
            seed({ findBarrier: 2 });
            const tokenA = await es({ sub: 'u1', org_id: 'oA' });
            const tokenB = await es({ sub: 'u1', org_id: 'oB' });

            const [userA, userB] = await Promise.all([
                build().execute(tokenA),
                build().execute(tokenB),
            ]);

            // One create won, the other hit the unique pair and found the winner.
            expect(repo.createIndividualUser).toHaveBeenCalledTimes(2);
            expect(repo.state.individualUsers.size).toBe(1);
            const individual = repo.state.individualUsers.get('u1');
            expect(userA.getIndividualUser().id).toBe(individual.id);
            expect(userB.getIndividualUser().id).toBe(individual.id);

            expect(userA.getAppOrgId()).toBe('oA');
            expect(userB.getAppOrgId()).toBe('oB');
            const orgIds = [...memberships.rows.values()]
                .map((r) => r.organizationUserId)
                .sort();
            expect(orgIds).toEqual(
                [
                    repo.state.organizationUsers.get('oA').id,
                    repo.state.organizationUsers.get('oB').id,
                ].sort()
            );
            // The legacy pointer names one of them; it is a pointer, not the truth.
            expect(orgIds).toContain(individual.organizationId);
        });

        it('two concurrent logins for the same person and org leave one membership', async () => {
            seed({
                individuals: [{ id: 'ind-x', appUserId: 'u1' }],
                organizations: [{ id: 'org-x', appOrgId: 'o1' }],
            });
            const token = await es({ sub: 'u1', org_id: 'o1' });

            await Promise.all([
                build().execute(token),
                build().execute(token),
            ]);

            expect(memberships.rows.size).toBe(1);
        });

        it('rethrows a create failure that is not a unique violation', async () => {
            repo.createIndividualUser.mockRejectedValueOnce(
                new Error('connection reset')
            );

            await expect(
                build().execute(await es({ sub: 'u1' }))
            ).rejects.toThrow('connection reset');
        });

        it('rethrows a unique violation when the winner cannot be found', async () => {
            repo.createIndividualUser.mockRejectedValueOnce(
                Object.assign(new Error('unique'), { code: 'P2002' })
            );

            await expect(
                build().execute(await es({ sub: 'u1' }))
            ).rejects.toThrow('unique');
        });

        it('does not pretend to recover from a lost organization race: appOrgId has no unique index', async () => {
            repo.createOrganizationUser.mockRejectedValueOnce(
                Object.assign(new Error('unique'), { code: 'P2002' })
            );

            await expect(
                build().execute(await es({ sub: 'u1', org_id: 'o1' }))
            ).rejects.toThrow('unique');
            expect(repo.findOrganizationUserByAppOrgId).toHaveBeenCalledTimes(1);
        });
    });
});
