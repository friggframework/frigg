/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and reason codes are snake_case by spec */
/**
 * The production key path: `jwksUri` -> jose.createRemoteJWKSet -> a real HTTP
 * fetch. The other suites inject a local JWKS, so this is the one place the
 * remote source actually executes, including how it fails.
 */
const http = require('http');
const net = require('net');
const jose = require('jose');

jest.mock('jose', () => {
    const actual = jest.requireActual('jose');
    return {
        ...actual,
        createRemoteJWKSet: jest.fn(actual.createRemoteJWKSet),
    };
});

const {
    GetUserFromAdopterJwt,
} = require('../../use-cases/get-user-from-adopter-jwt');
const { createAdopterTokenVerifier } = require('../../adopter-token-verifier');
const {
    createKeys,
    signToken,
    createUserRepositoryDouble,
} = require('../doubles/adopter-jwt-fixtures');

const AUD = 'frigg-api';

describe('adopter token verification against a remote JWKS', () => {
    let keys;
    let server;
    let baseUrl;
    let hits;
    let respondWith;

    beforeAll(async () => {
        keys = await createKeys();
        server = http.createServer((req, res) => {
            hits.push(req.url);
            if (respondWith === 500) {
                res.writeHead(500).end('nope');
                return;
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(keys.publicJwks));
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(() => new Promise((resolve) => server.close(resolve)));

    beforeEach(() => {
        hits = [];
        respondWith = 200;
        jose.createRemoteJWKSet.mockClear();
    });

    const buildFor = (uri) =>
        new GetUserFromAdopterJwt({
            userRepository: createUserRepositoryDouble(),
            tokenVerifier: createAdopterTokenVerifier({
                jwtConfig: { jwksUri: uri, audience: AUD },
            }),
            userConfig: {
                primary: 'individual',
                individualUserRequired: true,
                authModes: { adopterJwt: true },
            },
        });
    const build = (path = '/jwks.json') => buildFor(`${baseUrl}${path}`);

    const token = (claims = { sub: 'u1' }) =>
        signToken(claims, { key: keys.es.privateKey, kid: 'es-1', aud: AUD });

    const failureOf = (useCase, tokenPromise) =>
        tokenPromise
            .then((t) => useCase.execute(t))
            .then(
                () => {
                    throw new Error('expected a rejection');
                },
                (error) => error
            );

    it('verifies a token against keys fetched over HTTP', async () => {
        const user = await build().execute(await token());

        expect(user.getAppUserId()).toBe('u1');
        expect(hits).toEqual(['/jwks.json']);
    });

    it('creates the remote JWKS once per verifier and reuses its key cache', async () => {
        const useCase = build();

        await useCase.execute(await token({ sub: 'a' }));
        await useCase.execute(await token({ sub: 'b' }));
        await useCase.execute(await token({ sub: 'c' }));

        expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(1);
        expect(hits).toHaveLength(1);
    });

    it('keeps a separate remote JWKS for a different URI', async () => {
        await build('/one.json').execute(await token());
        await build('/two.json').execute(await token());

        expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(2);
        expect(hits.sort()).toEqual(['/one.json', '/two.json']);
    });

    it('answers 503 jwks_unavailable when the JWKS endpoint answers 500', async () => {
        respondWith = 500;

        const error = await failureOf(build('/down.json'), token());

        expect(error.output.statusCode).toBe(503);
        expect(error.data).toEqual({ reason: 'jwks_unavailable' });
    });

    it('answers 503 jwks_unavailable when the JWKS port refuses the connection', async () => {
        const closedPort = await new Promise((resolve) => {
            const probe = net.createServer().listen(0, '127.0.0.1', () => {
                const { port } = probe.address();
                probe.close(() => resolve(port));
            });
        });

        const error = await failureOf(
            buildFor(`http://127.0.0.1:${closedPort}/jwks.json`),
            token()
        );

        expect(error.output.statusCode).toBe(503);
        expect(error.data).toEqual({ reason: 'jwks_unavailable' });
    });

    it('answers 503 jwks_unavailable when the JWKS host does not resolve', async () => {
        const error = await failureOf(
            buildFor('https://jwks.frigg-test.invalid/keys.json'),
            token()
        );

        expect(error.output.statusCode).toBe(503);
        expect(error.data).toEqual({ reason: 'jwks_unavailable' });
    });
});
