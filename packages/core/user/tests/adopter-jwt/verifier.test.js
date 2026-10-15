/* eslint-disable camelcase -- JWT claim names and reason codes are snake_case by spec */
const jose = require('jose');
const { createAdopterTokenVerifier } = require('../../adopter-token-verifier');
const { createMemorySink } = require('../../../logs');
const { createKeys, signToken } = require('../doubles/adopter-jwt-fixtures');

const ISS = 'https://login.example.com/';
const AUD = 'frigg-api';
const BASE = {
    jwksUri: 'https://login.example.com/jwks.json',
    issuer: ISS,
    audience: AUD,
};

describe('createAdopterTokenVerifier', () => {
    let keys;

    beforeAll(async () => {
        keys = await createKeys();
    });

    const token = (claims = { sub: 'u1' }, opts = {}) =>
        signToken(claims, {
            key: keys.es.privateKey,
            kid: 'es-1',
            iss: ISS,
            aud: AUD,
            ...opts,
        });

    const failure = async (promise) => {
        const error = await promise.then(
            () => {
                throw new Error('expected a rejection');
            },
            (e) => e
        );
        expect(error.isBoom).toBe(true);
        return { status: error.output.statusCode, reason: error.data?.reason };
    };

    it('returns the verified claims', async () => {
        const verifier = createAdopterTokenVerifier({
            jwtConfig: BASE,
            keySource: keys.localJwks,
        });

        const claims = await verifier.verify(
            await token({ sub: 'u1', org_id: 'o1' })
        );

        expect(claims).toMatchObject({ sub: 'u1', org_id: 'o1', iss: ISS });
    });

    it('verifies HMAC tokens from the secret alone', async () => {
        const verifier = createAdopterTokenVerifier({
            jwtConfig: { secret: keys.hmacSecret },
        });
        const hs = await signToken(
            { sub: 'u1' },
            { key: new TextEncoder().encode(keys.hmacSecret), alg: 'HS256' }
        );

        await expect(verifier.verify(hs)).resolves.toMatchObject({ sub: 'u1' });
    });

    it('exposes the resolved claim names', () => {
        const verifier = createAdopterTokenVerifier({
            jwtConfig: { ...BASE, userIdClaim: 'uid' },
            keySource: keys.localJwks,
        });

        expect(verifier.claimNames).toEqual({
            userIdClaim: 'uid',
            orgIdClaim: 'org_id',
            roleClaim: 'org_role',
        });
    });

    it('resolves the config once, not per request', async () => {
        const jwtConfig = { ...BASE };
        const verifier = createAdopterTokenVerifier({
            jwtConfig,
            keySource: keys.localJwks,
        });
        const signed = await token();

        jwtConfig.issuer = 'https://changed.example/';
        jwtConfig.audience = 'changed';

        await expect(verifier.verify(signed)).resolves.toMatchObject({
            sub: 'u1',
        });
    });

    describe('key source failures are 503, never 401', () => {
        const keySourceThrowing = (error) => async () => {
            throw error;
        };
        const econnrefused = Object.assign(
            new Error('connect ECONNREFUSED 127.0.0.1:1'),
            {
                code: 'ECONNREFUSED',
            }
        );

        it.each([
            [
                'a fetch TypeError (connection refused, DNS failure)',
                new TypeError('fetch failed'),
            ],
            ['a raw network Error', econnrefused],
            [
                'a generic JOSE error (non-200 JWKS)',
                new jose.errors.JOSEError('Expected 200 OK'),
            ],
            ['a JWKS timeout', new jose.errors.JWKSTimeout()],
            ['an invalid JWKS document', new jose.errors.JWKSInvalid('bad')],
            ['an unknown error', new RangeError('anything else')],
        ])('%s', async (_name, error) => {
            const verifier = createAdopterTokenVerifier({
                jwtConfig: BASE,
                keySource: keySourceThrowing(error),
            });

            expect(await failure(verifier.verify(await token()))).toEqual({
                status: 503,
                reason: 'jwks_unavailable',
            });
        });
    });

    describe('known token failures are 401', () => {
        it.each([
            ['JWKSNoMatchingKey', new jose.errors.JWKSNoMatchingKey()],
            [
                'JWKSMultipleMatchingKeys',
                new jose.errors.JWKSMultipleMatchingKeys(),
            ],
        ])(
            '%s from the key source is an invalid signature',
            async (_name, error) => {
                const verifier = createAdopterTokenVerifier({
                    jwtConfig: BASE,
                    keySource: async () => {
                        throw error;
                    },
                });

                expect(await failure(verifier.verify(await token()))).toEqual({
                    status: 401,
                    reason: 'token_invalid_signature',
                });
            }
        );

        it('a garbled token is malformed, not an outage', async () => {
            const verifier = createAdopterTokenVerifier({
                jwtConfig: BASE,
                keySource: keys.localJwks,
            });

            for (const bad of ['not.a.jwt', '', 'a.b', undefined, 42]) {
                expect(await failure(verifier.verify(bad))).toEqual({
                    status: 401,
                    reason: 'token_malformed',
                });
            }
        });
    });

    describe('a bad config', () => {
        it('does not throw at creation (apps with adopterJwt off build one too)', () => {
            expect(() =>
                createAdopterTokenVerifier({ jwtConfig: undefined })
            ).not.toThrow();
        });

        it('answers 500 jwt_config_invalid and logs the real validation message', async () => {
            const sink = createMemorySink();
            const verifier = createAdopterTokenVerifier({
                jwtConfig: { issuer: ISS },
            });

            expect(await failure(verifier.verify('a.b.c'))).toEqual({
                status: 500,
                reason: 'jwt_config_invalid',
            });

            const records = sink.records.filter(
                (r) => r.eventName === 'frigg.user.adopter_jwt.config_invalid'
            );
            expect(records).toHaveLength(1);
            expect(records[0].level).toBe('ERROR');
            expect(records[0].validationMessage).toMatch(
                /neither jwksUri nor secret/
            );
        });

        it('also answers 500 when claim names are requested', () => {
            const verifier = createAdopterTokenVerifier({ jwtConfig: {} });

            expect(() => verifier.claimNames).toThrow(
                expect.objectContaining({
                    data: { reason: 'jwt_config_invalid' },
                })
            );
        });
    });
});
