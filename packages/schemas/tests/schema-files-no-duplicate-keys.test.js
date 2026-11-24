const fs = require('fs');
const path = require('path');

/**
 * JSON.parse keeps the last of two equal keys without a word, so a schema
 * with a key written twice silently drops the first definition. Every schema
 * file must have each key at most once per object.
 */

const SCHEMAS_DIR = path.join(__dirname, '..', 'schemas');

function schemaFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return schemaFiles(full);
        return entry.name.endsWith('.json') ? [full] : [];
    });
}

/**
 * Returns `{ key, pointer }` for every key that repeats within one object.
 * Assumes valid JSON (JSON.parse runs first).
 */
function findDuplicateKeys(text) {
    const duplicates = [];
    // One frame per open object or array: { keys, path, isObject, nextKey }
    const stack = [];
    let i = 0;

    const readString = () => {
        let out = '';
        i++; // opening quote
        while (text[i] !== '"') {
            if (text[i] === '\\') {
                out += text.slice(i, i + 2);
                i += 2;
            } else {
                out += text[i++];
            }
        }
        i++; // closing quote
        return JSON.parse(`"${out}"`);
    };
    const skipSpace = () => {
        while (/\s/.test(text[i] || '')) i++;
    };

    while (i < text.length) {
        skipSpace();
        const ch = text[i];
        const top = stack[stack.length - 1];
        if (ch === '{' || ch === '[') {
            const parentPath = top
                ? [...top.path, top.isObject ? top.currentKey : top.index]
                : [];
            stack.push({
                isObject: ch === '{',
                keys: new Set(),
                path: parentPath,
                expectKey: ch === '{',
                index: 0,
            });
            i++;
        } else if (ch === '}' || ch === ']') {
            stack.pop();
            i++;
        } else if (ch === ',') {
            if (top.isObject) top.expectKey = true;
            else top.index++;
            i++;
        } else if (ch === ':') {
            i++;
        } else if (ch === '"') {
            const value = readString();
            if (top && top.isObject && top.expectKey) {
                if (top.keys.has(value)) {
                    duplicates.push({
                        key: value,
                        pointer: `/${[...top.path, value].join('/')}`,
                    });
                }
                top.keys.add(value);
                top.currentKey = value;
                top.expectKey = false;
            }
        } else if (ch === undefined) {
            break;
        } else {
            // number, true, false, null
            while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
        }
    }
    return duplicates;
}

describe('schema files', () => {
    describe('the duplicate key check', () => {
        it('finds a repeated key, with its location', () => {
            expect(
                findDuplicateKeys(
                    '{"properties": {"a": {"x": 1}, "b": [1, {"c": "}\\"", "c": 2}], "a": {}}}'
                )
            ).toEqual([
                { key: 'c', pointer: '/properties/b/1/c' },
                { key: 'a', pointer: '/properties/a' },
            ]);
        });

        it('allows the same key in different objects', () => {
            expect(
                findDuplicateKeys('{"a": {"type": "string"}, "b": {"type": "string"}}')
            ).toEqual([]);
        });
    });

    const files = schemaFiles(SCHEMAS_DIR);

    it('finds the schema files', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    it.each(files.map((file) => [path.relative(SCHEMAS_DIR, file), file]))(
        '%s has no duplicate keys',
        (_name, file) => {
            const text = fs.readFileSync(file, 'utf8');
            expect(() => JSON.parse(text)).not.toThrow();
            expect(findDuplicateKeys(text)).toEqual([]);
        }
    );
});
