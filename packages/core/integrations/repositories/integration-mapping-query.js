/**
 * Validation for IntegrationMappingRepository.queryMappings().
 *
 * Backend-agnostic: enforces the query shape BEFORE an adapter builds a
 * database command, so every adapter rejects the same input. Paths come out
 * split into identifier-only segments that adapters pass as bound
 * parameters; nothing from the query is spliced into SQL text.
 */

const SEGMENT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_TAKE = 500;
const SQL_DIRECTIONS = { asc: 'ASC', desc: 'DESC' };

const OPS_BY_FIELD = {
    mapping: ['exists', 'notExists', 'in'],
    sourceId: ['notStartsWith'],
};

function validateMappingQuery(query) {
    if (!isPlainObject(query)) {
        throw new Error('queryMappings: query must be an object');
    }
    const { where = [], orderBy, skip = 0, take, omit = [] } = query;
    if (!Array.isArray(where)) {
        throw new Error('queryMappings: where must be an array');
    }
    if (!Number.isInteger(take) || take < 1 || take > MAX_TAKE) {
        throw new Error(
            `queryMappings: take must be an integer between 1 and ${MAX_TAKE}`
        );
    }
    if (!Number.isSafeInteger(skip) || skip < 0) {
        throw new Error('queryMappings: skip must be a non-negative integer');
    }
    if (
        !Array.isArray(omit) ||
        !omit.every((key) => typeof key === 'string' && SEGMENT_REGEX.test(key))
    ) {
        throw new Error(
            `queryMappings: omit must be an array of top-level mapping keys matching ${SEGMENT_REGEX}`
        );
    }

    return {
        where: where.map(toWhereEntry),
        orderBy: orderBy === undefined ? null : toOrderBy(orderBy),
        skip,
        take,
        omit,
    };
}

function toOrderBy(orderBy) {
    if (!isPlainObject(orderBy)) {
        throw new Error('queryMappings: orderBy must be an object');
    }
    const { field, segments } = parsePath(orderBy.path);
    if (field !== 'mapping') {
        throw new Error(
            "queryMappings: orderBy.path must be a mapping path ('mapping.<segment>...')"
        );
    }
    if (!Object.hasOwn(SQL_DIRECTIONS, orderBy.direction)) {
        throw new Error(
            "queryMappings: orderBy.direction must be 'asc' or 'desc'"
        );
    }
    return { segments, direction: SQL_DIRECTIONS[orderBy.direction] };
}

function toWhereEntry(entry) {
    assertWhereEntryShape(entry);
    if (!('anyOf' in entry)) return toCondition(entry);

    const { anyOf } = entry;
    if (!Array.isArray(anyOf) || anyOf.length === 0) {
        throw new Error('queryMappings: anyOf must be a non-empty array');
    }
    return {
        anyOf: anyOf.map((condition) => {
            assertWhereEntryShape(condition);
            if ('anyOf' in condition) {
                throw new Error('queryMappings: nested anyOf is not supported');
            }
            return toCondition(condition);
        }),
    };
}

function assertWhereEntryShape(entry) {
    if (!isPlainObject(entry)) {
        throw new Error('queryMappings: each where entry must be an object');
    }
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toCondition({ path, op, value }) {
    const { field, segments } = parsePath(path);
    const allowed = OPS_BY_FIELD[field];
    if (!allowed.includes(op)) {
        throw new Error(
            `queryMappings: op ${JSON.stringify(
                op
            )} is not allowed on '${path}' (allowed: ${allowed.join(', ')})`
        );
    }

    if (op === 'in') {
        if (
            !Array.isArray(value) ||
            value.length === 0 ||
            !value.every((v) => typeof v === 'string')
        ) {
            throw new Error(
                `queryMappings: 'in' value must be a non-empty array of strings on '${path}'`
            );
        }
        return { field, segments, op, value };
    }

    if (op === 'notStartsWith') {
        if (typeof value !== 'string' || value.length === 0) {
            throw new Error(
                `queryMappings: 'notStartsWith' value must be a non-empty string on '${path}'`
            );
        }
        return { field, segments, op, value };
    }

    return { field, segments, op };
}

/**
 * `'mapping.c2h.lastStatus'` → `{ field: 'mapping', segments: ['c2h', 'lastStatus'] }`,
 * `'sourceId'` → `{ field: 'sourceId', segments: [] }`.
 */
function parsePath(path) {
    const [field, ...segments] =
        typeof path === 'string' ? path.split('.') : [];
    const valid =
        (field === 'sourceId' && segments.length === 0) ||
        (field === 'mapping' &&
            segments.length > 0 &&
            segments.every((segment) => SEGMENT_REGEX.test(segment)));
    if (!valid) {
        throw new Error(
            `queryMappings: invalid path ${JSON.stringify(
                path
            )} (must be 'sourceId' or 'mapping.<segment>...' with segments matching ${SEGMENT_REGEX})`
        );
    }
    return { field, segments };
}

module.exports = { SEGMENT_REGEX, validateMappingQuery };
