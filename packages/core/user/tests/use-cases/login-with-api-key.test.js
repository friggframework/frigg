// Mock the real Module class used INSIDE ProcessAuthorizationCallback (and as
// LoginWithApiKey's default ModuleClass, which we always override with FakeModule
// anyway). This lets one test exercise the real ProcessAuthorizationCallback
// without a DB or provider. All other tests inject FakeModule and a spy PAC, so
// they never touch this mock.
jest.mock('../../../modules/module', () => ({
    Module: jest.fn().mockImplementation(({ definition }) => ({
        definition,
        credential: undefined,
        apiClass: { requesterType: 'apiKey' },
        api: {},
        testAuth: jest.fn().mockResolvedValue(true),
        apiParamsFromCredential: jest.fn().mockReturnValue({}),
        apiParamsFromEntity: jest.fn().mockReturnValue({}),
        getName: jest.fn().mockReturnValue('reevo'),
    })),
}));

const {
    LoginWithApiKey,
    classifyProviderError,
} = require('../../use-cases/login-with-api-key');
const {
    GetUserFromXFriggHeaders,
} = require('../../use-cases/get-user-from-x-frigg-headers');
const {
    CreateTokenForUserId,
} = require('../../use-cases/create-token-for-user-id');
const {
    GetUserFromBearerToken,
} = require('../../use-cases/get-user-from-bearer-token');
const { TestUserRepository } = require('../doubles/test-user-repository');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A trivial Module stand-in: the use case only needs `.api` from it; all
// validity/identity behaviour is driven by the module definition's
// requiredAuthMethods (jest fns), which is exactly how the real Module exposes
// them (Object.assign(this, definition.requiredAuthMethods)).
class FakeModule {
    constructor({ definition }) {
        this.definition = definition;
        this.api = {
            _apiKey: null,
            setApiKey(k) {
                this._apiKey = k;
            },
        };
    }
}

// An error shaped like a Requester/FetchError with an HTTP status.
function providerError(status) {
    return Object.assign(new Error('provider error'), { statusCode: status });
}

const PROVIDER_ORG_ID = 'provider-org-123';
// The Frigg user identity is namespaced by the resolved module name so two
// modules returning the same externalId map to distinct tenants.
const PROVIDER_ORG_IDENTITY = `reevo:${PROVIDER_ORG_ID}`;

// Org-mode config: identity becomes appOrgId (per ADR-034 example).
const ORG_USER_CONFIG = {
    primary: 'organization',
    organizationUserRequired: true,
    individualUserRequired: false,
    authModes: { apiKey: { module: 'reevo' } },
};

function makeModuleDefinition(overrides = {}) {
    return {
        moduleName: 'reevo',
        modelName: 'Reevo',
        API: class {},
        requiredAuthMethods: {
            setAuthParams: jest.fn().mockResolvedValue({}),
            testAuthRequest: jest.fn().mockResolvedValue(true),
            // Mirrors a real module: the externalId is provider-authoritative,
            // and identifiers.user echoes the userId the caller passes (only set
            // by ProcessAuthorizationCallback; undefined during the validate
            // step, which reads externalId only).
            getEntityDetails: jest.fn(
                async (api, params, tokenResponse, userId) => ({
                    identifiers: {
                        externalId: PROVIDER_ORG_ID,
                        user: userId,
                    },
                    details: { name: 'Provider Org' },
                })
            ),
            getCredentialDetails: jest.fn().mockResolvedValue({
                identifiers: { externalId: PROVIDER_ORG_ID },
                details: { api_key: 'x' },
            }),
            apiPropertiesToPersist: { credential: [], entity: [] },
            ...overrides,
        },
    };
}

function buildUseCase({
    userConfig = ORG_USER_CONFIG,
    moduleDefinition = makeModuleDefinition(),
    processAuthorizationCallback = {
        execute: jest.fn().mockResolvedValue({
            credential_id: 'cred-1',
            entity_id: 'entity-1',
            type: 'reevo',
        }),
    },
    userRepository = new TestUserRepository({ userConfig }),
} = {}) {
    const getUserFromXFriggHeaders = new GetUserFromXFriggHeaders({
        userRepository,
        userConfig,
    });
    const createTokenForUserId = new CreateTokenForUserId({ userRepository });

    const useCase = new LoginWithApiKey({
        userConfig,
        moduleDefinitions: [moduleDefinition],
        getUserFromXFriggHeaders,
        processAuthorizationCallback,
        createTokenForUserId,
        ModuleClass: FakeModule,
    });

    return {
        useCase,
        userRepository,
        moduleDefinition,
        processAuthorizationCallback,
        userConfig,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginWithApiKey', () => {
    describe('valid key', () => {
        it('creates the user + credential/entity and returns a session token', async () => {
            const { useCase, userRepository, processAuthorizationCallback } =
                buildUseCase();

            const result = await useCase.execute({ apiKey: 'valid-key' });

            // Session token returned.
            expect(typeof result.token).toBe('string');
            expect(result.token.length).toBeGreaterThan(0);
            expect(result.module).toBe('reevo');

            // Credential + Entity created via the SAME path /api/authorize uses,
            // and — critically — with { api_key }, never the raw client body.
            expect(processAuthorizationCallback.execute).toHaveBeenCalledTimes(
                1
            );
            const [userIdArg, moduleArg, paramsArg] =
                processAuthorizationCallback.execute.mock.calls[0];
            expect(moduleArg).toBe('reevo');
            expect(paramsArg).toEqual({ api_key: 'valid-key' });
            expect(userIdArg).toBe(result.userId);

            // The Frigg user was found-or-created from the PROVIDER identity,
            // namespaced by the resolved module name.
            const org = await userRepository.findOrganizationUserByAppOrgId(
                PROVIDER_ORG_IDENTITY
            );
            expect(org).toBeTruthy();
            expect(org.id).toBe(result.userId);
        });

        it('drives credential + entity creation through the authorize path (real ProcessAuthorizationCallback over in-memory doubles)', async () => {
            // The real ProcessAuthorizationCallback, with a stubbed Module so no
            // DB/provider is touched, proving the login actually persists a
            // Credential and an Entity keyed on the provider identity.
            const {
                ProcessAuthorizationCallback,
            } = require('../../../modules/use-cases/process-authorization-callback');

            const created = { credentials: [], entities: [] };
            const credentialRepository = {
                upsertCredential: jest.fn(async (details) => {
                    const cred = {
                        id: 'cred-1',
                        ...details,
                        authIsValid: true,
                    };
                    created.credentials.push(cred);
                    return cred;
                }),
            };
            const moduleRepository = {
                findEntitiesByUserIdAndModuleName: jest
                    .fn()
                    .mockResolvedValue([]),
                findEntity: jest.fn().mockResolvedValue(null),
                createEntity: jest.fn(async (entity) => {
                    const e = { id: 'entity-1', ...entity };
                    created.entities.push(e);
                    return e;
                }),
                updateEntity: jest.fn(),
            };

            const moduleDefinition = makeModuleDefinition();
            const processAuthorizationCallback =
                new ProcessAuthorizationCallback({
                    moduleRepository,
                    credentialRepository,
                    moduleDefinitions: [moduleDefinition],
                });

            const { useCase } = buildUseCase({
                moduleDefinition,
                processAuthorizationCallback,
            });

            const result = await useCase.execute({ apiKey: 'valid-key' });

            expect(created.credentials).toHaveLength(1);
            expect(created.entities).toHaveLength(1);
            expect(created.entities[0].externalId).toBe(PROVIDER_ORG_ID);
            expect(result.token).toBeTruthy();
        });
    });

    describe('impersonation guard (identity is provider-authoritative)', () => {
        it('IGNORES a client-supplied appOrgId/appUserId — identity comes only from getEntityDetails', async () => {
            const { useCase, userRepository } = buildUseCase();

            // Hostile client tries to steer the identity. execute() must ignore
            // everything but { apiKey, module }.
            const result = await useCase.execute({
                apiKey: 'valid-key',
                appOrgId: 'attacker-org',
                appUserId: 'attacker-user',
                organizationUser: { appOrgId: 'attacker-org' },
            });

            // The user is bound to the PROVIDER org id, never the attacker's.
            const provider =
                await userRepository.findOrganizationUserByAppOrgId(
                    PROVIDER_ORG_IDENTITY
                );
            expect(provider).toBeTruthy();
            expect(provider.id).toBe(result.userId);

            // The attacker's org id was never created.
            const attacker =
                await userRepository.findOrganizationUserByAppOrgId(
                    'attacker-org'
                );
            expect(attacker).toBeFalsy();
        });

        it('MUTATION CHECK: if identity were taken from client input, this assertion would fail', async () => {
            // Provider returns a DIFFERENT id than the client sends. The created
            // user must track the provider value. (If the implementation ever
            // read client input, result.userId would map to the client id.)
            const moduleDefinition = makeModuleDefinition({
                getEntityDetails: jest.fn().mockResolvedValue({
                    identifiers: { externalId: 'provider-authoritative-999' },
                    details: {},
                }),
            });
            const { useCase, userRepository } = buildUseCase({
                moduleDefinition,
            });

            const result = await useCase.execute({
                apiKey: 'valid-key',
                appOrgId: 'client-supplied-000',
            });

            const provider =
                await userRepository.findOrganizationUserByAppOrgId(
                    'reevo:provider-authoritative-999'
                );
            expect(provider.id).toBe(result.userId);
            expect(
                await userRepository.findOrganizationUserByAppOrgId(
                    'client-supplied-000'
                )
            ).toBeFalsy();
        });
    });

    describe('invalid key', () => {
        it('returns a generic 401 and creates no user / credential / session', async () => {
            const moduleDefinition = makeModuleDefinition({
                testAuthRequest: jest
                    .fn()
                    .mockRejectedValue(providerError(401)),
            });
            const { useCase, userRepository, processAuthorizationCallback } =
                buildUseCase({ moduleDefinition });

            await expect(
                useCase.execute({ apiKey: 'bad-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });

            expect(processAuthorizationCallback.execute).not.toHaveBeenCalled();
            expect(
                await userRepository.findOrganizationUserByAppOrgId(
                    PROVIDER_ORG_ID
                )
            ).toBeFalsy();
        });

        it('treats a 403 the same as a 401 (both definitive rejections)', async () => {
            const moduleDefinition = makeModuleDefinition({
                testAuthRequest: jest
                    .fn()
                    .mockRejectedValue(providerError(403)),
            });
            const { useCase } = buildUseCase({ moduleDefinition });

            await expect(
                useCase.execute({ apiKey: 'bad-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });

        it('a falsy (non-throwing) testAuthRequest is also a generic 401', async () => {
            const moduleDefinition = makeModuleDefinition({
                testAuthRequest: jest.fn().mockResolvedValue(false),
            });
            const { useCase } = buildUseCase({ moduleDefinition });

            await expect(
                useCase.execute({ apiKey: 'bad-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });
    });

    describe('provider outage (401-vs-503 split)', () => {
        it('returns 503 (not 401) on a provider 5xx, and creates no session', async () => {
            const moduleDefinition = makeModuleDefinition({
                testAuthRequest: jest
                    .fn()
                    .mockRejectedValue(providerError(503)),
            });
            const { useCase, processAuthorizationCallback } = buildUseCase({
                moduleDefinition,
            });

            await expect(
                useCase.execute({ apiKey: 'any-key' })
            ).rejects.toMatchObject({ output: { statusCode: 503 } });

            expect(processAuthorizationCallback.execute).not.toHaveBeenCalled();
        });

        it('returns 503 on a timeout / network error with no status', async () => {
            const moduleDefinition = makeModuleDefinition({
                testAuthRequest: jest
                    .fn()
                    .mockRejectedValue(new Error('ETIMEDOUT')),
            });
            const { useCase } = buildUseCase({ moduleDefinition });

            await expect(
                useCase.execute({ apiKey: 'any-key' })
            ).rejects.toMatchObject({ output: { statusCode: 503 } });
        });

        it('MUTATION CHECK: classifyProviderError splits 4xx→invalid, 5xx/none→unavailable', () => {
            expect(classifyProviderError(providerError(401))).toBe('invalid');
            expect(classifyProviderError(providerError(403))).toBe('invalid');
            expect(classifyProviderError(providerError(429))).toBe('invalid');
            expect(classifyProviderError(providerError(500))).toBe(
                'unavailable'
            );
            expect(classifyProviderError(providerError(503))).toBe(
                'unavailable'
            );
            expect(classifyProviderError(new Error('socket hang up'))).toBe(
                'unavailable'
            );
        });
    });

    describe('no stable identifier', () => {
        it('rejects when getEntityDetails returns no externalId', async () => {
            const moduleDefinition = makeModuleDefinition({
                getEntityDetails: jest.fn().mockResolvedValue({
                    identifiers: {},
                    details: {},
                }),
            });
            const { useCase, processAuthorizationCallback } = buildUseCase({
                moduleDefinition,
            });

            await expect(
                useCase.execute({ apiKey: 'valid-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
            expect(processAuthorizationCallback.execute).not.toHaveBeenCalled();
        });

        it('rejects on an empty-string identifier', async () => {
            const moduleDefinition = makeModuleDefinition({
                getEntityDetails: jest.fn().mockResolvedValue({
                    identifiers: { externalId: '   ' },
                    details: {},
                }),
            });
            const { useCase } = buildUseCase({ moduleDefinition });
            await expect(
                useCase.execute({ apiKey: 'valid-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });
    });

    describe('input hardening', () => {
        it('caps key length before any provider work (no testAuthRequest call)', async () => {
            const moduleDefinition = makeModuleDefinition();
            const { useCase } = buildUseCase({ moduleDefinition });

            const huge = 'a'.repeat(8193);
            await expect(
                useCase.execute({ apiKey: huge })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });

            expect(
                moduleDefinition.requiredAuthMethods.testAuthRequest
            ).not.toHaveBeenCalled();
        });

        it('rejects a missing/empty apiKey generically', async () => {
            const { useCase } = buildUseCase();
            await expect(useCase.execute({})).rejects.toMatchObject({
                output: { statusCode: 401 },
            });
            await expect(useCase.execute({ apiKey: '' })).rejects.toMatchObject(
                { output: { statusCode: 401 } }
            );
        });

        it('rejects generically when apiKey mode is not configured', async () => {
            const { useCase } = buildUseCase({
                userConfig: {
                    primary: 'organization',
                    organizationUserRequired: true,
                    individualUserRequired: false,
                    authModes: { friggToken: true }, // no apiKey
                },
            });
            await expect(
                useCase.execute({ apiKey: 'valid-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });
    });

    describe('multi-identity module allowlist', () => {
        const MULTI_CONFIG = {
            primary: 'organization',
            organizationUserRequired: true,
            individualUserRequired: false,
            authModes: { apiKey: { modules: ['reevo', 'acme'] } },
        };

        it('accepts an allowlisted module named in the body', async () => {
            const moduleDefinition = makeModuleDefinition();
            const { useCase } = buildUseCase({
                userConfig: MULTI_CONFIG,
                moduleDefinition,
            });
            const result = await useCase.execute({
                apiKey: 'valid-key',
                module: 'reevo',
            });
            expect(result.module).toBe('reevo');
        });

        it('rejects a non-allowlisted module generically', async () => {
            const moduleDefinition = makeModuleDefinition();
            const { useCase } = buildUseCase({
                userConfig: MULTI_CONFIG,
                moduleDefinition,
            });
            await expect(
                useCase.execute({ apiKey: 'valid-key', module: 'evil-module' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });

        it('rejects when multiple modules are configured but none is named', async () => {
            const moduleDefinition = makeModuleDefinition();
            const { useCase } = buildUseCase({
                userConfig: MULTI_CONFIG,
                moduleDefinition,
            });
            await expect(
                useCase.execute({ apiKey: 'valid-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });

        it('resolves via `module` fallback when `modules` is an empty array (union semantics agree with validation)', async () => {
            const moduleDefinition = makeModuleDefinition();
            const { useCase } = buildUseCase({
                userConfig: {
                    primary: 'organization',
                    organizationUserRequired: true,
                    individualUserRequired: false,
                    authModes: { apiKey: { modules: [], module: 'reevo' } },
                },
                moduleDefinition,
            });
            const result = await useCase.execute({ apiKey: 'valid-key' });
            expect(result.module).toBe('reevo');
            expect(result.token).toBeTruthy();
        });
    });

    describe('session scope (ordinary app user, not admin)', () => {
        it('mints a normal, tenant-scoped, short-lived session token — resolvable as the same app user', async () => {
            const userRepository = new TestUserRepository({
                userConfig: ORG_USER_CONFIG,
            });
            const { useCase } = buildUseCase({ userRepository });

            const { token, userId } = await useCase.execute({
                apiKey: 'valid-key',
            });

            // Short-lived by construction (default 120-min TTL).
            expect(token).toContain('for-120-mins');

            // The token resolves back to the SAME tenant app user — no elevation,
            // no cross-tenant reach. This is the identical bearer path a normal
            // friggToken user takes; there is no admin capability attached.
            const getUserFromBearerToken = new GetUserFromBearerToken({
                userRepository,
                userConfig: ORG_USER_CONFIG,
            });
            const resolved = await getUserFromBearerToken.execute(
                `Bearer ${token}`
            );

            expect(resolved.getId()).toBe(userId);
            expect(resolved.getAppOrgId()).toBe(PROVIDER_ORG_IDENTITY);
            // No admin/role field is set anywhere on the principal.
            expect(resolved.organizationUser.isAdmin).toBeUndefined();
            expect(resolved.organizationUser.role).toBeUndefined();
        });
    });

    describe('module-namespaced identity (multi-module allowlist collision)', () => {
        // A subclass of the double whose ids increment deterministically, so two
        // org users created in the same millisecond cannot collide on `Date.now()`
        // — the collision we are proving is namespace-driven, not clock-driven.
        class CountingUserRepository extends TestUserRepository {
            constructor(args) {
                super(args);
                this._seq = 0;
            }
            async createOrganizationUser(params) {
                const orgUserData = {
                    ...params,
                    id: `org-${(this._seq += 1)}`,
                };
                this.organizationUsers.set(orgUserData.id, orgUserData);
                return orgUserData;
            }
        }

        const MULTI_CONFIG = {
            primary: 'organization',
            organizationUserRequired: true,
            individualUserRequired: false,
            authModes: { apiKey: { modules: ['reevo', 'acme'] } },
        };

        function moduleDefReturning(moduleName, externalId) {
            const def = makeModuleDefinition({
                getEntityDetails: jest.fn().mockResolvedValue({
                    identifiers: { externalId },
                    details: {},
                }),
            });
            def.moduleName = moduleName;
            def.modelName = moduleName;
            return def;
        }

        it('two modules returning the SAME externalId produce DISTINCT Frigg userIds', async () => {
            const sharedId = 'shared-account-42';
            const reevoDef = moduleDefReturning('reevo', sharedId);
            const acmeDef = moduleDefReturning('acme', sharedId);

            const userRepository = new CountingUserRepository({
                userConfig: MULTI_CONFIG,
            });
            const getUserFromXFriggHeaders = new GetUserFromXFriggHeaders({
                userRepository,
                userConfig: MULTI_CONFIG,
            });
            const createTokenForUserId = new CreateTokenForUserId({
                userRepository,
            });
            const processAuthorizationCallback = {
                execute: jest.fn().mockResolvedValue({
                    credential_id: 'cred-1',
                    entity_id: 'entity-1',
                }),
            };

            const useCase = new LoginWithApiKey({
                userConfig: MULTI_CONFIG,
                moduleDefinitions: [reevoDef, acmeDef],
                getUserFromXFriggHeaders,
                processAuthorizationCallback,
                createTokenForUserId,
                ModuleClass: FakeModule,
            });

            const r1 = await useCase.execute({
                apiKey: 'reevo-key',
                module: 'reevo',
            });
            const r2 = await useCase.execute({
                apiKey: 'acme-key',
                module: 'acme',
            });

            // The whole point: identical provider externalId, DIFFERENT tenants.
            // (Drop the `${moduleName}:` prefix in the use case and these become
            // the same user — the mutation this test guards.)
            expect(r1.userId).toBeTruthy();
            expect(r2.userId).toBeTruthy();
            expect(r1.userId).not.toBe(r2.userId);

            expect(
                await userRepository.findOrganizationUserByAppOrgId(
                    `reevo:${sharedId}`
                )
            ).toBeTruthy();
            expect(
                await userRepository.findOrganizationUserByAppOrgId(
                    `acme:${sharedId}`
                )
            ).toBeTruthy();
            // The bare (un-namespaced) identity was never used as a key.
            expect(
                await userRepository.findOrganizationUserByAppOrgId(sharedId)
            ).toBeFalsy();
        });
    });

    describe('strict testAuthRequest gate (truthy != pass)', () => {
        it('a truthy error OBJECT from testAuthRequest does not clear the gate (401)', async () => {
            const moduleDefinition = makeModuleDefinition({
                // A module that returns a truthy value (an error object) instead
                // of throwing on a bad key must still be rejected.
                testAuthRequest: jest
                    .fn()
                    .mockResolvedValue({ error: 'nope', ok: false }),
            });
            const { useCase, processAuthorizationCallback } = buildUseCase({
                moduleDefinition,
            });

            await expect(
                useCase.execute({ apiKey: 'bad-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
            // getEntityDetails / credential creation must never be reached.
            expect(
                moduleDefinition.requiredAuthMethods.getEntityDetails
            ).not.toHaveBeenCalled();
            expect(processAuthorizationCallback.execute).not.toHaveBeenCalled();
        });

        it('a truthy non-boolean (non-empty string) also fails the gate (401)', async () => {
            const moduleDefinition = makeModuleDefinition({
                testAuthRequest: jest.fn().mockResolvedValue('valid'),
            });
            const { useCase } = buildUseCase({ moduleDefinition });
            await expect(
                useCase.execute({ apiKey: 'bad-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });
        });
    });

    describe('non-scalar externalId is rejected, not coerced', () => {
        it('an object externalId → 401 and creates no user', async () => {
            const moduleDefinition = makeModuleDefinition({
                getEntityDetails: jest.fn().mockResolvedValue({
                    identifiers: { externalId: {} },
                    details: {},
                }),
            });
            const { useCase, userRepository, processAuthorizationCallback } =
                buildUseCase({ moduleDefinition });

            await expect(
                useCase.execute({ apiKey: 'valid-key' })
            ).rejects.toMatchObject({ output: { statusCode: 401 } });

            expect(processAuthorizationCallback.execute).not.toHaveBeenCalled();
            // No user keyed on the coerced "[object Object]" string.
            expect(
                await userRepository.findOrganizationUserByAppOrgId(
                    'reevo:[object Object]'
                )
            ).toBeFalsy();
        });

        it('a numeric externalId is accepted (scalar identity)', async () => {
            const moduleDefinition = makeModuleDefinition({
                getEntityDetails: jest.fn().mockResolvedValue({
                    identifiers: { externalId: 42 },
                    details: {},
                }),
            });
            const { useCase, userRepository } = buildUseCase({
                moduleDefinition,
            });
            const result = await useCase.execute({ apiKey: 'valid-key' });
            expect(
                await userRepository.findOrganizationUserByAppOrgId('reevo:42')
            ).toBeTruthy();
            expect(result.userId).toBeTruthy();
        });
    });

    describe('credential must exist before a session is minted', () => {
        it('throws a 500-class error (no token) when the callback returns no credential_id', async () => {
            const processAuthorizationCallback = {
                // Simulates a callback that ran but did not persist a credential.
                execute: jest.fn().mockResolvedValue({ entity_id: 'e-1' }),
            };
            const { useCase } = buildUseCase({ processAuthorizationCallback });

            await expect(
                useCase.execute({ apiKey: 'valid-key' })
            ).rejects.toMatchObject({ output: { statusCode: 500 } });
        });

        it('mints a token when the callback returns a credential_id', async () => {
            const { useCase } = buildUseCase();
            const result = await useCase.execute({ apiKey: 'valid-key' });
            expect(result.token).toBeTruthy();
        });
    });
});
