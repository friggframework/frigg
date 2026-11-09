'use strict';

const path = require('path');

/**
 * Resolve `segments` against `base` and make sure the result stays inside
 * `base` (or is `base` itself). Every path `frigg init` writes to goes
 * through here, so a crafted name or template entry can never make it write
 * outside the project directory.
 *
 * @param {string} base - Absolute directory the result must stay within
 * @param {...string} segments
 * @returns {string} Absolute, normalized path
 */
function resolveInside(base, ...segments) {
    const root = path.resolve(base);
    const resolved = path.resolve(root, ...segments);
    const relative = path.relative(root, resolved);
    if (
        relative !== '' &&
        (relative.startsWith('..') || path.isAbsolute(relative))
    ) {
        throw new Error(`Refusing to use ${resolved}: it is outside ${root}`);
    }
    return resolved;
}

/**
 * Resolve the directory `frigg init <name>` creates.
 *
 * The argument may be a bare project name (`my-app`) or a path whose last
 * segment is the project name (`../apps/my-app`, `/tmp/my-app`). The parent
 * is resolved from the working directory and the project directory is
 * resolved inside that parent, so the last segment must be a plain name:
 * `.`, `..` and empty names are rejected (the npm package-name check in
 * initCommand rejects the rest).
 *
 * @param {string} input - CLI argument
 * @param {string} [cwd]
 * @returns {{ parentDir: string, projectDir: string, name: string }}
 */
function resolveProjectTarget(input, cwd = process.cwd()) {
    if (typeof input !== 'string' || input.trim() === '') {
        throw new Error('A project name is required');
    }
    const parentDir = path.resolve(cwd, path.dirname(input));
    const name = path.basename(input);
    if (name === '' || name === '.' || name === '..') {
        throw new Error(`Invalid project name "${name}"`);
    }
    const projectDir = resolveInside(parentDir, name);
    if (projectDir === parentDir) {
        throw new Error(`Invalid project name "${name}"`);
    }
    return { parentDir, projectDir, name };
}

module.exports = { resolveInside, resolveProjectTarget };
