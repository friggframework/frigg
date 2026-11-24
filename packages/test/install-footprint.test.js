// @friggframework/test is a runtime dependency of @friggframework/devtools,
// so it is installed in every Frigg app. TestMongo downloads its pinned
// MongoDB binary on first use; no MongoDB package it depends on may also
// download one at install time (mongodb-memory-server's postinstall did,
// and fetched the library default rather than the pinned version).
describe('@friggframework/test install footprint', () => {
    const { dependencies } = require('./package.json');
    const mongoDependencies = Object.keys(dependencies).filter((name) =>
        name.includes('mongo')
    );

    it('uses a MongoDB in-memory server package', () => {
        expect(mongoDependencies).not.toEqual([]);
    });

    it.each(mongoDependencies)('%s has no install-time scripts', (name) => {
        const manifest = require(require.resolve(`${name}/package.json`, {
            paths: [__dirname],
        }));
        const scripts = manifest.scripts || {};

        expect(
            ['preinstall', 'install', 'postinstall'].filter((hook) => scripts[hook])
        ).toEqual([]);
    });
});
