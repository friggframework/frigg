const DENIED_SUFFIXES = [
    'token',
    'secret',
    'password',
    'apikey',
    'privatekey',
    'signature',
    'authorization',
    'cookie',
    'pwd',
    'passphrase',
    'credentials',
    'sessionid',
];

// Core encryption registry leaves and exact names the suffix rule does not
// cover. `header` is Node's raw `_header` request text. `domain` stays
// allowed: it is too common a key.
const deniedKeys = new Set([
    'hashword',
    'cookies',
    'apikeyvalue',
    'mapping',
    'auth',
    'header',
]);

const PAIR_KEYS = new Set(['code', 'codeverifier']);
const DIGEST_KEY = /(sha(1|256)|hash|digest|checksum)$/;

const MAX_SCRUB_INPUT = 65536;

const URL_IN_TEXT = /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s"'<>`]+/g;
const URL_TRAILING_PUNCT = /[.,;:!?)\]}]+$/;
const ABSOLUTE_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const ROOT_SLASH = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*\//;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const AUTH_SCHEME = /\b(Bearer|bearer|BEARER|Basic|basic|BASIC|Token|token|TOKEN)(\s+)([A-Za-z0-9._~+/=-]{8,})/g;
const AUTH_SCHEME_WORD = /^(bearer|basic|token)$/i;
const COLON_PAIR = /(?<![A-Za-z0-9_-])([A-Za-z_][A-Za-z0-9_.-]{0,99})(["']?)(\s*:\s*)(["']?)([^\s"',;{}]+)/g;
const COOKIE_LINE = /(?<![A-Za-z0-9_-])((?:set-)?cookie)(\s*:\s*)([^\r\n]+)/gi;
const CODE_PAIR = /(?<![A-Za-z0-9_.-])code=/;
const JSON_PAIR = /"([^"\\]{1,100})"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g;
const TEXT_PAIR = /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]{1,100})=([^\s&"'<>,;)]+)/g;
const HEX_RUN = /(?<![A-Za-z0-9])[0-9a-fA-F]{40,}(?![A-Za-z0-9])/g;
const BASE64_RUN = /(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/=_-])/g;
const BASE64_SEGMENT_RUN = /(?<![A-Za-z0-9+=_-])[A-Za-z0-9+_-]{40,}={0,2}(?![A-Za-z0-9+=_-])/g;
const FORM_TEXT = /^[A-Za-z0-9_.%[\]-]+=[^&\s]*(?:&[A-Za-z0-9_.%[\]-]+=[^&\s]*)+$/;
const PATH_SEGMENT = /^[A-Za-z0-9_-]*$/;

function redacted(value) {
    return `[REDACTED:${value.length}]`;
}

function normalizeKey(key) {
    if (typeof key !== 'string') {
        if (typeof key !== 'number') return '';
        key = String(key);
    }
    return key.toLowerCase().replace(/[-_\s]/g, '');
}

function isDeniedKey(key) {
    const normalized = normalizeKey(key);
    if (!normalized) return false;
    if (deniedKeys.has(normalized)) return true;
    return DENIED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isDigestKey(key) {
    return DIGEST_KEY.test(normalizeKey(key));
}

function isPairKey(key, { withState = false } = {}) {
    const normalized = normalizeKey(key);
    return (
        isDeniedKey(key) ||
        PAIR_KEYS.has(normalized) ||
        (withState && normalized === 'state')
    );
}

function addDeniedKeys(keys) {
    if (!Array.isArray(keys)) return;
    for (const key of keys) {
        if (typeof key !== 'string') continue;
        const leaf = normalizeKey(key.split('.').pop());
        if (leaf) deniedKeys.add(leaf);
    }
}

function hasMixedClasses(run) {
    return /[A-Z]/.test(run) && /[a-z]/.test(run) && /[0-9]/.test(run);
}

function isPathLike(run) {
    if (!run.startsWith('/')) return false;
    const segments = run.split('/');
    if (segments.length < 3) return false;
    return segments.every(
        (segment) => segment.length < 40 && PATH_SEGMENT.test(segment)
    );
}

function isRedactedValue(value) {
    return value === 'REDACTED' || value.startsWith('[REDACTED');
}

function scrubTokens(text, { allowHex = false, segment = false } = {}) {
    let out = text.replace(JWT, redacted);
    out = out.replace(AUTH_SCHEME, (match, scheme, space, credential) => {
        const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[._~+/=-]/].filter((re) =>
            re.test(credential)
        ).length;
        return classes >= 2 ? `${scheme}${space}${redacted(credential)}` : match;
    });
    out = out.replace(JSON_PAIR, (match, key, colon, value) =>
        isDeniedKey(key) || normalizeKey(key) === 'codeverifier'
            ? `"${key}"${colon}"${redacted(value)}"`
            : match
    );
    out = out.replace(COOKIE_LINE, (match, key, colon, value) =>
        isRedactedValue(value) ? match : `${key}${colon}${redacted(value)}`
    );
    out = out.replace(COLON_PAIR, (match, key, close, colon, open, value) =>
        isDeniedKey(key) &&
        !isRedactedValue(value) &&
        !AUTH_SCHEME_WORD.test(value)
            ? `${key}${close}${colon}${open}${redacted(value)}`
            : match
    );
    const withState = CODE_PAIR.test(out);
    out = out.replace(TEXT_PAIR, (match, key, value) =>
        isPairKey(key, { withState }) && !isRedactedValue(value)
            ? `${key}=${redacted(value)}`
            : match
    );
    if (!allowHex) out = out.replace(HEX_RUN, redacted);
    out = out.replace(segment ? BASE64_SEGMENT_RUN : BASE64_RUN, (run) =>
        hasMixedClasses(run) && (segment || !isPathLike(run))
            ? redacted(run)
            : run
    );
    return out;
}

function queryKeys(search) {
    return search
        .replace(/^[?#]/, '')
        .split('&')
        .map((pair) => pair.split('=')[0])
        .filter(Boolean);
}

function redactParams(search, prefix) {
    const keys = queryKeys(search);
    if (keys.length === 0) return '';
    return `${prefix}${keys.map((key) => `${key}=REDACTED`).join('&')}`;
}

function redactHash(hash) {
    if (!hash) return '';
    if (hash.includes('=')) return redactParams(hash, '#');
    return scrubTokens(hash);
}

function redactPath(pathname) {
    return pathname
        .split('/')
        .map((segment) => scrubTokens(segment, { segment: true }))
        .join('/');
}

function redactUrlFallback(raw) {
    const out = raw
        .replace(/(:\/\/)[^/?#@\s]*@/, '$1')
        .replace(/([?&#][^=&#\s]+)=[^&#\s]*/g, '$1=REDACTED');
    return scrubTokens(out);
}

function redactUrl(url) {
    if (url === undefined || url === null) return '';
    let raw;
    try {
        raw = url instanceof URL ? url.href : String(url);
    } catch {
        return '';
    }
    try {
        if (ABSOLUTE_URL.test(raw)) {
            const u = new URL(raw);
            const path =
                u.pathname === '/' && !ROOT_SLASH.test(raw) ? '' : u.pathname;
            return `${u.protocol}//${u.host}${redactPath(path)}${redactParams(
                u.search,
                '?'
            )}${redactHash(u.hash)}`;
        }
        if (raw.startsWith('/')) {
            const u = new URL(raw, 'http://relative.invalid');
            return `${redactPath(u.pathname)}${redactParams(
                u.search,
                '?'
            )}${redactHash(u.hash)}`;
        }
    } catch {
        return redactUrlFallback(raw);
    }
    return redactUrlFallback(raw);
}

function looksLikeJson(trimmed) {
    if (trimmed.startsWith('{')) return trimmed.endsWith('}');
    return /^\[\s*[{["\]\d-]/.test(trimmed) && trimmed.endsWith(']');
}

function scrubJsonText(text, originalLength) {
    try {
        return JSON.stringify(redactValue(JSON.parse(text)));
    } catch {
        return `[unparsed:${originalLength}]`;
    }
}

function scrubFormText(text) {
    const pairs = text.split('&').map((pair) => {
        const index = pair.indexOf('=');
        return [pair.slice(0, index), pair.slice(index + 1)];
    });
    const decodedKeys = pairs.map(([key]) => {
        try {
            return decodeURIComponent(key);
        } catch {
            return key;
        }
    });
    const dropAll = isOAuthCallbackShape(decodedKeys);
    return pairs
        .map(([key, value], i) => {
            if (dropAll || isPairKey(decodedKeys[i])) {
                return `${key}=${redacted(value)}`;
            }
            return `${key}=${scrubTokens(value)}`;
        })
        .join('&');
}

function scrubText(text, options) {
    const withUrls = text.replace(URL_IN_TEXT, (match) => {
        const trailing = match.match(URL_TRAILING_PUNCT)?.[0] ?? '';
        const core = trailing ? match.slice(0, -trailing.length) : match;
        return `${redactUrl(core)}${trailing}`;
    });
    return scrubTokens(withUrls, options);
}

function scrubString(str, { allowHex = false } = {}) {
    if (typeof str !== 'string' || str.length === 0) return str;
    try {
        const text =
            str.length > MAX_SCRUB_INPUT ? str.slice(0, MAX_SCRUB_INPUT) : str;
        const trimmed = text.trim();
        if (looksLikeJson(trimmed)) return scrubJsonText(trimmed, str.length);
        if (FORM_TEXT.test(trimmed)) return scrubFormText(trimmed);
        return scrubText(text, { allowHex });
    } catch {
        return redacted(str);
    }
}

function isOAuthCallbackShape(keys) {
    const normalized = new Set(keys.map(normalizeKey));
    return (
        normalized.has('code') &&
        (normalized.has('state') || normalized.has('codeverifier'))
    );
}

function redactValue(value) {
    const { serializeValue } = require('./serialize');
    return serializeValue(value);
}

module.exports = {
    normalizeKey,
    isDeniedKey,
    isDigestKey,
    isOAuthCallbackShape,
    addDeniedKeys,
    redactUrl,
    scrubString,
    redactValue,
};
