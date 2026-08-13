const fs = require('fs');
const path = require('path');

/**
 * Static guards over the module graph that `require('@friggframework/core')`
 * loads. Two distinct classes of bug, both of which shipped:
 *
 * 1. An undeclared package required at load time. `@aws-sdk/client-scheduler`
 *    was required at the top of infrastructure/scheduler/eventbridge-scheduler-adapter.js
 *    — reached from index.js via application/index.js -> application/commands/scheduler-commands.js
 *    -> infrastructure/scheduler/index.js — but listed only in
 *    packages/admin-scripts/package.json. npm workspace hoisting resolved it
 *    inside this monorepo, so nothing here failed, while every external consumer
 *    got `Cannot find module '@aws-sdk/client-scheduler'` on their first require.
 *
 * 2. A relative require pointing at a path that does not exist.
 *    database/encryption/encryption-schema-registry.js required
 *    '../integrations/utils/map-integration-dto' where the file is two levels up,
 *    so it threw MODULE_NOT_FOUND at runtime for any caller that got past the
 *    early returns.
 *
 * Both are invisible to the normal suites — the first because of hoisting, the
 * second because it is a lazy require on a conditional path. So this test does
 * not import anything; it reads the source and checks it against package.json,
 * which is the only way to see either problem from inside the repo.
 *
 * The two checks have deliberately different scopes:
 *   - Undeclared packages: only EAGER (top-level) requires, because only those
 *     can crash a consumer's `require()`.
 *   - Unresolved relative paths: ALL requires, eager or lazy, because a wrong
 *     path is a bug whenever it runs.
 */

const CORE_ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
    // Node supports a package requiring itself by name; several handlers do.
    pkg.name,
]);

const BUILTINS = new Set(
    require('module').builtinModules.flatMap((m) => [m, `node:${m}`])
);

/**
 * Single pass over the source producing two same-length views:
 *
 *   code:     comments blanked, string literals intact  -> match require() calls
 *   skeleton: comments AND string contents blanked      -> count brace depth
 *
 * Same length means an offset found in `code` indexes correctly into `skeleton`.
 * Without this, a `//` inside a string reads as a comment and a `{` inside a
 * string corrupts the depth count — which is how an earlier version of this test
 * reported a commented-out `require('source-map-support')` as a real dependency.
 */
function tokenize(source) {
    const code = [...source];
    const skeleton = [...source];
    const blank = (i) => {
        if (source[i] !== '\n') skeleton[i] = ' ';
    };
    const blankBoth = (i) => {
        if (source[i] !== '\n') {
            code[i] = ' ';
            skeleton[i] = ' ';
        }
    };

    let i = 0;
    while (i < source.length) {
        const c = source[i];
        const next = source[i + 1];

        if (c === '/' && next === '/') {
            while (i < source.length && source[i] !== '\n') blankBoth(i++);
            continue;
        }
        if (c === '/' && next === '*') {
            blankBoth(i++);
            blankBoth(i++);
            while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
                blankBoth(i++);
            }
            blankBoth(i++);
            blankBoth(i++);
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            const quote = c;
            i += 1; // keep the opening quote in `code`
            blank(i - 1);
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\') {
                    blank(i);
                    i += 1;
                }
                blank(i);
                i += 1;
            }
            blank(i);
            i += 1;
            continue;
        }
        i += 1;
    }

    return { code: code.join(''), skeleton: skeleton.join('') };
}

function depthAt(skeleton, offset) {
    let depth = 0;
    for (let i = 0; i < offset; i += 1) {
        const c = skeleton[i];
        if (c === '{' || c === '(' || c === '[') depth += 1;
        else if (c === '}' || c === ')' || c === ']') depth -= 1;
    }
    return depth;
}

const REQUIRE_PATTERN = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

function packageNameOf(specifier) {
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function resolveRelative(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base, `${base}.js`, path.join(base, 'index.js'), `${base}.json`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
}

// Walks the require graph from index.js. Traversal follows relative requires
// whether eager or lazy, so lazily-reached files are still checked for broken
// paths; only the eager/lazy classification of each require differs.
function walkGraph(entry) {
    const visited = new Set();
    const eagerBare = new Map();
    const unresolved = [];
    const queue = [path.resolve(entry)];

    while (queue.length) {
        const file = queue.pop();
        if (visited.has(file) || !file.endsWith('.js')) continue;
        visited.add(file);

        const source = fs.readFileSync(file, 'utf8');
        const { code, skeleton } = tokenize(source);
        const relative = path.relative(CORE_ROOT, file);

        for (const match of code.matchAll(REQUIRE_PATTERN)) {
            const specifier = match[1];

            if (specifier.startsWith('.')) {
                const resolved = resolveRelative(file, specifier);
                if (resolved) queue.push(resolved);
                else unresolved.push(`${relative} -> ${specifier}`);
                continue;
            }
            if (specifier.startsWith('/')) continue;

            // A require nested inside any block or call is lazy and cannot fail
            // at load time.
            if (depthAt(skeleton, match.index) !== 0) continue;

            const name = packageNameOf(specifier);
            if (BUILTINS.has(name) || BUILTINS.has(specifier)) continue;
            if (!eagerBare.has(name)) eagerBare.set(name, []);
            eagerBare.get(name).push(relative);
        }
    }

    return { visited, eagerBare, unresolved };
}

describe('core module graph', () => {
    const { visited, eagerBare, unresolved } = walkGraph(path.join(CORE_ROOT, 'index.js'));

    it('actually walked a substantial graph', () => {
        // A silently empty walk would make this suite a no-op that reads as a
        // pass — the exact class of bug it is here to catch.
        expect(visited.size).toBeGreaterThan(50);
        expect(eagerBare.size).toBeGreaterThan(5);
    });

    it('resolves every relative require', () => {
        expect(unresolved).toEqual([]);
    });

    it('declares every package required at load time', () => {
        const undeclared = [...eagerBare.entries()].filter(([name]) => !declared.has(name));
        const report = undeclared
            .map(([name, files]) => `  ${name}  <- ${[...new Set(files)].slice(0, 3).join(', ')}`)
            .join('\n');

        expect(undeclared.length === 0 ? '' : `Undeclared:\n${report}`).toEqual('');
    });

    it('reaches and declares @aws-sdk/client-scheduler specifically', () => {
        // Named because it is the regression. If a refactor makes the scheduler
        // lazy, drop the first assertion — but losing the declaration while it
        // is still eager must fail here.
        expect([...eagerBare.keys()]).toContain('@aws-sdk/client-scheduler');
        expect(declared.has('@aws-sdk/client-scheduler')).toBe(true);
    });

    describe('the tokenizer these checks depend on', () => {
        // If the tokenizer over- or under-blanks, the checks above silently stop
        // meaning anything, so it is pinned directly.
        it('ignores a commented-out require', () => {
            const { code } = tokenize(`// require('ghost');\nrequire('real');`);
            expect([...code.matchAll(REQUIRE_PATTERN)].map((m) => m[1])).toEqual(['real']);
        });

        it('ignores a require inside a block comment', () => {
            const { code } = tokenize(`/*\n require('ghost');\n*/\nrequire('real');`);
            expect([...code.matchAll(REQUIRE_PATTERN)].map((m) => m[1])).toEqual(['real']);
        });

        it('does not treat // inside a string as starting a comment', () => {
            const { code } = tokenize(`const u = 'http://x';\nrequire('real');`);
            expect([...code.matchAll(REQUIRE_PATTERN)].map((m) => m[1])).toEqual(['real']);
        });

        it('does not let a brace inside a string skew the depth count', () => {
            const source = `const s = '{';\nconst x = require('top');`;
            const { code, skeleton } = tokenize(source);
            const match = [...code.matchAll(REQUIRE_PATTERN)][0];
            expect(depthAt(skeleton, match.index)).toEqual(0);
        });

        it('classifies a require inside a function as lazy', () => {
            const source = `function f() {\n    const jwt = require('lazy');\n}`;
            const { code, skeleton } = tokenize(source);
            const match = [...code.matchAll(REQUIRE_PATTERN)][0];
            expect(depthAt(skeleton, match.index)).toBeGreaterThan(0);
        });

        it('classifies a multi-line top-level destructure as eager', () => {
            // The exact shape of the scheduler require that started all this.
            const source = `const {\n    A,\n    B,\n} = require('@aws-sdk/client-scheduler');`;
            const { code, skeleton } = tokenize(source);
            const match = [...code.matchAll(REQUIRE_PATTERN)][0];
            expect(depthAt(skeleton, match.index)).toEqual(0);
        });

        it('preserves offsets so the two views stay aligned', () => {
            const source = `// a comment with 'quotes'\nconst x = require('real');`;
            const { code, skeleton } = tokenize(source);
            expect(code).toHaveLength(source.length);
            expect(skeleton).toHaveLength(source.length);
        });
    });
});
