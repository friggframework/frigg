// ADR-048 §14 redaction vectors. Each vector is one log call that carries
// secrets; the suite asserts that no 8-char window of them reaches a record.
const { SECRETS: S } = require('./secrets');
const { httpApiV2Event, restV1Event, sqsEvent } = require('./events');
const { summarizeLambdaEvent } = require('../summarize-event');

const secretUrl = `https://api.example.com/v1/items?api_key=${S.apiKeyQuery}`;
const SIGNATURE_VALUE = 'fakeSgnValue2Gh9Tc5Wp7LmQx3';

// Built by concatenation so push protection does not match the prefixes.
const TOKEN_TAIL = 'ZqPr3fixTail8Hn2Kd8Ws1Yc6';
const PREFIXED_TOKENS = [
    'sk_' + 'live_' + TOKEN_TAIL,
    'whsec' + '_' + TOKEN_TAIL,
    'xox' + 'b-' + TOKEN_TAIL,
    'gh' + 'p_' + TOKEN_TAIL,
    'AK' + 'IA' + 'ZQPR3FIXTAIL8HN2',
];

function errorWithMessage(message, name = 'Error') {
    const error = new Error(message);
    error.name = name;
    return error;
}

function nodeFetchError() {
    const { FetchError } = require('node-fetch');
    return new FetchError(
        `request to ${secretUrl} failed, reason: connect ECONNREFUSED Authorization: Bearer ${S.bearer}`,
        'system',
        { code: 'ECONNREFUSED' }
    );
}

function causeChain() {
    const deepest = errorWithMessage(`token refresh failed: refresh_token=${S.refreshToken}`);
    const third = new Error('third', { cause: deepest });
    const second = new Error('second', { cause: third });
    return new Error('top', { cause: second });
}

function cyclicObject() {
    const node = { name: 'node', access_token: S.accessToken };
    node.self = node;
    node.list = [node, { password: S.password }];
    return node;
}

function aggregateError() {
    return new AggregateError(
        [
            errorWithMessage(`GET ${secretUrl} 401`),
            errorWithMessage(`Authorization: Basic ${Buffer.from(`u:${S.password}`).toString('base64')}`),
        ],
        'batch failed'
    );
}

function prismaValidationError() {
    const error = errorWithMessage(
        [
            'Invalid `prisma.credential.create()` invocation:',
            '',
            `{ data: { access_token: "${S.accessToken}", refresh_token: "${S.refreshToken}" } }`,
            '',
            'Argument `userId` is missing.',
        ].join('\n'),
        'PrismaClientValidationError'
    );
    error.clientVersion = '6.19.3';
    return error;
}

function vectors() {
    return [
        {
            name: 'HTTP API v2 event through summarizeLambdaEvent',
            level: 'info',
            fields: () => ({ invocation: summarizeLambdaEvent(httpApiV2Event()) }),
            secrets: [S.friggApiKey, S.cookie, S.oauthCode, S.bearer, S.apiKeyQuery, S.codeVerifier, S.clientSecret],
            expectSanitized: (record) => {
                expect(record.invocation.headerNames).toEqual(
                    expect.arrayContaining(['x-frigg-api-key', 'cookie', 'authorization'])
                );
                expect(record.invocation.queryKeys).toEqual(expect.arrayContaining(['code', 'api_key']));
            },
        },
        {
            name: 'HTTP API v2 event as a raw field',
            level: 'debug',
            fields: () => ({ event: httpApiV2Event() }),
            secrets: [S.friggApiKey, S.cookie, S.oauthCode, S.bearer, S.apiKeyQuery, S.codeVerifier, S.clientSecret],
            expectSanitized: (record) => {
                expect(record.event.headers).toEqual(
                    expect.arrayContaining(['x-frigg-api-key', 'cookie'])
                );
            },
        },
        {
            name: 'REST v1 event as a raw field',
            level: 'debug',
            fields: () => ({ event: restV1Event() }),
            secrets: [S.friggApiKey, S.cookie, S.password, S.accessToken, S.refreshToken],
            expectSanitized: (record) => {
                expect(record.event.httpMethod).toBe('POST');
            },
        },
        {
            name: 'SQS event as a raw field',
            level: 'debug',
            fields: () => ({ event: sqsEvent() }),
            secrets: [S.accessToken, S.clientSecret, S.bearer],
            expectSanitized: (record) => {
                expect(record.event.Records[0].messageId).toBe('msg-1');
            },
        },
        {
            name: 'node-fetch FetchError',
            level: 'error',
            fields: () => ({ error: nodeFetchError() }),
            secrets: [S.apiKeyQuery, S.bearer],
            expectSanitized: (record) => {
                expect(record.error.message).toContain('api_key=REDACTED');
            },
        },
        {
            name: 'Error as the message',
            level: 'error',
            message: () => errorWithMessage(`GET ${secretUrl} Authorization: Bearer ${S.bearer}`),
            secrets: [S.apiKeyQuery, S.bearer],
            expectSanitized: (record) => {
                expect(record.message).toContain('api_key=REDACTED');
            },
        },
        {
            name: 'cause chain with a secret at depth 3',
            level: 'error',
            fields: () => ({ error: causeChain() }),
            secrets: [S.refreshToken],
            expectSanitized: (record) => {
                expect(record.error.cause.cause.message).toBe('third');
            },
        },
        {
            name: 'cyclic object',
            level: 'warn',
            fields: () => ({ node: cyclicObject() }),
            secrets: [S.accessToken, S.password],
            expectSanitized: (record) => {
                expect(JSON.stringify(record)).toContain('[Circular]');
            },
        },
        {
            name: 'AggregateError',
            level: 'error',
            fields: () => ({ error: aggregateError() }),
            secrets: [S.apiKeyQuery, S.password],
            expectSanitized: (record) => {
                expect(record.error.type).toBe('AggregateError');
            },
        },
        {
            name: 'Prisma validation error',
            level: 'error',
            fields: () => ({ error: prismaValidationError() }),
            secrets: [S.accessToken, S.refreshToken],
            expectSanitized: (record) => {
                expect(record.error.message).toContain('Argument `userId` is missing.');
            },
        },
        {
            name: 'connection strings',
            level: 'warn',
            message: () =>
                `connect failed postgresql://frigg:${S.dbPassword}@db.internal:5432/app and mongodb+srv://frigg:${S.dbPassword}@cluster0.example.net/app`,
            secrets: [S.dbPassword],
            expectSanitized: (record) => {
                expect(record.message).toContain('db.internal');
            },
        },
        {
            name: 'JWT',
            level: 'info',
            fields: () => ({ note: `id token ${S.jwt} received` }),
            secrets: [S.jwt],
        },
        {
            name: 'Bearer and Basic credentials',
            level: 'info',
            fields: () => ({
                note: `Authorization: Bearer ${S.bearer}; Authorization: Basic ${Buffer.from(`u:${S.password}`).toString('base64')}`,
            }),
            secrets: [S.bearer, S.password],
        },
        {
            name: 'base64 run',
            level: 'info',
            fields: () => ({ note: `blob ${S.base64Run} end` }),
            secrets: [S.base64Run],
        },
        {
            name: 'provider token prefixes',
            level: 'warn',
            message: () => `provider rejected ${PREFIXED_TOKENS.join(' and ')}`,
            fields: () => ({ note: PREFIXED_TOKENS.join(',') }),
            secrets: PREFIXED_TOKENS,
        },
        {
            name: '40-hex token',
            level: 'error',
            message: () => `lookup failed for key ${S.hexToken}`,
            secrets: [S.hexToken],
        },
        {
            name: 'client_secret, signature and code pairs',
            level: 'info',
            fields: () => ({
                note: `client_secret=${S.clientSecret} signature=${SIGNATURE_VALUE} code=${S.oauthCode}`,
            }),
            secrets: [S.clientSecret, SIGNATURE_VALUE, S.oauthCode],
        },
        {
            name: 'JSON string',
            level: 'info',
            fields: () => ({ note: JSON.stringify({ token: S.accessToken, id: 7 }) }),
            secrets: [S.accessToken],
        },
        {
            name: 'k=v& string',
            level: 'info',
            fields: () => ({ note: `user=alice&password=${S.password}&next=/home` }),
            secrets: [S.password],
        },
        {
            name: 'URLSearchParams body',
            level: 'debug',
            fields: () => ({
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: S.oauthCode,
                    code_verifier: S.codeVerifier,
                    client_secret: S.clientSecret,
                }),
            }),
            secrets: [S.oauthCode, S.codeVerifier, S.clientSecret],
            expectSanitized: (record) => {
                expect(JSON.stringify(record.body)).toContain('grant_type');
            },
        },
        {
            name: 'Headers, URL and Buffer',
            level: 'debug',
            fields: () => ({
                headers: new Headers({ authorization: `Bearer ${S.bearer}`, 'x-frigg-api-key': S.friggApiKey }),
                url: new URL(`https://user:${S.password}@api.example.com/x?access_token=${S.accessToken}`),
                raw: Buffer.from(`secret=${S.clientSecret}`),
            }),
            secrets: [S.bearer, S.friggApiKey, S.password, S.accessToken, S.clientSecret],
            expectSanitized: (record) => {
                expect(JSON.stringify(record.url)).toContain('api.example.com');
            },
        },
        {
            name: 'OAuth callback params',
            level: 'debug',
            fields: () => ({ params: { code: S.oauthCode, state: 'abc123', code_verifier: S.codeVerifier } }),
            secrets: [S.oauthCode, S.codeVerifier],
            expectSanitized: (record) => {
                expect(Object.keys(record.params)).toEqual(
                    expect.arrayContaining(['code', 'state'])
                );
            },
        },
        {
            name: 'hashword',
            level: 'info',
            fields: () => ({ user: { username: 'alice', hashword: S.hashword } }),
            secrets: [S.hashword],
            expectSanitized: (record) => {
                expect(record.user.username).toBe('alice');
            },
        },
        {
            name: 'denied keys as bindings and top-level fields',
            level: 'info',
            bindings: () => ({ apiKey: S.friggApiKey }),
            fields: () => ({ access_token: S.accessToken, id_token: S.idToken, cookies: [S.cookie] }),
            secrets: [S.friggApiKey, S.accessToken, S.idToken, S.cookie],
        },
    ];
}

// A real Requester call that fails with 401. The URL carries a query key and
// the request an Authorization header.
async function requesterFetchError() {
    const { Requester } = require('../../modules/requester/requester');
    class TestRequester extends Requester {
        async addAuthHeaders(headers) {
            return { ...headers, Authorization: `Bearer ${S.bearer}` };
        }
    }
    const response = {
        status: 401,
        ok: false,
        bodyUsed: false,
        headers: {
            get: () => 'application/json',
            raw: () => ({ 'content-type': ['application/json'] }),
            [Symbol.iterator]: function* () {
                yield ['content-type', 'application/json'];
            },
        },
        json: async () => ({ access_token: S.accessToken }),
        text: async () => `{"access_token":"${S.accessToken}"}`,
    };
    const requester = new TestRequester({
        backOff: [],
        requestTimeoutMs: 0,
        fetch: async () => response,
    });
    return requester._get({ url: secretUrl }).then(
        () => {
            throw new Error('expected the request to fail');
        },
        (error) => error
    );
}

module.exports = { vectors, requesterFetchError, secretUrl };
