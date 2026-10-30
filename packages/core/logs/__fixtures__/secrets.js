// Fake values, generated at load time so secret scanners find no literal in
// the source. A fixed seed per name keeps every run identical.
const MIXED = 'BCDFGHJKLMNPQRSTVWXZbcdfghjkmnpqrstvwxz23456789';
const HEX = '0123456789abcdef';

function seededRandom(name) {
    let seed = [...name].reduce(
        (h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619),
        2166136261
    );
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function draw(name, alphabet, length) {
    const next = seededRandom(name);
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += alphabet[Math.floor(next() * alphabet.length)];
    }
    return out;
}

// The fixed 'Zq' + 'B7k' start puts upper case, lower case and a digit in every token.
function fakeToken(name, length = 28) {
    return `ZqB7k${draw(name, MIXED, length - 5)}`;
}

const base64url = (value) => Buffer.from(value).toString('base64url');

const SECRETS = Object.freeze({
    bearer: fakeToken('bearer'),
    apiKeyQuery: fakeToken('apiKeyQuery'),
    friggApiKey: fakeToken('friggApiKey'),
    cookie: fakeToken('cookie'),
    oauthCode: fakeToken('oauthCode'),
    codeVerifier: fakeToken('codeVerifier'),
    password: fakeToken('password'),
    clientSecret: fakeToken('clientSecret'),
    accessToken: fakeToken('accessToken'),
    refreshToken: fakeToken('refreshToken'),
    idToken: fakeToken('idToken'),
    hashword: fakeToken('hashword'),
    dbPassword: fakeToken('dbPassword'),
    signature: fakeToken('signature'),
    jwt: [
        base64url(JSON.stringify({ alg: 'HS256' })),
        base64url(JSON.stringify({ sub: `fake-${draw('jwtSub', MIXED, 8)}` })),
        base64url(draw('jwtSig', MIXED, 24)),
    ].join('.'),
    hexToken: draw('hexToken', HEX, 40),
    base64Run: Buffer.from(draw('base64Run', MIXED, 42)).toString('base64'),
});

module.exports = { SECRETS, fakeToken };
