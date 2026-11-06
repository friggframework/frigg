/**
 * Shared helpers for ProcessRepository.applyProcessUpdate() validation.
 *
 * These utilities are backend-agnostic: they enforce invariants on the
 * `ProcessUpdateOps` shape BEFORE each adapter emits any SQL or database
 * command. Keeping validation here means any bug we fix (e.g. tighter
 * path regex, size cap) fixes all three adapters in one place.
 *
 * Imported by the Postgres, MongoDB, and DocumentDB adapters.
 */

/**
 * Allowed dot-path shape. Root must be `context` or `results`, and each
 * segment after the first must be a JS-identifier-style token. Numeric
 * segments (array indices) and bracket syntax are intentionally
 * disallowed — array element mutation is exclusively handled via
 * `pushSlice`, which targets a whole array at a path.
 */
const PATH_REGEX = /^(context|results)(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/;

/**
 * Normalizes and validates a `ProcessUpdateOps` object. Returns a frozen
 * copy with defaults applied and every key pre-validated. Throws synchronously
 * on any shape error so adapters can fail fast before touching the DB.
 *
 * @param {Object} ops
 * @returns {{
 *   increment: Record<string, number>,
 *   set: Record<string, unknown>,
 *   pushSlice: Record<string, { values: unknown[]; keepLast: number }>,
 *   newState: string|null,
 * }}
 */
function validateOps(ops) {
    if (!ops || typeof ops !== 'object' || Array.isArray(ops)) {
        throw new Error('applyProcessUpdate: ops must be an object');
    }

    const increment = ops.increment || {};
    const set = ops.set || {};
    const pushSlice = ops.pushSlice || {};
    const newState = ops.newState ?? null;

    for (const [path, delta] of Object.entries(increment)) {
        assertPath(path, 'increment');
        if (typeof delta !== 'number' || !Number.isFinite(delta)) {
            throw new Error(
                `applyProcessUpdate: increment['${path}'] must be a finite number, got ${typeof delta}`
            );
        }
    }

    for (const path of Object.keys(set)) {
        assertPath(path, 'set');
    }

    for (const [path, spec] of Object.entries(pushSlice)) {
        assertPath(path, 'pushSlice');
        if (
            !spec ||
            typeof spec !== 'object' ||
            !Array.isArray(spec.values) ||
            typeof spec.keepLast !== 'number' ||
            !Number.isInteger(spec.keepLast) ||
            spec.keepLast <= 0
        ) {
            throw new Error(
                `applyProcessUpdate: pushSlice['${path}'] must be { values: [], keepLast: positive integer }`
            );
        }
    }

    if (newState !== null && typeof newState !== 'string') {
        throw new Error('applyProcessUpdate: newState must be a string');
    }

    const hasAnyOp =
        Object.keys(increment).length > 0 ||
        Object.keys(set).length > 0 ||
        Object.keys(pushSlice).length > 0 ||
        newState !== null;
    if (!hasAnyOp) {
        throw new Error(
            'applyProcessUpdate: at least one of increment/set/pushSlice/newState must be provided'
        );
    }

    return Object.freeze({ increment, set, pushSlice, newState });
}

function assertPath(path, opName) {
    if (!PATH_REGEX.test(path)) {
        throw new Error(
            `applyProcessUpdate: invalid path '${path}' in ${opName} (must match ${PATH_REGEX})`
        );
    }
}

/**
 * Splits a validated path into `{ column, segments }`.
 * `'context.pagination.pageCount'` → `{ column: 'context', segments: ['pagination', 'pageCount'] }`.
 */
function splitPath(path) {
    const [column, ...segments] = path.split('.');
    return { column, segments };
}

module.exports = {
    PATH_REGEX,
    validateOps,
    splitPath,
};
