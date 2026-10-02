const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');
const semver = require('semver');

/**
 * The npm spec to install an API module with, for the app in `projectDir`.
 *
 * An app on a Frigg 2.x prerelease (e.g. `@friggframework/core@2.0.0-next.115`,
 * what `frigg init` scaffolds today) needs the API modules published under the
 * `next` dist-tag: npm's `latest` for most modules is still a 1.x release that
 * depends on `@friggframework/core@^1`. Anything else installs the default
 * (`latest`) version.
 *
 * @param {string} packageName - e.g. `@friggframework/api-module-hubspot`
 * @param {string} projectDir - Directory holding the app's package.json
 * @returns {string} npm install spec
 */
function getInstallSpec(packageName, projectDir) {
    let coreRange;
    try {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')
        );
        coreRange =
            (pkg.dependencies && pkg.dependencies['@friggframework/core']) ||
            (pkg.devDependencies &&
                pkg.devDependencies['@friggframework/core']);
    } catch (error) {
        return packageName;
    }
    const min =
        coreRange && semver.validRange(coreRange)
            ? semver.minVersion(coreRange)
            : null;
    if (min && min.major >= 2 && min.prerelease.length > 0) {
        return `${packageName}@next`;
    }
    return packageName;
}

/**
 * `npm install <spec>` in the app directory. Arguments are passed as an
 * array (no shell), so a package name can never be interpreted as a command.
 *
 * @param {string} backendPath - Path to the app's package.json
 * @param {string} spec - npm install spec
 */
function installPackage(backendPath, spec) {
    const result = spawn.sync('npm', ['install', spec], {
        cwd: path.dirname(backendPath),
        stdio: 'inherit',
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(
            `npm install ${spec} exited with code ${result.status}`
        );
    }
}

module.exports = {
    getInstallSpec,
    installPackage,
};
