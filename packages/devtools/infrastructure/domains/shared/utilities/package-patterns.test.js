/**
 * Tests for the function package patterns helper (ADR-050)
 */

const { toPackagePatterns } = require('./package-patterns');
const { nestedNodeModulesExcludes } = require('./nested-node-modules');

/**
 * The ordered list osls 3 built in resolveFilePathsFromPatterns for a function
 * that set `package.include` / `package.exclude` (no service-level patterns,
 * which Frigg never emits, and before the dev-dependency patterns that both
 * versions append identically).
 */
function osls3FunctionOrder({ include = [], exclude = [] }) {
    const patterns = [];
    exclude.forEach((p) => patterns.push(p.charAt(0) !== '!' ? `!${p}` : p.substring(1)));
    include.forEach((p) => patterns.push(p));
    return patterns;
}

/**
 * The ordered list osls 3 and osls 4 build for a function that sets
 * `package.patterns`: the patterns go in include position, unchanged.
 */
function patternsFunctionOrder(patterns) {
    return [...patterns];
}

describe('toPackagePatterns', () => {
    const cases = [
        {
            name: 'excludes first (negated), then includes',
            lists: {
                include: ['ca.pem'],
                exclude: ['node_modules/aws-sdk/**', '.env'],
            },
            expected: ['!node_modules/aws-sdk/**', '!.env', 'ca.pem'],
        },
        {
            name: 'an exclude that already starts with ! becomes an include in exclude position',
            lists: {
                include: [],
                exclude: ['node_modules/**', '!node_modules/keep/**'],
            },
            expected: ['!node_modules/**', 'node_modules/keep/**'],
        },
        {
            name: 'an include re-adds a path that an exclude removed',
            lists: {
                include: ['config/ca.pem'],
                exclude: ['config/**'],
            },
            expected: ['!config/**', 'config/ca.pem'],
        },
        {
            name: 'empty lists',
            lists: { include: [], exclude: [] },
            expected: [],
        },
        {
            name: 'only excludes',
            lists: { exclude: ['test/**'] },
            expected: ['!test/**'],
        },
        {
            name: 'only includes',
            lists: { include: ['ca.pem'] },
            expected: ['ca.pem'],
        },
    ];

    it.each(cases)('$name', ({ lists, expected }) => {
        const patterns = toPackagePatterns(lists);
        expect(patterns).toEqual(expected);
        // Same evaluation order osls 3 applied to include/exclude.
        expect(patternsFunctionOrder(patterns)).toEqual(osls3FunctionOrder(lists));
    });

    it('returns an empty list when called with no arguments', () => {
        expect(toPackagePatterns()).toEqual([]);
    });

    it('does not mutate its inputs', () => {
        const exclude = ['a/**'];
        const include = ['b'];
        toPackagePatterns({ include, exclude });
        expect(exclude).toEqual(['a/**']);
        expect(include).toEqual(['b']);
    });

    describe('with nestedNodeModulesExcludes output', () => {
        it('negates the single catch-all glob by default', () => {
            const exclude = nestedNodeModulesExcludes({}, true);
            expect(toPackagePatterns({ exclude })).toEqual([
                '!node_modules/**/node_modules/**',
            ]);
        });

        it('negates every scoped glob when keepNestedNodeModules is set', () => {
            const appDefinition = { lambda: { keepNestedNodeModules: true } };
            const exclude = nestedNodeModulesExcludes(appDefinition, true);
            const patterns = toPackagePatterns({ exclude });

            expect(patterns).toEqual(exclude.map((p) => `!${p}`));
            expect(patterns).toContain('!node_modules/**/node_modules/@friggframework/**');
            expect(patterns).not.toContain('!node_modules/**/node_modules/**');
            expect(patternsFunctionOrder(patterns)).toEqual(
                osls3FunctionOrder({ exclude })
            );
        });
    });
});
