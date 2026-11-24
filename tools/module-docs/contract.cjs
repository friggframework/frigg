'use strict';

// Wire contract v1. Keep this file byte-identical in api-module-library.
const {createHash} = require('node:crypto');
const path = require('node:path').posix;
const assert = require('node:assert/strict');

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const REQUIRED_PAGES = ['README.md', 'getting-started.md', 'authentication.md', 'reference.md', 'operations.md', 'changes.md'];

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

function semver(value) {
    assert.equal(typeof value, 'string', 'Version must be a string');
    const match = VERSION.exec(value);
    assert(match, `Invalid semantic version: ${value}`);
    const pre = match[4]?.split('.') || [];
    assert(!pre.some(x => /^\d+$/.test(x) && x.length > 1 && x.startsWith('0')), 'Leading zero in prerelease');
    return {numbers: match.slice(1, 4).map(BigInt), pre};
}

function compareVersions(a, b) {
    const x = semver(a), y = semver(b);
    for (let i = 0; i < 3; i++) if (x.numbers[i] !== y.numbers[i]) return x.numbers[i] > y.numbers[i] ? 1 : -1;
    if (!x.pre.length || !y.pre.length) return Number(!x.pre.length) - Number(!y.pre.length);
    for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
        if (x.pre[i] === undefined) return -1;
        if (y.pre[i] === undefined) return 1;
        if (x.pre[i] === y.pre[i]) continue;
        const xn = /^\d+$/.test(x.pre[i]), yn = /^\d+$/.test(y.pre[i]);
        if (xn && yn) return BigInt(x.pre[i]) > BigInt(y.pre[i]) ? 1 : -1;
        if (xn !== yn) return xn ? -1 : 1;
        return x.pre[i] > y.pre[i] ? 1 : -1;
    }
    return 0;
}

function safePath(value) {
    assert.equal(typeof value, 'string');
    assert(value.length < 200 && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value), `Unsafe path: ${value}`);
    assert(!value.split('/').some(p => p === '..' || p === '.' || !p), `Unsafe path: ${value}`);
    return value;
}

function text(value, label) {
    assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 1000, `Missing/invalid ${label}`);
    assert(!/[\r\n<>\[\]`]/.test(value), `Unsafe display text: ${label}`);
}

function https(value) {
    const url = new URL(value);
    assert(url.protocol === 'https:' && !url.username && !url.password, 'Expected public HTTPS URL');
}

// Validate the JSON Schema subset used by descriptor.schema.json; unknown keywords
// are rejected so adding schema features cannot silently weaken validation.
function validateSchema(value, schema, label = 'descriptor') {
    const supported = new Set(['$schema', 'title', 'type', 'required', 'properties', 'additionalProperties', 'items', 'enum', 'pattern', 'minLength', 'minItems']);
    for (const key of Object.keys(schema)) assert(supported.has(key), `Unsupported schema keyword ${key}`);
    if (schema.type === 'object') {
        assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
        for (const key of schema.required || []) assert(Object.hasOwn(value, key), `${label}.${key} is required`);
        for (const [key, item] of Object.entries(value)) {
            const child = schema.properties?.[key];
            if (child) validateSchema(item, child, `${label}.${key}`);
            else assert(schema.additionalProperties !== false, `Unknown ${label}.${key}`);
        }
    } else if (schema.type === 'array') {
        assert(Array.isArray(value), `${label} must be an array`);
        assert(value.length >= (schema.minItems || 0), `${label} is empty`);
        value.forEach((item, i) => validateSchema(item, schema.items, `${label}[${i}]`));
    } else if (schema.type === 'string') {
        assert.equal(typeof value, 'string', `${label} must be a string`);
        assert(value.length >= (schema.minLength || 0), `${label} is empty`);
        if (schema.pattern) assert(new RegExp(schema.pattern).test(value), `Invalid ${label}`);
    } else if (schema.type === 'integer') assert(Number.isInteger(value), `${label} must be an integer`);
    else assert.fail(`Unsupported schema type ${schema.type}`);
    if (schema.enum) assert(schema.enum.includes(value), `Invalid ${label}`);
}

function validateBundle(bundle, allowed) {
    assert(Buffer.byteLength(JSON.stringify(bundle)) <= MAX_BUNDLE_BYTES, 'Bundle too large');
    assert.equal(bundle.schemaVersion, 1);
    const {manifest: m, catalog: c, files, navigation} = bundle;
    assert(m && c && files && Array.isArray(navigation), 'Incomplete bundle');
    assert(ID.test(m.id));
    semver(m.version);
    assert.equal(m.package, allowed.package);
    assert.equal(m.id, allowed.id);
    assert.equal(m.source.repository, 'friggframework/api-module-library');
    assert.equal(m.source.packagePath, allowed.packagePath);
    assert(/^[a-f0-9]{40}$/.test(m.source.commit), 'Expected immutable source commit');
    assert.equal(m.channel, semver(m.version).pre.length ? 'prerelease' : 'stable');
    assert.equal(m.generator.name, 'frigg-module-docs');
    assert.equal(m.generator.version, '1.0.0');
    assert(/^[a-f0-9]{64}$/.test(m.generator.digest), 'Missing generator provenance');
    assert.deepEqual(c.identity, {id: m.id, package: m.package, version: m.version, kind: 'api-module'});
    assert.equal(c.license, m.packageMetadata.license);
    assert.equal(m.packageMetadata.name, m.package);
    assert.equal(m.packageMetadata.version, m.version);
    assert.deepEqual(c.compatibility, {
        node: m.packageMetadata.engines?.node || null,
        frigg: m.packageMetadata.peerDependencies?.['@friggframework/core'] || m.packageMetadata.dependencies?.['@friggframework/core'] || null,
        tested: c.compatibility.tested,
    });
    for (const value of [c.compatibility.node, c.compatibility.frigg]) if (value !== null) text(value, 'compatibility range');
    for (const key of ['name', 'description', 'provider', 'category', 'license', 'status']) text(c[key], key);
    assert(['experimental', 'maintained', 'deprecated'].includes(c.status));
    assert(Array.isArray(c.maintainers) && c.maintainers.length > 0);
    c.maintainers.forEach(x => text(x, 'maintainer'));
    assert(Array.isArray(c.capabilities) && Array.isArray(c.extensions) && Array.isArray(c.compatibility.tested));
    [...c.capabilities, ...c.extensions, ...c.compatibility.tested].forEach(x => text(x, 'catalog value'));
    https(c.links.provider); https(c.links.support); https(c.links.releaseNotes);
    assert.equal(c.links.source, `https://github.com/${m.source.repository}/tree/${m.source.commit}/${m.source.packagePath}`);
    const names = Object.keys(files);
    assert(names.length <= 80, 'Too many bundle files');
    for (const name of REQUIRED_PAGES) assert(Object.hasOwn(files, name), `Missing ${name}`);
    for (const name of names) {
        safePath(name);
        const file = files[name];
        if (name.endsWith('.md')) {
            assert.equal(file.encoding, 'utf8');
            assert(typeof file.content === 'string' && file.content.trim().length >= 80, `Empty page ${name}`);
            const prose = file.content.replace(/```[^]*?```/g, '');
            assert(!/\b(TODO|TBD|lorem ipsum)\b/i.test(prose), `Placeholder in ${name}`);
            assert(!/<\s*\/?\s*(script|iframe|object|embed|style)\b|\bon\w+\s*=|javascript:|data:/i.test(file.content), `Unsafe Markdown in ${name}`);
            // Inline and reference-style links; anchors resolve within the target
            // document at publication time, while target file existence is checked here.
            const destinations = [...prose.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)|^\[[^\]]+\]:\s*(\S+)/gm)];
            for (const match of destinations) {
                const href = match[1] || match[2];
                if (href.startsWith('#')) continue;
                if (/^https:\/\//.test(href)) { https(href); continue; }
                assert(!/^[a-z]+:|^\/|\\|%/i.test(href), `Unsafe link ${href}`);
                const target = path.normalize(path.join(path.dirname(name), href.split('#')[0]));
                assert(Object.hasOwn(files, target), `Broken link ${name} -> ${href}`);
            }
        } else {
            assert(/\.(png|jpg|jpeg|webp)$/.test(name), 'Unsupported asset type');
            assert.equal(file.encoding, 'base64');
            assert(typeof file.content === 'string' && Buffer.from(file.content, 'base64').toString('base64') === file.content, 'Invalid asset encoding');
        }
    }
    assert.equal(new Set(navigation.map(x => x.path)).size, navigation.length, 'Duplicate navigation entry');
    assert.deepEqual([...navigation.map(x => x.path)].sort(), names.filter(x => x.endsWith('.md')).sort(), 'Navigation must cover every page');
    navigation.forEach(x => { text(x.title, 'page title'); assert(x.title.length <= 100); });
    return bundle;
}

module.exports = {canonical, digest, semver, compareVersions, safePath, validateBundle, validateSchema, MAX_BUNDLE_BYTES, REQUIRED_PAGES};
