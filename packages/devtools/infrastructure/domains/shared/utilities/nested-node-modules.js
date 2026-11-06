/**
 * Nested node_modules packaging patterns
 *
 * Utility Layer - Hexagonal Architecture
 *
 * npm nests a package only when the root copy cannot satisfy the dependant's
 * range. Excluding every nested node_modules from a Lambda package therefore
 * rewires module resolution to whatever is hoisted, and drops a package
 * outright when the root copy is dev-only. Function packages ship the tree the
 * way npm resolved it unless an app opts out with
 * `lambda.keepNestedNodeModules: false`. Nested copies of Frigg packages, the
 * AWS SDK and Prisma stay excluded because the app's single core, the Lambda
 * runtime and the Prisma layer provide them.
 */

const fs = require('fs');

const ALL_NESTED_NODE_MODULES = 'node_modules/**/node_modules/**';
const NODE_MODULES = 'node_modules/';

const isFrigg = (name) => name.startsWith('@friggframework/');
const isAwsSdk = (name) => name === 'aws-sdk' || name.startsWith('@aws-sdk/');
const isPrisma = (name) => name.startsWith('@prisma/') || name === '.prisma';

/**
 * @param {Object} appDefinition
 * @returns {boolean}
 */
function keepsNestedNodeModules(appDefinition = {}) {
    return appDefinition.lambda?.keepNestedNodeModules !== false;
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

/**
 * Production packages from package-lock.json that nestedNodeModulesExcludes
 * removes from the function package and that nothing else provides at
 * runtime: no shipped root copy, not the Lambda runtime, not the Prisma layer.
 * Each one is a `Runtime.ImportModuleError` at Lambda init.
 *
 * @param {Object} lockfile - Parsed package-lock.json (lockfileVersion >= 2)
 * @param {Object} appDefinition
 * @param {boolean} usePrismaLayer
 * @returns {{path: string, version: string, rootVersion: string|null}[]}
 */
function findPackagesDroppedFromLambda(lockfile, appDefinition, usePrismaLayer = true) {
    const packages = lockfile?.packages || {};
    const keepNested = keepsNestedNodeModules(appDefinition);
    const shipped = (entry) => Boolean(entry) && !entry.dev && !entry.link;
    const providedAtRuntime = (name) =>
        isAwsSdk(name) || (usePrismaLayer && isPrisma(name));
    const excludedWhenKept = (name) =>
        isFrigg(name) || isAwsSdk(name) || (usePrismaLayer && isPrisma(name));

    const dropped = [];
    for (const [lockPath, entry] of Object.entries(packages)) {
        if (!lockPath.startsWith(NODE_MODULES) || !shipped(entry)) continue;
        const chain = lockPath
            .split(NODE_MODULES)
            .slice(1)
            .map((segment) => segment.replace(/\/$/, ''));
        const nested = chain.slice(1);
        if (nested.length === 0) continue;
        if (keepNested && !nested.some(excludedWhenKept)) continue;
        if (chain.some(providedAtRuntime)) continue;

        const name = chain[chain.length - 1];
        const root = packages[`${NODE_MODULES}${name}`];
        if (shipped(root)) continue;
        dropped.push({
            path: lockPath,
            version: entry.version,
            rootVersion: root?.version ?? null,
        });
    }
    return dropped;
}

/**
 * Fail the build before deploy when a function package would be missing a
 * production package. Skipped when the app has no package-lock.json.
 *
 * @param {Object} params
 * @param {Object} params.appDefinition
 * @param {boolean} params.usePrismaLayer
 * @param {string} params.lockfilePath
 */
function assertLambdaPackagesComplete({ appDefinition, usePrismaLayer, lockfilePath }) {
    if (!fs.existsSync(lockfilePath)) return;
    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    const dropped = findPackagesDroppedFromLambda(lockfile, appDefinition, usePrismaLayer);
    if (dropped.length === 0) return;

    const lines = dropped.map(
        ({ path, version, rootVersion }) =>
            `  - ${path}@${version} (root copy: ${rootVersion ? `${rootVersion}, dev-only` : 'none'})`
    );
    throw new Error(
        [
            `Lambda packages would be missing ${dropped.length} production package(s) from ${lockfilePath}:`,
            ...lines,
            'Each one fails at Lambda init with Runtime.ImportModuleError.',
            'Remove `lambda.keepNestedNodeModules: false` from the app definition, or add the package as a direct dependency so npm installs it at the root.',
        ].join('\n')
    );
}

module.exports = {
    ALL_NESTED_NODE_MODULES,
    assertLambdaPackagesComplete,
    findPackagesDroppedFromLambda,
    keepsNestedNodeModules,
    nestedNodeModulesExcludes,
};
