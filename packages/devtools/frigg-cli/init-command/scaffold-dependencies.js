'use strict';

const path = require('path');
const semver = require('semver');

/**
 * Lowest stable Frigg 2.x release that a scaffolded app may resolve to.
 *
 * `@friggframework/core@2.0.0` exists on npm but is a deprecated, broken build
 * (an accidental 2024 release on the old mongoose/aws-sdk v2 stack). A range
 * such as `^2.0.0` resolves straight to it, so scaffolded ranges must never
 * admit 2.0.0.
 */
const MIN_STABLE_FRIGG_VERSION = '2.0.1';

/**
 * The serverless plugins the composed infrastructure loads (see
 * `infrastructure/domains/shared/utilities/base-definition-factory.js`) plus
 * the `osls` CLI that `frigg start|build|deploy` spawn. Their versions are read
 * from devtools' own package.json so the scaffold never drifts from what
 * devtools is tested with.
 */
const SERVERLESS_TOOLING = [
    'osls',
    'serverless-esbuild',
    'serverless-offline',
    'serverless-offline-sqs',
    'serverless-dotenv-plugin',
];

/**
 * Prisma packages: optional peer dependencies of `@friggframework/core` that a
 * Frigg app needs (`frigg db:setup` runs the Prisma CLI, and the generated
 * client loads `@prisma/client` at runtime).
 */
const PRISMA_PACKAGES = ['@prisma/client', 'prisma'];

/**
 * Where devtools' package.json sits when frigg-cli runs from inside
 * `@friggframework/devtools` (the normal case: `<devtools>/frigg-cli/init-command`).
 */
const LOCAL_DEVTOOLS_PACKAGE_JSON = path.join(
    __dirname,
    '..',
    '..',
    'package.json'
);
const DEVTOOLS_PACKAGE_JSON_SPECIFIER = '@friggframework/devtools/package.json';

function isModuleNotFoundFor(error, specifier) {
    return (
        Boolean(error) &&
        error.code === 'MODULE_NOT_FOUND' &&
        typeof error.message === 'string' &&
        error.message.includes(specifier)
    );
}

/**
 * Read `@friggframework/devtools`' package.json.
 *
 * frigg-cli normally ships inside devtools, two levels below its package.json.
 * It is also published on its own as `@friggframework/frigg-cli` (with
 * devtools as a peer dependency); installed that way, two levels up is
 * `node_modules/@friggframework`, which has no package.json, so resolve
 * devtools as a module instead. Only that exact "file not found" takes the
 * fallback: a malformed package.json or any other failure is rethrown so the
 * real cause is not hidden.
 *
 * @param {object} [options]
 * @param {Function} [options.requireFn] - Test seam for `require`.
 * @returns {object} devtools' package.json.
 */
function readDevtoolsPackageJson({ requireFn = require } = {}) {
    try {
        const pkg = requireFn(LOCAL_DEVTOOLS_PACKAGE_JSON);
        if (pkg && pkg.name === '@friggframework/devtools') {
            return pkg;
        }
    } catch (error) {
        if (!isModuleNotFoundFor(error, LOCAL_DEVTOOLS_PACKAGE_JSON)) {
            throw error;
        }
    }
    return requireFn(DEVTOOLS_PACKAGE_JSON_SPECIFIER);
}

function readCorePackageJson() {
    // eslint-disable-next-line global-require
    return require('@friggframework/core/package.json');
}

/**
 * Derive the semver range a scaffolded app should use for Frigg packages,
 * given the version of the devtools doing the scaffolding.
 *
 * - Prerelease (e.g. `2.0.0-next.115`): pin the exact version. A caret range
 *   on a 2.0.0 prerelease also admits the deprecated stable 2.0.0; npm happens
 *   to skip deprecated versions when it can, but other clients do not, and
 *   the moment a newer prerelease is published an unpinned range drifts away
 *   from the devtools that generated the app.
 * - Stable >= 2.0.1: `^<version>`, which can never resolve to 2.0.0.
 * - Stable below 2.0.1 (not expected): `^2.0.1`, the first good stable build.
 *
 * @param {string} version - Devtools version.
 * @returns {string} Range to write into the scaffolded package.json.
 */
function getFriggVersionRange(version) {
    const parsed = semver.valid(version);
    if (!parsed) {
        throw new Error(`Invalid @friggframework/devtools version: ${version}`);
    }
    if (semver.prerelease(parsed)) {
        return parsed;
    }
    if (semver.lt(parsed, MIN_STABLE_FRIGG_VERSION)) {
        return `^${MIN_STABLE_FRIGG_VERSION}`;
    }
    return `^${parsed}`;
}

function pickVersions(names, ...sources) {
    const result = {};
    for (const name of names) {
        const source = sources.find((deps) => deps && deps[name]);
        if (!source) {
            throw new Error(
                `Cannot determine a version for "${name}" from @friggframework/devtools`
            );
        }
        result[name] = source[name];
    }
    return result;
}

/**
 * Dependencies for a scaffolded Frigg backend's package.json.
 *
 * @param {object} [overrides] - Test seam: package.json objects to read from.
 * @param {object} [overrides.devtoolsPackageJson]
 * @param {object} [overrides.corePackageJson]
 * @returns {{dependencies: object, devDependencies: object}}
 */
function getScaffoldDependencies({
    devtoolsPackageJson = readDevtoolsPackageJson(),
    corePackageJson = readCorePackageJson(),
} = {}) {
    const friggRange = getFriggVersionRange(devtoolsPackageJson.version);

    const dependencies = sortKeys({
        '@friggframework/core': friggRange,
        ...pickVersions(
            PRISMA_PACKAGES,
            corePackageJson.peerDependencies,
            corePackageJson.devDependencies
        ),
    });

    const devDependencies = sortKeys({
        '@friggframework/devtools': friggRange,
        '@friggframework/serverless-plugin': friggRange,
        ...pickVersions(
            SERVERLESS_TOOLING,
            devtoolsPackageJson.dependencies,
            devtoolsPackageJson.devDependencies
        ),
        jest: devtoolsPackageJson.devDependencies.jest,
    });

    return { dependencies, devDependencies };
}

function sortKeys(object) {
    return Object.fromEntries(
        Object.entries(object).sort(([a], [b]) => a.localeCompare(b))
    );
}

/**
 * Scripts for a scaffolded Frigg backend. They delegate to the `frigg` binary
 * provided by the `@friggframework/devtools` devDependency.
 */
function getScaffoldScripts() {
    return {
        start: 'frigg start',
        build: 'frigg build',
        deploy: 'frigg deploy',
        'db:setup': 'frigg db:setup',
        test: 'jest --passWithNoTests',
    };
}

module.exports = {
    MIN_STABLE_FRIGG_VERSION,
    SERVERLESS_TOOLING,
    PRISMA_PACKAGES,
    LOCAL_DEVTOOLS_PACKAGE_JSON,
    readDevtoolsPackageJson,
    getFriggVersionRange,
    getScaffoldDependencies,
    getScaffoldScripts,
};
