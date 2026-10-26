'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {receive} = require('./receive.cjs');
const {fetchRelease} = require('./registry.cjs');
const {importRelease} = require('./import.cjs');
const modules = require('./modules.json');

const repo = 'friggframework/frigg';
const branch = 'docs/module-releases';
const run = (program, args) => execFileSync(program, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

async function main() {
    const prs = JSON.parse(run('gh', ['pr', 'list', '--repo', repo, '--head', branch, '--base', 'next', '--state', 'open', '--json', 'number']));
    const remote = run('git', ['ls-remote', 'origin', `refs/heads/${branch}`]);
    const oldHead = remote.split(/\s/)[0];
    if (prs.length) {
        assert(prs.length === 1 && /^[a-f0-9]{40}$/.test(oldHead), 'Unexpected pending docs PR state');
        run('git', ['fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`]);
        const paths = run('git', ['ls-tree', '-r', '--name-only', `origin/${branch}`, 'docs/api-modules/']).split('\n');
        for (const filename of paths.filter(x => /^docs\/api-modules\/[^/]+\/versions\/[^/]+\/release\.json$/.test(x))) {
            // Only use the pending branch to discover identities. Retrieve and verify
            // their bytes again from npm; never execute or trust code on that branch.
            const saved = JSON.parse(run('git', ['show', `origin/${branch}:${filename}`]));
            const allowed = modules.find(x => x.package === saved.bundle?.manifest?.package);
            assert(allowed, 'Unrecognized pending module');
            const imported = path.join(process.cwd(), filename);
            if (fs.existsSync(imported)) continue;
            importRelease(process.cwd(), await fetchRelease(allowed, saved.bundle.manifest.version), modules);
        }
    }
    await receive(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
    run('git', ['checkout', '-B', branch]);
    run('git', ['add', '--', 'docs/SUMMARY.md', 'docs/api-modules', 'website/data/catalog']);
    const diff = spawnSync('git', ['diff', '--cached', '--quiet']);
    assert([0, 1].includes(diff.status), 'Could not inspect staged changes');
    if (diff.status === 0) { console.log('All requested releases are already imported.'); return; }
    run('git', ['diff', '--cached', '--check']);
    run('git', ['config', 'user.name', 'frigg-module-docs[bot]']);
    run('git', ['config', 'user.email', 'module-docs@users.noreply.github.com']);
    run('git', ['commit', '-m', 'docs: import published module documentation and catalog [skip release]']);
    run('git', ['push', `--force-with-lease=refs/heads/${branch}:${oldHead || ''}`, 'origin', `HEAD:refs/heads/${branch}`]);
    if (!prs.length) {
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'module-docs-pr-'));
        try {
            const body = path.join(temp, 'body.md');
            fs.writeFileSync(body, 'Imports documentation for published npm package versions, preserving exact release snapshots and updating GitBook navigation and the website catalog.\n\nBundles were retrieved from allowlisted npm packages and checked against their sha512 package integrity. Generated module links, navigation, immutable identities, and catalog metadata were validated.\n\nReview and merge into `next`; subsequent release events rebuild this PR against current `next` and replay pending versions. See ADR-065.\n');
            console.log(run('gh', ['pr', 'create', '--repo', repo, '--base', 'next', '--head', branch, '--title', 'docs: import released API module documentation', '--body-file', body]));
        } finally { fs.rmSync(temp, {recursive: true, force: true}); }
    } else console.log(`Updated https://github.com/${repo}/pull/${prs[0].number}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\nModule docs delivery: PR ready for review; GitBook and website publication remain pending merge and their respective deployments.\n');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
