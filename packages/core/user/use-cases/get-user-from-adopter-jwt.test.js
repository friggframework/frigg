/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and reason codes are snake_case by spec */
const jose = require('jose');
const { GetUserFromAdopterJwt } = require('./get-user-from-adopter-jwt');
const { createMemorySink } = require('../../logs');
const {
    createKeys,
    signToken,
    unsignedToken,
    createUserRepositoryDouble,
} = require('../tests/doubles/adopter-jwt-fixtures');

const ISS = 'https://login.example.com/';
const AUD = 'frigg-api';

describe('GetUserFromAdopterJwt (ADR-056 §2)', () => {
    let keys;
    let repo;

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

    const build = (config = userConfig(), keySource = keys.localJwks) =>
        new GetUserFromAdopterJwt({
            userRepository: repo,
            userConfig: config,
            keySource,
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
    });

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

        it('does not check iss or aud when they are not configured', async () => {
            const config = userConfig({
                jwtConfig: { jwksUri: 'https://x.example/jwks' },
            });
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: keys.es.privateKey,
                    kid: 'es-1',
                    iss: 'anyone',
                    aud: 'anything',
                }
            );

            await expect(build(config).execute(token)).resolves.toBeDefined();
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
                    userIdClaim: 'uid',
                    orgIdClaim: 'tenant',
                },
            });
            const token = await signToken(
                { uid: 'u9', tenant: 't9' },
                { key: keys.es.privateKey, kid: 'es-1' }
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
                    roleClaim: 'r',
                },
            });
            const withRole = await signToken(
                { sub: 'u1', r: 'owner' },
                { key: keys.es.privateKey, kid: 'es-1' }
            );
            const without = await signToken(
                { sub: 'u2', org_role: 'admin' },
                { key: keys.es.privateKey, kid: 'es-1' }
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
                    clockToleranceSec: 0,
                },
            });
            const token = await signToken(
                { sub: 'u1' },
                {
                    key: keys.es.privateKey,
                    kid: 'es-1',
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
            expect(repo.linkIndividualToOrganization).toHaveBeenCalledTimes(1);
            const org = repo.state.organizationUsers.get('o1');
            const individual = repo.state.individualUsers.get('u1');
            expect(repo.linkIndividualToOrganization).toHaveBeenCalledWith(
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
            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
            expect(user.getAppUserId()).toBe('u1');
            expect(user.getAppOrgId()).toBe('o1');
            expect(repo.state.individualUsers.size).toBe(1);
            expect(repo.state.organizationUsers.size).toBe(1);
        });

        it('creates only the individual when the token has no org claim', async () => {
            await build().execute(await es({ sub: 'u1' }));

            expect(repo.createIndividualUser).toHaveBeenCalledTimes(1);
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(repo.findOrganizationUserByAppOrgId).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
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

    describe('org linking (interim, ADR-056 §3.6)', () => {
        it('links an existing individual who has no organization yet', async () => {
            repo = createUserRepositoryDouble({
                individuals: [{ id: 'ind-x', appUserId: 'u1' }],
                organizations: [{ id: 'org-x', appOrgId: 'o1' }],
            });

            const user = await build().execute(
                await es({ sub: 'u1', org_id: 'o1' })
            );

            expect(repo.createIndividualUser).not.toHaveBeenCalled();
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganization).toHaveBeenCalledTimes(1);
            expect(repo.linkIndividualToOrganization).toHaveBeenCalledWith(
                'ind-x',
                'org-x'
            );
            expect(user.getIndividualUser().organizationId).toBe('org-x');
        });

        it('does not link again when the individual is already in the named org', async () => {
            repo = createUserRepositoryDouble({
                individuals: [
                    { id: 'ind-x', appUserId: 'u1', organizationId: 'org-x' },
                ],
                organizations: [{ id: 'org-x', appOrgId: 'o1' }],
            });

            await build().execute(await es({ sub: 'u1', org_id: 'o1' }));

            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
        });

        it('compares org ids as strings, since stores return numbers or strings', async () => {
            repo = createUserRepositoryDouble({
                individuals: [
                    { id: 'ind-x', appUserId: 'u1', organizationId: '7' },
                ],
                organizations: [{ id: 7, appOrgId: 'o1' }],
            });

            await expect(
                build().execute(await es({ sub: 'u1', org_id: 'o1' }))
            ).resolves.toBeDefined();
            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
        });

        it('refuses 403 multi_org_unsupported, naming ADR-056 §3.6, when the individual is in a different org', async () => {
            repo = createUserRepositoryDouble({
                individuals: [
                    { id: 'ind-x', appUserId: 'u1', organizationId: 'org-a' },
                ],
                organizations: [
                    { id: 'org-a', appOrgId: 'oA' },
                    { id: 'org-b', appOrgId: 'oB' },
                ],
            });

            const { status, reason, error } = await reasonOf(
                build().execute(await es({ sub: 'u1', org_id: 'oB' }))
            );

            expect(status).toBe(403);
            expect(reason).toBe('multi_org_unsupported');
            expect(error.message).toContain('ADR-056 §3.6');
            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
            expect(repo.state.individualUsers.get('u1').organizationId).toBe(
                'org-a'
            );
        });

        it('refuses without creating an org when the named org does not exist yet', async () => {
            repo = createUserRepositoryDouble({
                individuals: [
                    { id: 'ind-x', appUserId: 'u1', organizationId: 'org-a' },
                ],
                organizations: [{ id: 'org-a', appOrgId: 'oA' }],
            });

            const { reason } = await reasonOf(
                build().execute(await es({ sub: 'u1', org_id: 'brand-new' }))
            );

            expect(reason).toBe('multi_org_unsupported');
            expect(repo.createOrganizationUser).not.toHaveBeenCalled();
            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
            expect(repo.state.organizationUsers.has('brand-new')).toBe(false);
        });

        it('lets an individual in an org authenticate with no org claim, unchanged', async () => {
            repo = createUserRepositoryDouble({
                individuals: [
                    { id: 'ind-x', appUserId: 'u1', organizationId: 'org-a' },
                ],
                organizations: [{ id: 'org-a', appOrgId: 'oA' }],
            });

            const user = await build().execute(await es({ sub: 'u1' }));

            expect(user.getAppUserId()).toBe('u1');
            expect(repo.linkIndividualToOrganization).not.toHaveBeenCalled();
        });
    });
});
