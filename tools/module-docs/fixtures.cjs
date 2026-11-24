'use strict';

// Synthetic provider data for transport/import tests; never published to the site.
const {gzipSync} = require('node:zlib');
const {createHash} = require('node:crypto');
const {digest, REQUIRED_PAGES, semver} = require('./contract.cjs');

function bundle(version = '1.0.0', id = 'hubspot') {
    const pkg = {name: `@friggframework/api-module-${id}`, version, license: 'MIT', dependencies: {'@friggframework/core': '^1.1.2'}};
    const commit = 'a'.repeat(40);
    const source = {repository: 'friggframework/api-module-library', commit, packagePath: `packages/v1-ready/${id}`};
    return {schemaVersion: 1,
        manifest: {id, package: pkg.name, version, channel: semver(version).pre.length ? 'prerelease' : 'stable', source, packageMetadata: pkg, generator: {name: 'frigg-module-docs', version: '1.0.0', digest: 'b'.repeat(64)}},
        catalog: {identity: {id, package: pkg.name, version, kind: 'api-module'}, name: id, description: 'Fixture module for testing release delivery without provider credentials.', provider: id, category: 'Testing', license: 'MIT', maintainers: ['Test maintainer'], status: 'experimental', capabilities: [], extensions: [], compatibility: {node: null, frigg: '^1.1.2', tested: []}, links: {provider: 'https://example.com/docs', support: 'https://example.com/support', source: `https://github.com/${source.repository}/tree/${commit}/${source.packagePath}`, releaseNotes: 'https://example.com/releases'}},
        files: Object.fromEntries(REQUIRED_PAGES.map(name => [name, {encoding: 'utf8', content: `# ${name}\n\nFixture content covering the release-specific module behavior, requirements and support instructions.\n\n[Overview](README.md)\n`}])),
        navigation: REQUIRED_PAGES.map(name => ({path: name, title: name})),
    };
}

const envelope = value => ({schemaVersion: 1, bundle: value, digest: digest(value), packageIntegrity: `sha512-${Buffer.alloc(64).toString('base64')}`});

function tarball(value, extraEntries = []) {
    const entries = [
        ['package/package.json', JSON.stringify(value.manifest.packageMetadata)],
        ['package/module-docs.bundle.json', JSON.stringify(value)],
        ...extraEntries,
    ];
    const chunks = entries.flatMap(([name, content, type = '0']) => {
        const data = Buffer.from(content);
        const header = Buffer.alloc(512);
        header.write(name); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
        header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124);
        header.write('00000000000\0', 136); header.fill(32, 148, 156); header.write(type, 156); header.write('ustar\0', 257);
        const sum = header.reduce((a, b) => a + b, 0);
        header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
        return [header, data, Buffer.alloc((512 - data.length % 512) % 512)];
    });
    const tgz = gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
    return {tgz, integrity: `sha512-${createHash('sha512').update(tgz).digest('base64')}`};
}

function registryFetch(value, options = {}) {
    const {tgz, integrity} = tarball(value);
    const pkg = value.manifest.packageMetadata;
    return async url => {
        if (url === 'https://registry.npmjs.org/fixture.tgz') return new Response(tgz);
        if (url.startsWith('https://registry.npmjs.org/')) return new Response(JSON.stringify({...pkg, dist: {tarball: 'https://registry.npmjs.org/fixture.tgz', integrity: options.badIntegrity || integrity}}));
        if (url.startsWith('https://api.github.com/') && options.dispatch) return options.dispatch(url);
        throw new Error(`Unexpected request ${url}`);
    };
}

module.exports = {bundle, envelope, tarball, registryFetch};
