const {
    normalizeKey,
    isDeniedKey,
    addDeniedKeys,
    redactUrl,
    scrubString,
    redactValue,
} = require('./redact');
const { SECRETS } = require('./__fixtures__/secrets');
const { toContainNoSecretWindow } = require('./__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

describe('normalizeKey', () => {
    it('lower-cases and strips dashes, underscores and spaces', () => {
        expect(normalizeKey('X-Frigg_Api Key')).toBe('xfriggapikey');
    });
});

describe('isDeniedKey', () => {
    it.each([
        'hashword',
        'access_token',
        'X-Frigg-Api-Key',
        'api-key',
        'apiKey',
        'API_KEY_VALUE',
        'privateKey',
        'client_secret',
        'Authorization',
        'cookie',
        'cookies',
        'set-cookie',
        'id_token',
        'refreshToken',
        'signature',
        'password',
        'dbPassword',
    ])('denies %s', (key) => {
        expect(isDeniedKey(key)).toBe(true);
    });

    it.each(['code', 'data', 'state', 'userId', 'tokenCount', 'message'])(
        'keeps %s',
        (key) => {
            expect(isDeniedKey(key)).toBe(false);
        }
    );

    it('tolerates non-string keys', () => {
        expect(isDeniedKey(undefined)).toBe(false);
        expect(isDeniedKey(42)).toBe(false);
    });
});

describe('addDeniedKeys', () => {
    it('adds the leaf of each encryption registry path', () => {
        expect(isDeniedKey('tenantPin')).toBe(false);
        addDeniedKeys(['data.tenant_pin', 'mapping.deep.otherLeaf']);
        expect(isDeniedKey('tenantPin')).toBe(true);
        expect(isDeniedKey('other-leaf')).toBe(true);
    });

    it('ignores non-string entries and non-arrays', () => {
        expect(() => addDeniedKeys([null, 3, ''])).not.toThrow();
        expect(() => addDeniedKeys(undefined)).not.toThrow();
    });

    it('honours the core encryption leaves', () => {
        expect(isDeniedKey('access_token')).toBe(true);
        expect(isDeniedKey('mapping')).toBe(true);
    });
});

describe('redactUrl', () => {
    it('keeps query keys and replaces each value with REDACTED', () => {
        expect(
            redactUrl(
                `https://api.example.com/v1/items?api_key=${SECRETS.apiKeyQuery}&page=2`
            )
        ).toBe('https://api.example.com/v1/items?api_key=REDACTED&page=REDACTED');
    });

    it('drops userinfo', () => {
        const out = redactUrl(
            `postgresql://admin:${SECRETS.dbPassword}@db.internal:5432/app`
        );
        expect(out).toBe('postgresql://db.internal:5432/app');
    });

    it('accepts a URL instance', () => {
        const out = redactUrl(new URL('https://h.example/p?token=abc'));
        expect(out).toBe('https://h.example/p?token=REDACTED');
    });

    it('does not add a trailing slash to a bare host', () => {
        expect(redactUrl('http://example.com')).toBe('http://example.com');
    });

    it('redacts a relative URL query', () => {
        expect(redactUrl('/v1/contacts?api_key=abc')).toBe(
            '/v1/contacts?api_key=REDACTED'
        );
    });

    it('redacts fragment parameters', () => {
        expect(
            redactUrl(`https://app.example/cb#access_token=${SECRETS.accessToken}`)
        ).toBe('https://app.example/cb#access_token=REDACTED');
    });

    it('scrubs tokens in the path', () => {
        const out = redactUrl(`https://h.example/bot/${SECRETS.base64Run}/x`);
        expect(out).toContainNoSecretWindow([SECRETS.base64Run]);
        expect(out).toMatch(/^https:\/\/h\.example\/bot\//);
    });

    it('returns a scrubbed string for input that is not a URL', () => {
        expect(redactUrl(`Bearer ${SECRETS.bearer}`)).toContainNoSecretWindow([
            SECRETS.bearer,
        ]);
        expect(redactUrl(undefined)).toBe('');
    });
});

describe('scrubString', () => {
    it('scrubs Bearer and Basic credentials and keeps the scheme word', () => {
        const out = scrubString(
            `Authorization: Bearer ${SECRETS.bearer} and Basic ${SECRETS.password}`
        );
        expect(out).toContainNoSecretWindow([SECRETS.bearer, SECRETS.password]);
        expect(out).toContain(`Bearer [REDACTED:${SECRETS.bearer.length}]`);
        expect(out).toContain('Basic [REDACTED:');
    });

    it('keeps prose around the word Bearer', () => {
        expect(scrubString('Bearer token expired')).toBe(
            'Bearer token expired'
        );
    });

    it('scrubs a JWT', () => {
        const out = scrubString(`token was ${SECRETS.jwt} ok`);
        expect(out).toBe(`token was [REDACTED:${SECRETS.jwt.length}] ok`);
    });

    it.each([
        [`postgresql://u:${SECRETS.dbPassword}@h/db`],
        [`mongodb+srv://u:${SECRETS.dbPassword}@cluster0.example.net/app`],
        [`mongodb://u:${SECRETS.dbPassword}@h1:27017,h2:27017/app?replicaSet=rs0`],
    ])('drops the userinfo of a connection string: %s', (value) => {
        const out = scrubString(`connect failed: ${value} (timeout)`);
        expect(out).toContainNoSecretWindow([SECRETS.dbPassword]);
        expect(out).toContain('connect failed:');
        expect(out).toContain('(timeout)');
    });

    it('keeps host and path of a URL in prose and redacts query values', () => {
        const out = scrubString(
            `request to https://api.example.com/v2/deals?api_key=${SECRETS.apiKeyQuery}, failed.`
        );
        expect(out).toBe(
            'request to https://api.example.com/v2/deals?api_key=REDACTED, failed.'
        );
    });

    it.each([
        ['client_secret', SECRETS.clientSecret],
        ['signature', SECRETS.signature],
        ['code', SECRETS.oauthCode],
        ['code_verifier', SECRETS.codeVerifier],
        ['refresh_token', SECRETS.refreshToken],
    ])('scrubs %s= pairs in prose', (key, secret) => {
        const out = scrubString(`sent grant_type=x ${key}=${secret} then`);
        expect(out.split(`${key}=`).join('')).toContainNoSecretWindow([
            secret,
        ]);
        expect(out).toContain(`${key}=[REDACTED:${secret.length}]`);
        expect(out).toContain('grant_type=x');
    });

    it('does not treat errorcode= as a code= pair', () => {
        expect(scrubString('errorcode=500 happened')).toBe(
            'errorcode=500 happened'
        );
    });

    it('scrubs denied keys in embedded JSON text', () => {
        const out = scrubString(
            `Response: {"error":"invalid_grant","access_token":"${SECRETS.accessToken}"} end`
        );
        expect(out).toContainNoSecretWindow([SECRETS.accessToken]);
        expect(out).toContain('"error":"invalid_grant"');
    });

    it('parses and walks a JSON string', () => {
        const out = scrubString(
            JSON.stringify({ token: SECRETS.accessToken, user: 'u1' })
        );
        expect(JSON.parse(out)).toEqual({ token: '[REDACTED]', user: 'u1' });
    });

    it('replaces unparseable JSON-looking text with its length', () => {
        const value = `{"token":"${SECRETS.accessToken}", broken`;
        const withBrace = `${value}}`;
        expect(scrubString(withBrace)).toBe(`[unparsed:${withBrace.length}]`);
    });

    it('parses and walks a k=v&k=v string', () => {
        const out = scrubString(
            `grant_type=refresh_token&refresh_token=${SECRETS.refreshToken}&password=${SECRETS.password}&scope=read`
        );
        expect(out).toContainNoSecretWindow([
            SECRETS.refreshToken,
            SECRETS.password,
        ]);
        expect(out).toContain('grant_type=refresh_token');
        expect(out).toContain('scope=read');
    });

    it('scrubs a 40-char hex token inside an error message', () => {
        const out = scrubString(`invalid key ${SECRETS.hexToken} for tenant`);
        expect(out).toBe(
            `invalid key [REDACTED:${SECRETS.hexToken.length}] for tenant`
        );
    });

    it('keeps long hex when allowHex is set (digest keys)', () => {
        expect(scrubString(SECRETS.hexToken, { allowHex: true })).toBe(
            SECRETS.hexToken
        );
    });

    it('scrubs a 60-char base64 run', () => {
        const out = scrubString(`blob ${SECRETS.base64Run} end`);
        expect(out).toBe(`blob [REDACTED:${SECRETS.base64Run.length}] end`);
    });

    it('leaves a 49-char CamelCase identifier intact', () => {
        const id = 'IntegrationDefinitionRepositoryMongoFactoryHelper';
        expect(id).toHaveLength(49);
        expect(scrubString(`missing ${id}`)).toBe(`missing ${id}`);
    });

    it('leaves stack paths intact', () => {
        const stack =
            'Error: boom\n    at Object.<anonymous> (/Volumes/daniel-external/projects/lefthook/frigg/.claude/worktrees/frigg-logging-adr-15a03a/packages/core/logs/redact.test.js:12:5)\n    at node:internal/process/task_queues:95:5';
        expect(scrubString(stack)).toBe(stack);
    });

    it('scrubs before any cut: a secret at offset 3,000 of 5,000 chars', () => {
        const long = `${'a '.repeat(1500)}Bearer ${SECRETS.bearer} ${'b '.repeat(1000)}`;
        const out = scrubString(long);
        expect(out).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('returns non-strings unchanged', () => {
        expect(scrubString(5)).toBe(5);
    });
});

describe('redactValue', () => {
    it('runs the same pipeline on a bare value', () => {
        expect(redactValue(`Bearer ${SECRETS.bearer}`)).toBe(
            `Bearer [REDACTED:${SECRETS.bearer.length}]`
        );
        expect(
            redactValue({ headers: { authorization: 'x' }, code: 'ECONNRESET' })
        ).toEqual({ headers: ['authorization'], code: 'ECONNRESET' });
    });

    it('drops the values of denied keys at any depth, keeps code and data', () => {
        const out = redactValue({
            data: {
                access_token: SECRETS.accessToken,
                nested: { hashword: SECRETS.hashword, cookies: ['a=b'] },
            },
            code: 'ECONNRESET',
        });
        expect(out).toEqual({
            data: {
                access_token: '[REDACTED]',
                nested: { hashword: '[REDACTED]', cookies: '[REDACTED]' },
            },
            code: 'ECONNRESET',
        });
    });

    it('reduces headers and multiValueHeaders to names', () => {
        const out = redactValue({
            headers: { 'x-frigg-api-key': SECRETS.friggApiKey, host: 'h' },
            multiValueHeaders: { cookie: [SECRETS.cookie] },
        });
        expect(out).toEqual({
            headers: ['x-frigg-api-key', 'host'],
            multiValueHeaders: ['cookie'],
        });
    });

    it('drops OAuth callback values but keeps the keys', () => {
        const out = redactValue({
            code: SECRETS.oauthCode,
            state: 'st-123',
            code_verifier: SECRETS.codeVerifier,
            redirect: 'https://x',
        });
        expect(out).toEqual({
            code: '[REDACTED]',
            state: '[REDACTED]',
            code_verifier: '[REDACTED]',
            redirect: '[REDACTED]',
        });
    });

    it('keeps code on a plain error-shaped object', () => {
        expect(redactValue({ code: 'ECONNRESET' })).toEqual({
            code: 'ECONNRESET',
        });
    });

    it('keeps long hex under digest keys only', () => {
        const out = redactValue({
            bodySha256: SECRETS.hexToken,
            other: SECRETS.hexToken,
        });
        expect(out.bodySha256).toBe(SECRETS.hexToken);
        expect(out.other).toBe(`[REDACTED:${SECRETS.hexToken.length}]`);
    });
});

describe('encryption registry hooks', () => {
    const registry = require('../database/encryption/encryption-schema-registry');

    afterEach(() => registry.resetCustomSchema());

    it('registerCustomSchema adds the leaf of each custom field', () => {
        expect(isDeniedKey('bankRoutingPin')).toBe(false);
        registry.registerCustomSchema({
            Credential: { fields: ['data.bank_routing_pin'] },
        });
        expect(isDeniedKey('bankRoutingPin')).toBe(true);
    });

    it('extractCredentialFieldsFromModules adds module credential leaves', () => {
        expect(isDeniedKey('vendorPassphrase')).toBe(false);
        registry.extractCredentialFieldsFromModules([
            { encryption: { credentialFields: ['vendor_passphrase'] } },
        ]);
        expect(isDeniedKey('vendorPassphrase')).toBe(true);
    });
});
