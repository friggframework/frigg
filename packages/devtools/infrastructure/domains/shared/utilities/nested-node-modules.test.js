/**
 * Tests for nested node_modules packaging patterns
 */

const {
    ALL_NESTED_NODE_MODULES,
    keepsNestedNodeModules,
    nestedNodeModulesExcludes,
} = require('./nested-node-modules');

describe('nestedNodeModulesExcludes', () => {
    it('excludes every nested node_modules by default', () => {
        expect(nestedNodeModulesExcludes({}, true)).toEqual([
            'node_modules/**/node_modules/**',
        ]);
        expect(ALL_NESTED_NODE_MODULES).toBe('node_modules/**/node_modules/**');
    });

    it('keeps nested node_modules when the app opts in, except Frigg, AWS SDK and Prisma copies', () => {
        const appDefinition = { lambda: { keepNestedNodeModules: true } };

        const excludes = nestedNodeModulesExcludes(appDefinition, true);

        expect(excludes).not.toContain('node_modules/**/node_modules/**');
        expect(excludes).toEqual([
            'node_modules/**/node_modules/@friggframework/**',
            'node_modules/**/node_modules/aws-sdk/**',
            'node_modules/**/node_modules/@aws-sdk/**',
            'node_modules/**/node_modules/@prisma/**',
            'node_modules/**/node_modules/.prisma/**',
        ]);
    });

    it('keeps nested Prisma copies when the app bundles Prisma instead of using the layer', () => {
        const appDefinition = { lambda: { keepNestedNodeModules: true } };

        const excludes = nestedNodeModulesExcludes(appDefinition, false);

        expect(excludes).toEqual([
            'node_modules/**/node_modules/@friggframework/**',
            'node_modules/**/node_modules/aws-sdk/**',
            'node_modules/**/node_modules/@aws-sdk/**',
        ]);
    });
});

describe('keepsNestedNodeModules', () => {
    it('is only enabled by the boolean true', () => {
        expect(
            keepsNestedNodeModules({ lambda: { keepNestedNodeModules: true } })
        ).toBe(true);
        expect(
            keepsNestedNodeModules({
                lambda: { keepNestedNodeModules: 'true' },
            })
        ).toBe(false);
        expect(keepsNestedNodeModules({ lambda: {} })).toBe(false);
        expect(keepsNestedNodeModules({})).toBe(false);
        expect(keepsNestedNodeModules()).toBe(false);
    });
});
