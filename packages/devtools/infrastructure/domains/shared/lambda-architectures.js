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

module.exports = {
    LAMBDA_ARCHITECTURES,
    DEFAULT_LAMBDA_ARCHITECTURE,
    resolveLambdaArchitecture,
};
