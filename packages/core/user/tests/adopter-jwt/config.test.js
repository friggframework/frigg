const {
    resolveAdopterJwtConfig,
    assertAdopterJwtConfig,
    SUPPORTED_ALGORITHMS,
} = require('../../adopter-jwt-config');
const { createMemorySink } = require('../../../logs');
const schema = require('../../../../schemas/schemas/app-definition.schema.json');

describe('resolveAdopterJwtConfig', () => {
    it('defaults to ES256 and RS256, 30s tolerance and the standard claims for a jwksUri', () => {
        expect(
            resolveAdopterJwtConfig({
                jwksUri: 'https://x.example/jwks',
                audience: 'frigg-api',
            })
        ).toEqual({
            jwksUri: 'https://x.example/jwks',
            secret: undefined,
            issuer: undefined,
            audience: 'frigg-api',
            algorithms: ['ES256', 'RS256'],
            clockToleranceSec: 30,
            userIdClaim: 'sub',
            orgIdClaim: 'org_id',
            roleClaim: 'org_role',
        });
    });

    it('defaults to HS256 for a secret', () => {
        expect(resolveAdopterJwtConfig({ secret: 's' }).algorithms).toEqual([
            'HS256',
        ]);
    });

    it('keeps explicit values, including a tolerance of 0', () => {
        const config = resolveAdopterJwtConfig({
            jwksUri: 'https://x.example/jwks',
            issuer: 'iss',
            audience: ['a', 'b'],
            algorithms: ['ES384'],
            clockToleranceSec: 0,
            userIdClaim: 'uid',
            orgIdClaim: 'tenant',
            roleClaim: 'r',
        });

        expect(config).toMatchObject({
            issuer: 'iss',
            audience: ['a', 'b'],
            algorithms: ['ES384'],
            clockToleranceSec: 0,
            userIdClaim: 'uid',
            orgIdClaim: 'tenant',
            roleClaim: 'r',
        });
    });

    it('reads the deprecated single `algorithm` as the allow-list', () => {
        expect(
            resolveAdopterJwtConfig({ secret: 's', algorithm: 'HS512' })
                .algorithms
        ).toEqual(['HS512']);
    });

    it.each([
        ['no jwtConfig', undefined],
        ['an empty jwtConfig', {}],
        ['blank jwksUri and secret', { jwksUri: ' ', secret: '' }],
    ])('refuses %s', (_name, jwtConfig) => {
        expect(() => resolveAdopterJwtConfig(jwtConfig)).toThrow(
            /neither jwksUri nor secret/
        );
    });

    describe('jwksUri', () => {
        const withUri = (jwksUri) => ({ jwksUri, audience: 'a' });

        it.each([
            'not-a-url',
            '/relative/path',
            'ftp://x.example/jwks',
            'file:///etc/jwks',
        ])('refuses %s', (jwksUri) => {
            expect(() => resolveAdopterJwtConfig(withUri(jwksUri))).toThrow(
                /jwksUri/
            );
        });

        it('refuses http to a public host', () => {
            expect(() =>
                resolveAdopterJwtConfig(
                    withUri('http://login.example.com/jwks.json')
                )
            ).toThrow(/must use https/);
            expect(() =>
                resolveAdopterJwtConfig(
                    withUri('http://127.0.0.1.example.com/jwks.json')
                )
            ).toThrow(/must use https/);
        });

        it.each([
            'http://localhost:3000/jwks.json',
            'http://127.0.0.1:8080/jwks.json',
            'http://127.5.6.7/jwks.json',
            'http://[::1]:9000/jwks.json',
            'https://login.example.com/jwks.json',
        ])('allows %s', (jwksUri) => {
            expect(resolveAdopterJwtConfig(withUri(jwksUri)).jwksUri).toBe(
                jwksUri
            );
        });
    });

    describe('audience', () => {
        it('is required with jwksUri', () => {
            expect(() =>
                resolveAdopterJwtConfig({ jwksUri: 'https://x.example/jwks' })
            ).toThrow(/audience is required/);
            expect(() =>
                resolveAdopterJwtConfig({
                    jwksUri: 'https://x.example/jwks',
                    audience: [],
                })
            ).toThrow(/audience is required/);
            expect(() =>
                resolveAdopterJwtConfig({
                    jwksUri: 'https://x.example/jwks',
                    audience: ' ',
                })
            ).toThrow(/audience is required/);
        });

        it('stays optional with a secret', () => {
            expect(
                resolveAdopterJwtConfig({ secret: 's' }).audience
            ).toBeUndefined();
        });
    });

    it('refuses both algorithm and algorithms', () => {
        expect(() =>
            resolveAdopterJwtConfig({
                secret: 's',
                algorithm: 'HS256',
                algorithms: ['HS256'],
            })
        ).toThrow(/both algorithm and algorithms/);
    });

    it('refuses both jwksUri and secret', () => {
        expect(() =>
            resolveAdopterJwtConfig({
                jwksUri: 'https://x.example/jwks',
                secret: 's',
            })
        ).toThrow(/both jwksUri and secret/);
    });

    it.each([
        ['an unknown algorithm', { secret: 's', algorithms: ['none'] }],
        ['an empty list', { secret: 's', algorithms: [] }],
        ['a non-array', { secret: 's', algorithms: 'HS256' }],
    ])('refuses %s', (_name, jwtConfig) => {
        expect(() => resolveAdopterJwtConfig(jwtConfig)).toThrow(
            /algorithms must be/
        );
    });

    it('refuses asymmetric algorithms with a secret', () => {
        expect(() =>
            resolveAdopterJwtConfig({ secret: 's', algorithms: ['RS256'] })
        ).toThrow(/only list HS\* algorithms/);
    });

    it('refuses HS* algorithms with a jwksUri (algorithm confusion)', () => {
        expect(() =>
            resolveAdopterJwtConfig({
                jwksUri: 'https://x.example/jwks',
                audience: 'a',
                algorithms: ['ES256', 'HS256'],
            })
        ).toThrow(/may not list HS\* algorithms/);
    });

    it.each([-1, 1.5, '30', NaN])(
        'refuses clockToleranceSec %p',
        (clockToleranceSec) => {
            expect(() =>
                resolveAdopterJwtConfig({ secret: 's', clockToleranceSec })
            ).toThrow(/clockToleranceSec/);
        }
    );
});

describe('assertAdopterJwtConfig (startup check)', () => {
    it('throws when adopterJwt is on without a key source', () => {
        expect(() =>
            assertAdopterJwtConfig({
                authModes: { adopterJwt: true },
                jwtConfig: {},
            })
        ).toThrow(/neither jwksUri nor secret/);
        expect(() =>
            assertAdopterJwtConfig({ authModes: { adopterJwt: true } })
        ).toThrow(/neither jwksUri nor secret/);
    });

    it('passes when adopterJwt is on with a jwksUri or a secret', () => {
        expect(() =>
            assertAdopterJwtConfig({
                authModes: { adopterJwt: true },
                jwtConfig: { jwksUri: 'https://x.example/jwks', audience: 'a' },
            })
        ).not.toThrow();
        expect(() =>
            assertAdopterJwtConfig({
                authModes: { adopterJwt: true },
                jwtConfig: { secret: 's' },
            })
        ).not.toThrow();
    });

    it('does nothing when adopterJwt is off or absent, whatever jwtConfig holds', () => {
        expect(() => assertAdopterJwtConfig(null)).not.toThrow();
        expect(() => assertAdopterJwtConfig({})).not.toThrow();
        expect(() =>
            assertAdopterJwtConfig({
                authModes: { adopterJwt: false },
                jwtConfig: {},
            })
        ).not.toThrow();
    });

    it('only treats a literal true as enabled, matching AuthenticateUser', () => {
        expect(() =>
            assertAdopterJwtConfig({
                authModes: { adopterJwt: 'yes' },
                jwtConfig: {},
            })
        ).not.toThrow();
    });
});

describe('SUPPORTED_ALGORITHMS', () => {
    it('equals the algorithms the schema accepts', () => {
        const { jwtConfig } = schema.properties.user.properties;
        expect([...SUPPORTED_ALGORITHMS].sort()).toEqual(
            [...jwtConfig.properties.algorithms.items.enum].sort()
        );
        expect([...SUPPORTED_ALGORITHMS].sort()).toEqual(
            [...jwtConfig.properties.algorithm.enum].sort()
        );
    });
});

describe('assertAdopterJwtConfig warnings', () => {
    const build = (jwtConfig) => ({
        authModes: { adopterJwt: true },
        jwtConfig,
    });
    let sink;

    beforeEach(() => {
        sink = createMemorySink();
    });

    it('warns at startup when jwksUri has no issuer', () => {
        assertAdopterJwtConfig(
            build({ jwksUri: 'https://x.example/jwks', audience: 'a' })
        );

        const warnings = sink.records.filter(
            (r) => r.eventName === 'frigg.user.adopter_jwt.issuer_unset'
        );
        expect(warnings).toHaveLength(1);
        expect(warnings[0].level).toBe('WARN');
    });

    it('does not warn when an issuer is set, or in HMAC mode', () => {
        assertAdopterJwtConfig(
            build({
                jwksUri: 'https://x.example/jwks',
                audience: 'a',
                issuer: 'i',
            })
        );
        assertAdopterJwtConfig(build({ secret: 's' }));

        expect(sink.records).toEqual([]);
    });
});
