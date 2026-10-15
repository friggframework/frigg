/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and reason codes are snake_case by spec */
/**
 * The production key path: `jwksUri` -> jose.createRemoteJWKSet -> a real HTTP
 * fetch. The main suite injects a local JWKS, so this is the one place the
 * remote source actually executes.
 */
const http = require('http');
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
    clearAdopterJwksCache,
} = require('./get-user-from-adopter-jwt');
const {
    createKeys,
    signToken,
    createUserRepositoryDouble,
} = require('../tests/doubles/adopter-jwt-fixtures');

describe('GetUserFromAdopterJwt with a remote JWKS', () => {
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
        clearAdopterJwksCache();
        jose.createRemoteJWKSet.mockClear();
    });

    const build = (path = '/jwks.json') =>
        new GetUserFromAdopterJwt({
            userRepository: createUserRepositoryDouble(),
            userConfig: {
                primary: 'individual',
                individualUserRequired: true,
                authModes: { adopterJwt: true },
                jwtConfig: { jwksUri: `${baseUrl}${path}` },
            },
        });

    const token = (claims = { sub: 'u1' }) =>
        signToken(claims, { key: keys.es.privateKey, kid: 'es-1' });

    it('verifies a token against keys fetched over HTTP', async () => {
        const user = await build().execute(await token());

        expect(user.getAppUserId()).toBe('u1');
        expect(hits).toEqual(['/jwks.json']);
    });

    it('creates the remote JWKS once per URI per process and reuses its cache', async () => {
        await build().execute(await token({ sub: 'a' }));
        await build().execute(await token({ sub: 'b' }));
        await build().execute(await token({ sub: 'c' }));

        expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(1);
        expect(hits).toHaveLength(1);
    });

    it('keeps a separate remote JWKS for a different URI', async () => {
        await build('/one.json').execute(await token());
        await build('/two.json').execute(await token());
        await build('/one.json').execute(await token());

        expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(2);
    });

    it('answers 503 jwks_unavailable when the JWKS endpoint fails', async () => {
        respondWith = 500;

        const error = await build('/down.json')
            .execute(await token())
            .catch((e) => e);

        expect(error.output.statusCode).toBe(503);
        expect(error.data).toEqual({ reason: 'jwks_unavailable' });
    });
});
