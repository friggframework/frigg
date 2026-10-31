'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const {fetchRelease} = require('./registry.cjs');
const {importRelease} = require('./import.cjs');
const allowedModules = require('./modules.json');
const {semver} = require('./contract.cjs');

async function receive(event, root = process.cwd(), fetchImpl = fetch) {
    const input = event.client_payload || event.inputs;
    assert(input && Object.keys(input).sort().join(',') === 'package,version', 'Expected only package and version');
    const allowed = allowedModules.find(x => x.package === input.package);
    assert(allowed, 'Package is not allowlisted');
    semver(input.version);
    const release = await fetchRelease(allowed, input.version, fetchImpl);
    return importRelease(root, release, allowedModules);
}

module.exports = {receive};
if (require.main === module) {
    receive(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))).then(console.log).catch(error => {
        console.error(error.message); process.exitCode = 1;
    });
}
