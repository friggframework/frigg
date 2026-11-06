/**
 * Tests for nested node_modules packaging patterns
 */

const {
    ALL_NESTED_NODE_MODULES,
    keepsNestedNodeModules,
    nestedNodeModulesExcludes,
} = require('./nested-node-modules');

const OPT_OUT = { lambda: { keepNestedNodeModules: false } };

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
