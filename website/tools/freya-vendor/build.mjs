// Bundle the vendored Freya runtime for the "Ask Freya" Netlify function.
//
// Freya (@freyaframework/*) is an ESM, workspace-only monorepo that is not
// published to npm, so we vendor a prebuilt, self-contained bundle into the site
// rather than depend on it at install time. This script produces:
//
//     website/friggframework-api/lib/freya-runtime.mjs
//
// from ./entry.mjs, inlining everything reachable from @freyaframework/{core,
// runtime, llm, memory, ontology}. The only optional deps left external are the
// ones Freya loads lazily and this assistant never exercises (transformers-js
// embeddings, Postgres) — they are referenced behind dynamic imports that never
// fire here.
//
// Usage:
//     FREYA_DIR=/path/to/freya node website/tools/freya-vendor/build.mjs
//
// FREYA_DIR must point at a built Freya checkout (run `pnpm install && pnpm build`
// there first). Defaults to a sibling ../freya next to the frigg repo. Re-run this
// whenever the vendored Freya version needs to move; commit the regenerated
// freya-runtime.mjs.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(here, '..', '..'); // website/
const repoRoot = path.resolve(websiteRoot, '..'); // frigg/

const FREYA_DIR = process.env.FREYA_DIR || path.resolve(repoRoot, '..', 'freya');
const freyaModules = path.join(FREYA_DIR, 'node_modules');

if (!fs.existsSync(path.join(FREYA_DIR, 'packages', 'runtime', 'dist', 'create-agent-runtime.js'))) {
    console.error(
        `Freya build output not found under ${FREYA_DIR}.\n` +
            `Set FREYA_DIR to a checkout where "pnpm install && pnpm build" has run.`,
    );
    process.exit(1);
}

// Use the esbuild that ships in the Freya checkout so this needs no extra install.
// pnpm keeps it in the nested store rather than hoisting it, so resolve it there
// if a plain top-level require misses.
const require = createRequire(path.join(freyaModules, 'noop.js'));
function loadEsbuild() {
    try {
        return require('esbuild');
    } catch {
        const pnpmDir = path.join(freyaModules, '.pnpm');
        const entry = fs
            .readdirSync(pnpmDir)
            .filter((d) => d.startsWith('esbuild@'))
            .map((d) => path.join(pnpmDir, d, 'node_modules', 'esbuild'))
            .find((p) => fs.existsSync(p));
        if (!entry) throw new Error('esbuild not found in Freya node_modules');
        return require(entry);
    }
}
const esbuild = loadEsbuild();

// pnpm doesn't link the workspace packages into the root node_modules (the root
// doesn't depend on them), and the packages import each other by bare
// @freyaframework/* specifier. Materialize a scoped symlink tree so both our
// imports and the internal cross-package imports resolve via nodePaths.
const scopeDir = path.join(freyaModules, '@freyaframework');
fs.mkdirSync(scopeDir, { recursive: true });
for (const pkg of fs.readdirSync(path.join(FREYA_DIR, 'packages'))) {
    const target = path.join(FREYA_DIR, 'packages', pkg);
    if (!fs.existsSync(path.join(target, 'package.json'))) continue;
    const link = path.join(scopeDir, pkg);
    if (!fs.existsSync(link)) fs.symlinkSync(target, link, 'dir');
}

const outfile = path.join(websiteRoot, 'friggframework-api', 'lib', 'freya-runtime.mjs');

await esbuild.build({
    entryPoints: [path.join(here, 'entry.mjs')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    // Resolve bare @freyaframework/* specifiers against the Freya checkout.
    nodePaths: [freyaModules],
    // Lazily-imported optional deps the assistant path never touches.
    external: ['@huggingface/transformers', 'pg', 'onnxruntime-node', 'sharp'],
    legalComments: 'none',
    banner: {
        js: '// GENERATED — vendored Freya runtime. Do not edit by hand.\n' +
            '// Regenerate via website/tools/freya-vendor/build.mjs.',
    },
});

const bytes = fs.statSync(outfile).size;
console.log(`Wrote ${path.relative(repoRoot, outfile)} (${(bytes / 1024).toFixed(1)} KB)`);
