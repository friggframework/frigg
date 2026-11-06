/**
 * Tests for nested node_modules packaging patterns
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    ALL_NESTED_NODE_MODULES,
    assertLambdaPackagesComplete,
    findPackagesDroppedFromLambda,
    keepsNestedNodeModules,
    nestedNodeModulesExcludes,
} = require('./nested-node-modules');

const OPT_OUT = { lambda: { keepNestedNodeModules: false } };

const lockfile = (packages) => ({
    lockfileVersion: 3,
    packages: { '': { name: 'app' }, ...packages },
});

describe('nestedNodeModulesExcludes', () => {
    it('keeps nested node_modules by default, except Frigg, AWS SDK and Prisma copies', () => {
        const excludes = nestedNodeModulesExcludes({}, true);

        expect(excludes).not.toContain(ALL_NESTED_NODE_MODULES);
        expect(excludes).toEqual([
            'node_modules/**/node_modules/@friggframework/**',
            'node_modules/**/node_modules/aws-sdk/**',
            'node_modules/**/node_modules/@aws-sdk/**',
            'node_modules/**/node_modules/@prisma/**',
            'node_modules/**/node_modules/.prisma/**',
        ]);
    });

    it('keeps nested Prisma copies when the app bundles Prisma instead of using the layer', () => {
        expect(nestedNodeModulesExcludes({}, false)).toEqual([
            'node_modules/**/node_modules/@friggframework/**',
            'node_modules/**/node_modules/aws-sdk/**',
            'node_modules/**/node_modules/@aws-sdk/**',
        ]);
    });

    it('excludes every nested node_modules when the app opts out', () => {
        expect(nestedNodeModulesExcludes(OPT_OUT, true)).toEqual([
            'node_modules/**/node_modules/**',
        ]);
        expect(ALL_NESTED_NODE_MODULES).toBe('node_modules/**/node_modules/**');
    });
});

describe('keepsNestedNodeModules', () => {
    it('is only disabled by the boolean false', () => {
        expect(keepsNestedNodeModules(OPT_OUT)).toBe(false);
        expect(
            keepsNestedNodeModules({
                lambda: { keepNestedNodeModules: true },
            })
        ).toBe(true);
        expect(keepsNestedNodeModules({ lambda: {} })).toBe(true);
        expect(keepsNestedNodeModules({})).toBe(true);
        expect(keepsNestedNodeModules()).toBe(true);
    });
});

describe('findPackagesDroppedFromLambda', () => {
    const sideChannelNestedUnderQs = lockfile({
        'node_modules/qs': { version: '6.16.0' },
        'node_modules/qs/node_modules/side-channel': { version: '1.1.1' },
        'node_modules/side-channel': { version: '1.1.0', dev: true },
    });

    it('reports a nested production package whose root copy is dev-only when the app opts out', () => {
        expect(
            findPackagesDroppedFromLambda(sideChannelNestedUnderQs, OPT_OUT, true)
        ).toEqual([
            {
                path: 'node_modules/qs/node_modules/side-channel',
                version: '1.1.1',
                rootVersion: '1.1.0',
            },
        ]);
    });

    it('reports a nested production package with no root copy when the app opts out', () => {
        const lock = lockfile({
            'node_modules/a': { version: '1.0.0' },
            'node_modules/a/node_modules/b': { version: '2.0.0' },
        });

        expect(findPackagesDroppedFromLambda(lock, OPT_OUT, true)).toEqual([
            {
                path: 'node_modules/a/node_modules/b',
                version: '2.0.0',
                rootVersion: null,
            },
        ]);
    });

    it('accepts a nested package that resolves to a shipped root copy', () => {
        const lock = lockfile({
            'node_modules/debug': { version: '4.4.3' },
            'node_modules/express/node_modules/debug': { version: '2.6.9' },
        });

        expect(findPackagesDroppedFromLambda(lock, OPT_OUT, true)).toEqual([]);
    });

    it('ships nested packages by default', () => {
        expect(
            findPackagesDroppedFromLambda(sideChannelNestedUnderQs, {}, true)
        ).toEqual([]);
    });

    it('reports a nested Frigg package with no shipped root copy', () => {
        const lock = lockfile({
            'node_modules/@friggframework/api-module-x': { version: '1.0.0' },
            'node_modules/@friggframework/api-module-x/node_modules/@friggframework/core':
                { version: '2.0.0' },
        });

        expect(findPackagesDroppedFromLambda(lock, {}, true)).toEqual([
            {
                path: 'node_modules/@friggframework/api-module-x/node_modules/@friggframework/core',
                version: '2.0.0',
                rootVersion: null,
            },
        ]);
    });

    it('accepts packages the Lambda runtime or the Prisma layer provide', () => {
        const lock = lockfile({
            'node_modules/a': { version: '1.0.0' },
            'node_modules/a/node_modules/aws-sdk': { version: '2.0.0' },
            'node_modules/a/node_modules/@aws-sdk/client-kms': { version: '3.0.0' },
            'node_modules/a/node_modules/@prisma/client': { version: '6.0.0' },
            'node_modules/a/node_modules/@prisma/client/node_modules/x': {
                version: '1.0.0',
            },
        });

        expect(findPackagesDroppedFromLambda(lock, {}, true)).toEqual([]);
    });

    it('accepts the nested dependencies of a package the Lambda runtime provides', () => {
        const lock = lockfile({
            'node_modules/aws-sdk': { version: '2.1692.0' },
            'node_modules/aws-sdk/node_modules/isarray': { version: '1.0.0' },
            'node_modules/isarray': { version: '0.0.1', dev: true },
        });

        expect(findPackagesDroppedFromLambda(lock, OPT_OUT, true)).toEqual([]);
    });

    it('ignores dev-only and linked entries', () => {
        const lock = lockfile({
            'node_modules/a': { version: '1.0.0', dev: true },
            'node_modules/a/node_modules/b': { version: '2.0.0', dev: true },
            'node_modules/c/node_modules/d': { link: true, resolved: 'pkgs/d' },
        });

        expect(findPackagesDroppedFromLambda(lock, OPT_OUT, true)).toEqual([]);
    });
});

describe('assertLambdaPackagesComplete', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-lock-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const writeLock = (lock) => {
        const file = path.join(dir, 'package-lock.json');
        fs.writeFileSync(file, JSON.stringify(lock));
        return file;
    };

    it('fails the build and names each package the Lambda would not have', () => {
        const lockfilePath = writeLock(
            lockfile({
                'node_modules/qs/node_modules/side-channel': { version: '1.1.1' },
            })
        );

        expect(() =>
            assertLambdaPackagesComplete({
                appDefinition: OPT_OUT,
                usePrismaLayer: true,
                lockfilePath,
            })
        ).toThrow(/node_modules\/qs\/node_modules\/side-channel@1\.1\.1/);
    });

    it('passes when every package ships', () => {
        const lockfilePath = writeLock(
            lockfile({
                'node_modules/qs/node_modules/side-channel': { version: '1.1.1' },
            })
        );

        expect(() =>
            assertLambdaPackagesComplete({
                appDefinition: {},
                usePrismaLayer: true,
                lockfilePath,
            })
        ).not.toThrow();
    });

    it('skips the check when the app has no package-lock.json', () => {
        expect(() =>
            assertLambdaPackagesComplete({
                appDefinition: OPT_OUT,
                usePrismaLayer: true,
                lockfilePath: path.join(dir, 'package-lock.json'),
            })
        ).not.toThrow();
    });
});
