#!/usr/bin/env node

/**
 * Copy the Frigg JSON Schemas into the website, at the path their `$id` names.
 *
 *   https://friggframework.org/schemas/<name>/v<x.y>.json
 *     -> website/schemas/<name>/v<x.y>.json
 *
 * The copies are committed: friggframework.org is published from website/ as
 * static files, and a file stays in website/schemas after its schema moves to
 * a new version, so every published version keeps resolving.
 *
 *   node scripts/sync-hosted-schemas.js          write the copies
 *   node scripts/sync-hosted-schemas.js --check  exit 1 when a copy is missing or stale
 *
 * See ADR-051, "Hosted schemas" amendment.
 */

const fs = require('fs');
const path = require('path');
const { parseSchemaId } = require('../schema-ids');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const WEBSITE_ROOT = path.join(REPO_ROOT, 'website');

// Directories whose *.schema.json files are published. A directory that does
// not exist on this branch is skipped.
const SOURCE_DIRS = [
    'packages/schemas/schemas',
    'packages/core/integrations/definitions/schema',
];

/**
 * @returns {Array<{ source: string, id: string, hostedPath: string, target: string, content: string }>}
 * @throws when a schema has no `$id` on the pattern, or two schemas claim one URL
 */
function planHostedSchemas() {
    const plan = [];
    const byHostedPath = new Map();

    for (const dir of SOURCE_DIRS) {
        const absDir = path.join(REPO_ROOT, dir);
        if (!fs.existsSync(absDir)) continue;

        for (const file of fs.readdirSync(absDir).filter(f => f.endsWith('.schema.json')).sort()) {
            const source = path.posix.join(dir, file);
            const content = fs.readFileSync(path.join(absDir, file), 'utf8');
            const id = JSON.parse(content).$id;
            const parsed = parseSchemaId(id);
            if (!parsed) {
                throw new Error(
                    `${source}: $id ${JSON.stringify(id)} is not https://friggframework.org/schemas/<name>/v<major>.<minor>.json`
                );
            }
            if (byHostedPath.has(parsed.hostedPath)) {
                throw new Error(
                    `${source} and ${byHostedPath.get(parsed.hostedPath)} both have the $id ${id}`
                );
            }
            byHostedPath.set(parsed.hostedPath, source);
            plan.push({
                source,
                id,
                hostedPath: parsed.hostedPath,
                target: path.join(WEBSITE_ROOT, parsed.hostedPath),
                content,
            });
        }
    }
    return plan;
}

function main() {
    const check = process.argv.includes('--check');
    const plan = planHostedSchemas();
    const stale = [];

    for (const entry of plan) {
        const current = fs.existsSync(entry.target) ? fs.readFileSync(entry.target, 'utf8') : null;
        if (current === entry.content) continue;
        if (check) {
            stale.push(entry);
            continue;
        }
        fs.mkdirSync(path.dirname(entry.target), { recursive: true });
        fs.writeFileSync(entry.target, entry.content);
        console.log(`wrote website/${entry.hostedPath} (from ${entry.source})`);
    }

    if (check && stale.length > 0) {
        for (const entry of stale) {
            console.error(`website/${entry.hostedPath} is missing or differs from ${entry.source}`);
        }
        console.error('Run `npm run sync:hosted --workspace=packages/schemas` and commit the result.');
        process.exit(1);
    }
    if (check) console.log(`${plan.length} hosted schemas in sync.`);
}

if (require.main === module) main();

module.exports = { planHostedSchemas, REPO_ROOT, WEBSITE_ROOT, SOURCE_DIRS };
