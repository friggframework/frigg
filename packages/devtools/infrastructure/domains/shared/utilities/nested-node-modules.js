/**
 * Nested node_modules packaging patterns
 *
 * Utility Layer - Hexagonal Architecture
 *
 * npm nests a package only when the root copy cannot satisfy the dependant's
 * range. Excluding every nested node_modules from a Lambda package therefore
 * rewires module resolution to whatever is hoisted, and drops a package
 * outright when the root copy is dev-only. Apps opt in to shipping the tree
 * the way npm resolved it with `lambda.keepNestedNodeModules: true`. Nested
 * copies of Frigg packages, the AWS SDK and Prisma stay excluded because the
 * app's single core, the Lambda runtime and the Prisma layer provide them.
 */

const ALL_NESTED_NODE_MODULES = 'node_modules/**/node_modules/**';

/**
 * @param {Object} appDefinition
 * @returns {boolean}
 */
function keepsNestedNodeModules(appDefinition = {}) {
    return appDefinition.lambda?.keepNestedNodeModules === true;
}

/**
 * Package exclude patterns for nested node_modules directories.
 *
 * @param {Object} appDefinition
 * @param {boolean} usePrismaLayer - Whether Prisma ships via the Lambda Layer
 * @returns {string[]}
 */
function nestedNodeModulesExcludes(appDefinition, usePrismaLayer = true) {
    if (!keepsNestedNodeModules(appDefinition)) {
        return [ALL_NESTED_NODE_MODULES];
    }
    return [
        'node_modules/**/node_modules/@friggframework/**',
        'node_modules/**/node_modules/aws-sdk/**',
        'node_modules/**/node_modules/@aws-sdk/**',
        ...(usePrismaLayer
            ? [
                  'node_modules/**/node_modules/@prisma/**',
                  'node_modules/**/node_modules/.prisma/**',
              ]
            : []),
    ];
}

module.exports = {
    ALL_NESTED_NODE_MODULES,
    keepsNestedNodeModules,
    nestedNodeModulesExcludes,
};
