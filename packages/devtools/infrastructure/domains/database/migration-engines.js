/**
 * Migration worker engines
 *
 * Domain Layer - Hexagonal Architecture
 *
 * The migration worker runs the Prisma CLI, which needs the schema engine
 * and the query engine library for the Lambda architecture it runs on. Both
 * ship from node_modules/@prisma/engines/, where the @prisma/engines
 * postinstall put the deploy host's own engines. This fetches the deployed
 * architecture's pair before packaging, and fails packaging when either is
 * still missing, so a worker can never try to download an engine into the
 * read-only /var/task at cold start.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { prismaEngineFileNames, PRISMA_ENGINES_PACKAGE_DIR } = require('../shared/lambda-architectures');

function resolveEnginesDir(cwd) {
    const enginesDir = path.join(cwd, PRISMA_ENGINES_PACKAGE_DIR);
    if (!fs.existsSync(path.join(enginesDir, 'scripts', 'postinstall.js'))) {
        throw new Error(
            `@prisma/engines was not found at ${enginesDir}.\n` +
                'The app must have prisma installed in its own node_modules, not only in a hoisted parent: ' +
                'the migration worker ships its engines from the app\'s node_modules.'
        );
    }
    return enginesDir;
}

/**
 * Runs the @prisma/engines postinstall for one target. It downloads only
 * the engines that are missing, so the host's own engines stay.
 */
function runEnginesPostinstall({ enginesDir, prismaBinaryTarget }) {
    execFileSync(
        process.execPath,
        [path.join(enginesDir, 'scripts', 'postinstall.js')],
        {
            cwd: enginesDir,
            stdio: 'inherit',
            env: { ...process.env, PRISMA_CLI_BINARY_TARGETS: prismaBinaryTarget },
        }
    );
}

/**
 * @param {Object} options
 * @param {string} options.prismaBinaryTarget - The engine the deployed architecture loads
 * @param {string} [options.cwd] - The app root
 * @param {string} [options.enginesDir] - node_modules/@prisma/engines of the app
 * @param {Function} [options.fetchEngines] - Fetches the target's engines into enginesDir
 * @throws {Error} When either engine is missing after the fetch
 */
async function ensureMigrationEngines({
    prismaBinaryTarget,
    cwd = process.cwd(),
    enginesDir = resolveEnginesDir(cwd),
    fetchEngines = runEnginesPostinstall,
}) {
    const engineNames = Object.values(prismaEngineFileNames(prismaBinaryTarget));
    const missing = () =>
        engineNames.filter((name) => !fs.existsSync(path.join(enginesDir, name)));

    if (missing().length === 0) {
        console.log(`✓ Prisma ${prismaBinaryTarget} migration engines present in ${enginesDir}`);
        return;
    }

    console.log(
        `📦 Fetching ${missing().join(', ')} (Prisma ${prismaBinaryTarget}) into ${enginesDir}...`
    );
    fetchEngines({ enginesDir, prismaBinaryTarget });

    const stillMissing = missing();
    if (stillMissing.length > 0) {
        throw new Error(
            `Prisma migration engines for ${prismaBinaryTarget} are missing after the fetch: ` +
                `${stillMissing.join(', ')} (in ${enginesDir}).\n` +
                "The deploy host must reach Prisma's engine CDN (binaries.prisma.sh) at package time."
        );
    }
}

module.exports = {
    ensureMigrationEngines,
};
