const {
    resolveAdopterJwtConfig,
    assertAdopterJwtConfig,
} = require('./adopter-jwt-config');

describe('resolveAdopterJwtConfig', () => {
    it('defaults to ES256 and RS256, 30s tolerance and the standard claims for a jwksUri', () => {
        expect(
            resolveAdopterJwtConfig({ jwksUri: 'https://x.example/jwks' })
        ).toEqual({
            jwksUri: 'https://x.example/jwks',
            secret: undefined,
            issuer: undefined,
            audience: undefined,
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

    it('accepts no jwksUri and no secret when a key source is injected in code', () => {
        expect(
            resolveAdopterJwtConfig(undefined, { hasInjectedKeySource: true })
                .algorithms
        ).toEqual(['ES256', 'RS256']);
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
                jwtConfig: { jwksUri: 'https://x.example/jwks' },
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
