const { OSLS_FRAMEWORK_VERSION } = require('./framework-version');
const semver = require('semver');

describe('OSLS_FRAMEWORK_VERSION (ADR-050)', () => {
    it('is the osls 4 range Frigg targets', () => {
        expect(OSLS_FRAMEWORK_VERSION).toBe('^4.4.0');
    });

    it.each([
        ['4.4.0', true],
        ['4.9.1', true],
        ['4.3.9', false],
        ['3.78.0', false],
        ['5.0.0', false],
    ])('osls %s satisfies it: %s', (version, expected) => {
        // osls compares frameworkVersion with semver.satisfies and fails
        // with FRAMEWORK_VERSION_MISMATCH otherwise.
        expect(semver.satisfies(version, OSLS_FRAMEWORK_VERSION)).toBe(expected);
    });

    it('matches the osls range devtools and frigg-cli depend on', () => {
        const devtools = require('../../../../package.json');
        const cli = require('../../../../frigg-cli/package.json');
        expect(devtools.devDependencies.osls).toBe(OSLS_FRAMEWORK_VERSION);
        expect(cli.dependencies.osls).toBe(OSLS_FRAMEWORK_VERSION);
    });
});
