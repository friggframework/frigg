'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {importRelease, summary} = require('./import.cjs');
const {bundle, envelope, tarball, registryFetch} = require('./fixtures.cjs');
const {semver, compareVersions, digest} = require('./contract.cjs');
const {readPackage, fetchRelease} = require('./registry.cjs');
const {receive} = require('./receive.cjs');
const allowed = require('./modules.json');

function workspace(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-docs-test-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs/SUMMARY.md'), '# Table of contents\n\n## 🔌 API Modules\n\n* [Legacy](legacy.md)\n\n## Other\n\n* [Keep](keep.md)\n');
    return root;
}
const catalog = (root, id = 'hubspot') => JSON.parse(fs.readFileSync(path.join(root, `website/data/catalog/${id}.json`)));

test('release import preserves navigation, publishes snapshots and is idempotent', t => {
    const root = workspace(t), value = envelope(bundle());
    assert(importRelease(root, value, allowed).changed > 0);
    assert.equal(catalog(root).latestStable, '1.0.0');
    const nav = fs.readFileSync(path.join(root, 'docs/SUMMARY.md'), 'utf8');
    assert(nav.includes('* [Legacy](legacy.md)\n\n## Other\n\n* [Keep](keep.md)'));
    assert.equal(nav.split('<!-- module-docs:start -->').length, 2);
    assert.equal(importRelease(root, value, allowed).changed, 0);
});

test('older release and prerelease cannot move latest stable backwards', t => {
    const root = workspace(t);
    for (const version of ['2.0.0', '1.2.0', '3.0.0-next.10', '3.0.0-next.2']) importRelease(root, envelope(bundle(version)), allowed);
    assert.equal(catalog(root).latestStable, '2.0.0');
    assert.deepEqual(catalog(root).versions.map(x => x.version), ['3.0.0-next.10', '3.0.0-next.2', '2.0.0', '1.2.0']);
    assert(fs.existsSync(path.join(root, 'docs/api-modules/hubspot/versions/1.2.0/README.md')));
});

test('prerelease-only module has no advertised stable version', t => {
    const root = workspace(t);
    importRelease(root, envelope(bundle('2.0.0-next.1')), allowed);
    assert.equal(catalog(root).latestStable, null);
    assert.match(fs.readFileSync(path.join(root, 'docs/api-modules/hubspot/README.md'), 'utf8'), /No stable release/);
});

test('two modules preserve each other in shared indexes', t => {
    const root = workspace(t), second = {id: 'sample', package: '@friggframework/api-module-sample', packagePath: 'packages/v1-ready/sample'};
    const modules = [...allowed, second];
    importRelease(root, envelope(bundle()), modules);
    importRelease(root, envelope(bundle('1.0.0', 'sample')), modules);
    importRelease(root, envelope(bundle('1.1.0')), modules);
    assert.equal(catalog(root, 'sample').latestStable, '1.0.0');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'website/data/catalog/index.json'))).length, 2);
    assert.match(fs.readFileSync(path.join(root, 'docs/SUMMARY.md'), 'utf8'), /sample\/README/);
});

test('conflicting bytes for an immutable release are rejected before any writes', t => {
    const root = workspace(t);
    importRelease(root, envelope(bundle()), allowed);
    const before = fs.readFileSync(path.join(root, 'website/data/catalog/index.json'), 'utf8');
    const changed = bundle(); changed.catalog.description = 'Different content for the same package release.';
    assert.throws(() => importRelease(root, envelope(changed), allowed), /Conflicting immutable/);
    assert.equal(fs.readFileSync(path.join(root, 'website/data/catalog/index.json'), 'utf8'), before);
});

test('malformed bundles, unsafe paths and broken links fail before a destination is created', t => {
    const root = workspace(t);
    const mutations = [
        x => { x.files['../outside.md'] = x.files['README.md']; },
        x => { x.files['README.md'].content += '\n[Missing](missing.md)'; },
        x => { x.files['README.md'].content += '\n<script>alert(1)</script>'; },
        x => { x.files['README.md'].content += '\n[Bad](javascript:alert)'; },
        x => { x.files['README.md'].content += '\nTODO finish'; },
        x => { x.manifest.source.repository = 'evil/repo'; },
        x => { x.catalog.identity.id = 'other'; },
        x => { x.catalog.compatibility.frigg = '*'; },
        x => { x.navigation.pop(); },
    ];
    for (const change of mutations) {
        const x = bundle(); change(x);
        assert.throws(() => importRelease(root, envelope(x), allowed));
    }
    assert(!fs.existsSync(path.join(root, 'website')));
});

test('existing authored landing pages and symlink destinations need explicit migration', t => {
    const root = workspace(t);
    const landing = path.join(root, 'docs/api-modules/hubspot');
    fs.mkdirSync(landing, {recursive: true});
    fs.writeFileSync(path.join(landing, 'README.md'), '# Existing authored page');
    assert.throws(() => importRelease(root, envelope(bundle()), allowed), /Legacy landing/);
    fs.rmSync(landing, {recursive: true});
    fs.symlinkSync(os.tmpdir(), landing);
    assert.throws(() => importRelease(root, envelope(bundle()), allowed), /Symlink/);
});

test('modified imported snapshot is detected rather than silently repaired', t => {
    const root = workspace(t); importRelease(root, envelope(bundle()), allowed);
    fs.appendFileSync(path.join(root, 'docs/api-modules/hubspot/versions/1.0.0/README.md'), 'hand edit');
    assert.throws(() => importRelease(root, envelope(bundle()), allowed), /Stored release content/);
});

test('npm tarball transport verifies integrity and duplicate entries', () => {
    const value = bundle(); const {tgz, integrity} = tarball(value);
    assert.deepEqual(readPackage(tgz, integrity).bundle, value);
    assert.throws(() => readPackage(Buffer.concat([tgz, Buffer.from('changed')]), integrity), /integrity mismatch/);
    const duplicate = tarball(value, [['package/module-docs.bundle.json', '{}']]);
    assert.throws(() => readPackage(duplicate.tgz, duplicate.integrity), /Duplicate/);
});

test('receiver verifies npm then recovers from failed delivery without publishing', async t => {
    const root = workspace(t), value = bundle();
    const event = {client_payload: {package: allowed[0].package, version: '1.0.0'}};
    await assert.rejects(receive(event, root, registryFetch(value, {badIntegrity: 'sha512-YQ=='})), /integrity mismatch/);
    assert(!fs.existsSync(path.join(root, 'website')));
    assert((await receive(event, root, registryFetch(value))).changed > 0);
    assert.equal((await receive(event, root, registryFetch(value))).changed, 0);
    await assert.rejects(receive({client_payload: {...event.client_payload, url: 'https://evil.example'}}, root), /Expected only/);
    await assert.rejects(receive({inputs: {package: 'evil', version: '1.0.0'}}, root), /allowlisted/);
});

test('registry manifest must agree with packed metadata and requested identity', async () => {
    await assert.rejects(fetchRelease(allowed[0], '2.0.0', registryFetch(bundle())), /Expected values/);
});

test('semantic ordering uses numeric prerelease identifiers and ignores build metadata', () => {
    assert.equal(compareVersions('1.0.0-next.10', '1.0.0-next.2'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0-rc.99'), 1);
    assert.equal(compareVersions('1.0.0+one', '1.0.0+two'), 0);
    for (const value of ['01.0.0', '1.0.0-next.01', '../1.0.0', '1.0', '1.0.0;echo']) assert.throws(() => semver(value));
    assert.equal(digest({b: 2, a: 1}), digest({a: 1, b: 2}));
});

test('navigation marker corruption is never overwritten', () => {
    assert.throws(() => summary('<!-- module-docs:start -->', []), /markers/);
    assert.throws(() => summary('<!-- module-docs:end --><!-- module-docs:start -->', []), /Reversed/);
});
