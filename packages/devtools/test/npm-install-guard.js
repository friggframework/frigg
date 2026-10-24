/**
 * Jest setup: no test may run a package-manager command that rewrites a
 * node_modules tree outside the OS temp directory.
 *
 * Why: two infrastructure tests composed a serverless definition in parallel,
 * each building the real Prisma layer under packages/devtools/layers/prisma.
 * One cleaned the layer while the other's `npm install --omit=dev` was
 * starting, npm found no package.json in its cwd, walked up into the
 * monorepo workspace and pruned the devDependencies (jest, jest-util) out of
 * the repository's root node_modules. Every later workspace then failed with
 * `jest: not found`.
 *
 * The guard wraps the real child_process functions. A test that mocks
 * child_process (jest.mock) gets its mock and is unaffected; anything that
 * reaches the real module with, for example, `npm install` in a repository
 * directory throws instead of running.
 */
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PACKAGE_MANAGERS = new Set(['npm', 'npx', 'yarn', 'pnpm']);
const MUTATING = new Set([
    'install', 'i', 'in', 'ci', 'add', 'prune', 'uninstall', 'remove', 'rm', 'r', 'un',
    'update', 'up', 'upgrade', 'dedupe', 'link', 'rebuild',
]);

function realpathOrSelf(p) {
    try {
        return fs.realpathSync(p);
    } catch {
        return path.resolve(p);
    }
}

const TMP = realpathOrSelf(os.tmpdir());
// The monorepo root (packages/devtools/test -> ../../..). A checkout can
// itself live under the temp directory, so "under tmp" alone is not enough.
const REPO_ROOT = realpathOrSelf(path.resolve(__dirname, '..', '..', '..'));

const within = (dir, root) => dir === root || dir.startsWith(root + path.sep);

/** True only for a scratch directory: under tmp and outside this repository. */
function insideTmp(dir) {
    const real = realpathOrSelf(dir);
    return within(real, TMP) && !within(real, REPO_ROOT);
}

/** @returns {string|null} the offending command, or null when allowed */
function offending(tokens, cwd) {
    const [bin, ...args] = tokens;
    if (!bin || !PACKAGE_MANAGERS.has(path.basename(String(bin)))) return null;
    const sub = args.find((a) => !String(a).startsWith('-'));
    // npx <pkg> runs a package; only installs/prunes rewrite node_modules.
    if (path.basename(String(bin)) === 'npx' || !MUTATING.has(sub)) return null;
    const prefixAt = args.indexOf('--prefix');
    const target = prefixAt >= 0 ? args[prefixAt + 1] : cwd;
    if (insideTmp(target || process.cwd())) return null;
    return tokens.join(' ');
}

const GUARDED = Symbol.for('frigg.devtools.npmInstallGuard');

function guard(name, fn, toTokens) {
    // setupFiles runs once per test file in a shared worker: wrap once.
    if (fn[GUARDED]) return fn;
    const guarded = function guarded(...callArgs) {
        const { tokens, cwd } = toTokens(callArgs);
        const bad = offending(tokens, cwd);
        if (bad) {
            throw new Error(
                `Test tried to run "${bad}" outside the temp directory (cwd ${cwd || process.cwd()}); ` +
                    'it would rewrite a real node_modules. Mock it or run it in a temp dir.'
            );
        }
        return fn.apply(this, callArgs);
    };
    guarded[GUARDED] = true;
    return guarded;
}

const fromString = ([command, options]) => ({
    tokens: String(command).trim().split(/\s+/),
    cwd: options?.cwd,
});
const fromFile = ([file, args, options]) =>
    Array.isArray(args)
        ? { tokens: [file, ...args], cwd: options?.cwd }
        : { tokens: [file], cwd: args?.cwd };

for (const name of ['execSync', 'exec']) {
    childProcess[name] = guard(name, childProcess[name], fromString);
}
for (const name of ['execFileSync', 'execFile', 'spawn', 'spawnSync']) {
    const original = childProcess[name];
    childProcess[name] = guard(name, original, (callArgs) => {
        const opts = Array.isArray(callArgs[1]) ? callArgs[2] : callArgs[1];
        if (opts?.shell && !Array.isArray(callArgs[1])) return fromString([callArgs[0], opts]);
        return fromFile(callArgs);
    });
}

module.exports = { offending, insideTmp };
