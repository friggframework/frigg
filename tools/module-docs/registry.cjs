'use strict';

// Registry transport v1. Keep this file byte-identical in api-module-library.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {gunzipSync} = require('node:zlib');
const {semver, validateBundle, digest, MAX_BUNDLE_BYTES} = require('./contract.cjs');

async function download(url, maxBytes, fetchImpl = fetch) {
    assert.equal(new URL(url).origin, 'https://registry.npmjs.org');
    const response = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(30000)});
    assert(response.ok, `Registry request failed: ${response.status}`);
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
        length += chunk.length;
        assert(length <= maxBytes, 'Registry response too large');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function readPackage(tgz, integrity) {
    assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity), 'Expected sha512 npm integrity');
    assert.equal(`sha512-${createHash('sha512').update(tgz).digest('base64')}`, integrity, 'npm integrity mismatch');
    const tar = gunzipSync(tgz, {maxOutputLength: 32 * 1024 * 1024});
    const wanted = new Set(['package/package.json', 'package/module-docs.bundle.json']);
    const found = {};
    for (let offset = 0; offset + 512 <= tar.length;) {
        const header = tar.subarray(offset, offset + 512);
        if (header.every(x => x === 0)) break;
        const str = (a, b) => header.subarray(a, b).toString().split('\0')[0];
        const name = [str(345, 500), str(0, 100)].filter(Boolean).join('/');
        const sizeText = str(124, 136).trim();
        assert(/^[0-7]+$/.test(sizeText), 'Invalid tar entry size');
        const size = parseInt(sizeText, 8);
        assert(Number.isSafeInteger(size) && offset + 512 + size <= tar.length, 'Truncated tar');
        if (wanted.has(name)) {
            assert(!Object.hasOwn(found, name), 'Duplicate package entry');
            assert([0, 48].includes(header[156]), 'Package entry must be a regular file');
            assert(size <= MAX_BUNDLE_BYTES, 'Package metadata/bundle too large');
            found[name] = JSON.parse(tar.subarray(offset + 512, offset + 512 + size).toString('utf8'));
        }
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.equal(Object.keys(found).length, 2, 'Published package is missing documentation bundle');
    return {bundle: found['package/module-docs.bundle.json'], pkg: found['package/package.json']};
}

async function fetchRelease(allowed, version, fetchImpl = fetch) {
    semver(version);
    const metadata = JSON.parse(await download(`https://registry.npmjs.org/${encodeURIComponent(allowed.package)}/${encodeURIComponent(version)}`, 2 * 1024 * 1024, fetchImpl));
    assert.equal(metadata.name, allowed.package); assert.equal(metadata.version, version);
    const tgz = await download(metadata.dist.tarball, 16 * 1024 * 1024, fetchImpl);
    const {bundle, pkg} = readPackage(tgz, metadata.dist.integrity);
    assert.equal(pkg.name, allowed.package); assert.equal(pkg.version, version);
    assert.equal(bundle.manifest.version, version);
    for (const key of ['name', 'version', 'license', 'engines', 'dependencies', 'peerDependencies']) {
        assert.deepEqual(bundle.manifest.packageMetadata[key], pkg[key], `Published package ${key} disagrees with bundle`);
    }
    validateBundle(bundle, allowed);
    return {schemaVersion: 1, digest: digest(bundle), packageIntegrity: metadata.dist.integrity, bundle};
}

module.exports = {download, readPackage, fetchRelease};
