'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {loadReleases, importRelease} = require('./import.cjs');
const modules = require('./modules.json');
for (const entry of modules) {
    for (const release of loadReleases(process.cwd(), entry.id)) {
        assert.equal(importRelease(process.cwd(), release, modules, {checkOnly: true}).changed, 0, 'Generated docs/catalog/navigation are stale');
    }
}
const records = JSON.parse(fs.readFileSync(path.join('website/data/catalog/index.json'), 'utf8'));
for (const record of records) assert(modules.some(x => x.id === record.identity.id), 'Unknown directory record');
console.log('Imported release snapshots and generated projections verified.');
