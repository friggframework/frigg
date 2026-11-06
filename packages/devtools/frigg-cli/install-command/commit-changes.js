const spawn = require('cross-spawn');
const path = require('path');
const { logInfo } = require('./logger');

function git(args, cwd) {
    return spawn.sync('git', args, { cwd, stdio: 'ignore' });
}

/**
 * Commit the files `frigg install` changed, and only those
 * (`git commit -- <paths>` leaves anything else the user has staged alone).
 *
 * Committing is a convenience: outside a git repository, or when the commit
 * fails (e.g. no git identity configured), the install still succeeds and the
 * changes are left in the working tree.
 *
 * @param {string} backendPath - Path to the app's package.json
 * @param {string} label - Integration label, for the commit message
 * @param {string[]} files - Absolute paths of the files to commit
 * @returns {boolean} whether a commit was made
 */
function commitChanges(backendPath, label, files = []) {
    const cwd = path.dirname(backendPath);
    const inRepo = git(['rev-parse', '--is-inside-work-tree'], cwd);
    if (inRepo.error || inRepo.status !== 0 || files.length === 0) {
        return false;
    }
    const relative = files.map((file) => path.relative(cwd, file));
    const add = git(['add', '--', ...relative], cwd);
    const commit =
        add.status === 0 &&
        git(
            ['commit', '-m', `Add ${label} integration`, '--', ...relative],
            cwd
        );
    if (!commit || commit.status !== 0) {
        logInfo(
            'Could not commit the changes; they are left in your working tree.'
        );
        return false;
    }
    logInfo(`Committed: Add ${label} integration`);
    return true;
}

module.exports = {
    commitChanges,
};
