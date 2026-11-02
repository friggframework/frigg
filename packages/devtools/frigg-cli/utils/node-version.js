/**
 * Node.js host version check for the Frigg CLI.
 *
 * osls 4 supports `^20.19.0 || ^22.13.0 || >=24`; Frigg's floor is Node 22, so
 * the CLI runs on `^22.13.0 || >=24` (ADR-050). Node 23 and Node 22.0-22.12 are
 * excluded. The range is read from this package's `engines.node`, so the check
 * and the published metadata cannot drift.
 */
const semver = require('semver');
const { engines } = require('../package.json');

const SUPPORTED_NODE_RANGE = engines.node;
const SKIP_ENV = 'FRIGG_SKIP_NODE_VERSION_CHECK';

function checkNodeVersion(version = process.versions.node, range = SUPPORTED_NODE_RANGE) {
    const coerced = semver.coerce(version);
    if (coerced && semver.satisfies(coerced, range)) {
        return { supported: true, version, range };
    }
    return {
        supported: false,
        version,
        range,
        message: [
            `Frigg CLI does not support Node.js v${String(version).replace(/^v/, '')}.`,
            `Supported versions: ${range} (the range osls 4 supports at or above Frigg's Node 22 floor).`,
            'Node 23 and Node 22.0-22.12 are not supported. Install Node 22.13+ or Node 24+, for example `nvm install 24`.',
            `To run anyway, set ${SKIP_ENV}=true (osls may fail).`,
        ].join('\n'),
    };
}

/**
 * Print a clear error and exit when the host Node.js is unsupported.
 * @returns {boolean} true when the CLI may continue
 */
function enforceNodeVersion({
    version = process.versions.node,
    env = process.env,
    log = console.error,
    exit = process.exit,
} = {}) {
    if (env[SKIP_ENV] === 'true') return true;
    const result = checkNodeVersion(version);
    if (result.supported) return true;
    log(result.message);
    exit(1);
    return false;
}

module.exports = { SUPPORTED_NODE_RANGE, checkNodeVersion, enforceNodeVersion };
