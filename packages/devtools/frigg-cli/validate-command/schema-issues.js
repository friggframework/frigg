/**
 * Turn Ajv errors from the app-definition schema into validation issues:
 * { severity, code, pointer, message, hint }. The pointer is a JSON pointer
 * into the app definition (RFC 6901).
 */

function appendPointer(pointer, key) {
    const escaped = String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    return `${pointer}/${escaped}`;
}

function schemaNodeAt(schema, schemaPath) {
    // schemaPath looks like "#/properties/vpc/properties/management/enum"
    const parts = schemaPath.replace(/^#\/?/, '').split('/').filter(Boolean);
    parts.pop(); // drop the keyword
    let node = schema;
    for (const part of parts) {
        if (!node) return undefined;
        node = node[part.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    return node;
}

function knownKeys(schemaNode) {
    return Object.keys(schemaNode?.properties || {});
}

function closest(word, candidates) {
    const distance = (a, b) => {
        const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) dp[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
                );
            }
        }
        return dp[a.length][b.length];
    };
    let best = null;
    for (const candidate of candidates) {
        const d = distance(word.toLowerCase(), candidate.toLowerCase());
        if (
            d <= Math.max(2, Math.floor(candidate.length / 3)) &&
            (!best || d < best.d)
        ) {
            best = { candidate, d };
        }
    }
    return best ? best.candidate : null;
}

function toIssue(error, schema) {
    const pointer = error.instancePath || '';
    const node = schemaNodeAt(schema, error.schemaPath || '');

    switch (error.keyword) {
        case 'additionalProperties': {
            const key = error.params.additionalProperty;
            const keys = knownKeys(node);
            const suggestion = closest(key, keys);
            return {
                severity: 'error',
                code: 'unknown-key',
                pointer: appendPointer(pointer, key),
                message: `Unknown key "${key}"${
                    pointer ? ` in ${pointer}` : ''
                }: nothing in Frigg reads it.`,
                hint: suggestion
                    ? `Did you mean "${suggestion}"?`
                    : keys.length
                    ? `Known keys: ${keys.join(', ')}.`
                    : 'Remove it.',
            };
        }
        case 'required':
            return {
                severity: 'error',
                code: 'missing-key',
                pointer: appendPointer(pointer, error.params.missingProperty),
                message: `Missing required key "${error.params.missingProperty}".`,
                hint: node?.properties?.[error.params.missingProperty]
                    ?.description,
            };
        case 'enum':
            return {
                severity: 'error',
                code: 'invalid-value',
                pointer,
                message: `${pointer || 'Value'} is ${JSON.stringify(
                    error.data
                )}, which is not an allowed value.`,
                hint: `Use one of: ${error.params.allowedValues
                    .map((v) => JSON.stringify(v))
                    .join(', ')}.`,
            };
        case 'type':
            return {
                severity: 'error',
                code: 'invalid-type',
                pointer,
                message: `${pointer || 'Value'} must be ${
                    error.params.type
                }, got ${error.data === null ? 'null' : typeof error.data}.`,
                hint: node?.description,
            };
        default:
            return {
                severity: 'error',
                code: `schema-${error.keyword}`,
                pointer,
                message: `${pointer || 'The app definition'} ${error.message}.`,
                hint: node?.description,
            };
    }
}

/**
 * @param {Array<object>|null} errors Ajv errors
 * @param {object} schema the app-definition schema
 * @returns {Array<object>} issues, one per distinct pointer+code
 */
function schemaErrorsToIssues(errors, schema) {
    if (!errors) return [];
    // oneOf/anyOf failures repeat as one error per branch plus a summary:
    // keep the summary only.
    const oneOfPointers = new Set(
        errors
            .filter((e) => e.keyword === 'oneOf' || e.keyword === 'anyOf')
            .map((e) => e.instancePath)
    );
    const seen = new Set();
    const issues = [];
    for (const error of errors) {
        if (
            error.keyword !== 'oneOf' &&
            error.keyword !== 'anyOf' &&
            oneOfPointers.has(error.instancePath)
        ) {
            continue;
        }
        const issue = toIssue(error, schema);
        const key = `${issue.code}:${issue.pointer}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push(issue);
    }
    return issues;
}

module.exports = { schemaErrorsToIssues, appendPointer };
