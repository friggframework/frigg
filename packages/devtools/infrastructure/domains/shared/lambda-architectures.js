/**
 * Lambda architectures and the Prisma engine each one runs.
 *
 * The registry keys are the AWS architecture names, so they go into
 * `provider.architecture` and the layer `compatibleArchitectures` as they
 * are. Every architecture-dependent value (layer build, layer cache key,
 * migration worker engines, package excludes) reads from here.
 */

const LAMBDA_ARCHITECTURES = {
    x86_64: { prismaBinaryTarget: 'rhel-openssl-3.0.x' },
    arm64: { prismaBinaryTarget: 'linux-arm64-openssl-3.0.x' },
};

const DEFAULT_LAMBDA_ARCHITECTURE = 'x86_64';

/**
 * @param {Object} appDefinition
 * @returns {{ name: string, prismaBinaryTarget: string, explicit: boolean }}
 *   `explicit` is false when the app definition does not set `architecture`,
 *   so callers can leave the template unchanged for existing apps.
 * @throws {Error} on an architecture the registry does not know
 */
function resolveLambdaArchitecture(appDefinition = {}) {
    const explicit = appDefinition.architecture !== undefined;
    const name = explicit
        ? appDefinition.architecture
        : DEFAULT_LAMBDA_ARCHITECTURE;
    const entry = LAMBDA_ARCHITECTURES[name];
    if (!entry) {
        throw new Error(
            `Unknown Lambda architecture '${name}'. ` +
                `Set architecture to one of: ${Object.keys(
                    LAMBDA_ARCHITECTURES
                ).join(', ')}`
        );
    }
    return { name, prismaBinaryTarget: entry.prismaBinaryTarget, explicit };
}

/**
 * The two engine files `prisma migrate` needs for a target, as
 * @prisma/engines names them.
 * @param {string} prismaBinaryTarget
 * @returns {{ schemaEngine: string, queryEngineLibrary: string }}
 */
function prismaEngineFileNames(prismaBinaryTarget) {
    return {
        schemaEngine: `schema-engine-${prismaBinaryTarget}`,
        queryEngineLibrary: `libquery_engine-${prismaBinaryTarget}.so.node`,
    };
}

const HOST_PLATFORM_ENGINE_EXCLUDES = [
    '**/*darwin*',
    '**/*-debian-*',
    '**/*-linux-musl*',
    '**/*windows*',
];

/**
 * Package exclude patterns for every Prisma engine the named architecture
 * does not load: the deploy host's own platforms and the other Lambda
 * architectures.
 * @param {string} name - A registry key
 * @returns {string[]}
 */
function foreignPrismaEngineExcludes(name) {
    return [
        ...HOST_PLATFORM_ENGINE_EXCLUDES,
        ...Object.entries(LAMBDA_ARCHITECTURES)
            .filter(([other]) => other !== name)
            .map(([, { prismaBinaryTarget }]) => `**/*-${prismaBinaryTarget}*`),
    ];
}

module.exports = {
    LAMBDA_ARCHITECTURES,
    DEFAULT_LAMBDA_ARCHITECTURE,
    resolveLambdaArchitecture,
    prismaEngineFileNames,
    foreignPrismaEngineExcludes,
};
