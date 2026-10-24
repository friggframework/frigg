const os = require('os');
const path = require('path');
const childProcess = require('child_process');
// Read before this file loads the guard itself: jest's setupFiles must have
// installed it already, for every test file.
const guardedBySetup = Boolean(childProcess.execSync[Symbol.for('frigg.devtools.npmInstallGuard')]);
const { offending } = require('./npm-install-guard');

const repoDir = path.resolve(__dirname, '..');

describe('npm install guard (jest setupFiles)', () => {
    // Every command here is a --dry-run, so even a broken guard that let it
    // through could not rewrite this repository's node_modules.
    it('is installed by jest setupFiles, before any test code runs', () => {
        expect(guardedBySetup).toBe(true);
    });

    it('blocks installs and prunes on the real child_process', () => {
        expect(() =>
            childProcess.execSync('npm install --dry-run --omit=dev', { cwd: repoDir, stdio: 'ignore' })
        ).toThrow(/outside the temp directory/);
        expect(() =>
            childProcess.spawnSync('npm', ['prune', '--dry-run'], { cwd: repoDir, stdio: 'ignore' })
        ).toThrow(/outside the temp directory/);
        expect(() =>
            childProcess.execFileSync('/usr/bin/npm', ['ci', '--dry-run'], { cwd: repoDir, stdio: 'ignore' })
        ).toThrow(/outside the temp directory/);
    });

    it('treats a temp dir inside this repository as part of the repository', () => {
        // A checkout may itself live under os.tmpdir() (as in some sandboxes).
        expect(offending(['npm', 'install'], path.join(repoDir, 'layers/prisma/nodejs'))).not.toBeNull();
    });

    it.each([
        [['npm', 'install', '--omit=dev'], repoDir, true],
        [['npm', 'ci'], repoDir, true],
        [['yarn', 'add', 'x'], repoDir, true],
        [['npm', 'install', '--prefix', repoDir], os.tmpdir(), true],
        [['npm', 'install'], os.tmpdir(), false],
        [['npm', 'install', '--prefix', path.join(os.tmpdir(), 'layer')], repoDir, false],
        [['npm', 'root'], repoDir, false],
        [['npm', 'run', 'build'], repoDir, false],
        [['npx', 'netlify-cli', 'deploy'], repoDir, false],
        [['git', 'install'], repoDir, false],
    ])('%j in %s -> blocked %s', (tokens, cwd, blocked) => {
        expect(offending(tokens, cwd) !== null).toBe(blocked);
    });

    it('lets harmless commands through', () => {
        expect(childProcess.execSync('node -e "process.stdout.write(\'ok\')"', { encoding: 'utf8' })).toBe('ok');
    });
});
