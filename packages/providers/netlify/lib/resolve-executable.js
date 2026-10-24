/**
 * Resolve a command name to the absolute path of an executable, without a
 * shell and without trusting relative PATH entries.
 *
 * Spawning a bare command name lets the OS search PATH, and a PATH entry such
 * as '.', '' or 'node_modules/.bin' is relative to the working directory, so
 * whatever sits in that directory under the command's name would run. Here
 * only absolute PATH directories are searched, the file must be executable,
 * and the caller spawns the absolute path it gets back.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {string} command - bare command name, e.g. 'netlify'
 * @param {Object} [options]
 * @param {string} [options.pathEnv] - PATH to search (default process.env.PATH)
 * @param {string} [options.platform] - default process.platform
 * @param {string} [options.pathExt] - Windows PATHEXT (default process.env.PATHEXT)
 * @returns {string|null} absolute path of the executable, or null
 */
function resolveExecutable(command, options = {}) {
    const {
        pathEnv = process.env.PATH || '',
        platform = process.platform,
        pathExt = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD',
    } = options;
    if (!command || command.includes('/') || command.includes('\\')) return null;

    const isWindows = platform === 'win32';
    const delimiter = isWindows ? ';' : ':';
    const pathApi = isWindows ? path.win32 : path.posix;
    const names = isWindows
        ? ['', ...pathExt.split(';').filter(Boolean)].map((ext) => command + ext)
        : [command];

    for (const dir of pathEnv.split(delimiter)) {
        if (!dir || !pathApi.isAbsolute(dir)) continue;
        for (const name of names) {
            const candidate = pathApi.join(dir, name);
            try {
                const stat = fs.statSync(candidate);
                if (!stat.isFile()) continue;
                if (!isWindows) fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
            } catch {
                // not here, or not executable
            }
        }
    }
    return null;
}

module.exports = { resolveExecutable };
