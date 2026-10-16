/**
 * Jest defaults, plus a guard that stops any test from running a package
 * manager install/prune against a real node_modules (test/npm-install-guard.js).
 */
module.exports = {
    setupFiles: ['<rootDir>/test/npm-install-guard.js'],
};
