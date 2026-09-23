const SEGMENT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_TAKE = 500;
const MAX_IN_VALUES = 500;
const MAX_CONDITIONS = 20;
const DIRECTIONS = ['asc', 'desc'];

const OPERATORS = {
    exists: { fields: ['mapping'] },
    notExists: { fields: ['mapping'] },
    in: { fields: ['mapping'], value: toStringList },
    notStartsWith: { fields: ['sourceId'], value: toPrefix },
};

/**
 * Checks a queryMappings query and normalizes it for an adapter.
 *
 * @param {Object} query - See IntegrationMappingRepositoryInterface.queryMappings
 * @returns {{where: Array<Object>, orderBy: ({path: string[], direction: 'asc'|'desc'}|null), skip: number, take: number, omit: string[]}}
 * @throws {Error} When the query does not fit that shape
 */
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

    const whereEntries = where.map(toWhereEntry);
    const conditionCount = whereEntries.reduce(
        (count, entry) => count + (entry.anyOf ? entry.anyOf.length : 1),
        0
    );
    if (conditionCount > MAX_CONDITIONS) {
        throw new Error(
            `queryMappings: where must have at most ${MAX_CONDITIONS} conditions, anyOf members included`
        );
    }

    return {
        where: whereEntries,
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
    if (!DIRECTIONS.includes(orderBy.direction)) {
        throw new Error(
            "queryMappings: orderBy.direction must be 'asc' or 'desc'"
        );
    }
    return { path: segments, direction: orderBy.direction };
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

/**
 * `{ path: 'mapping.c2h.lastStatus', op: 'in', value: ['failed'] }` →
 * `{ field: 'mapping', path: ['c2h', 'lastStatus'], op: 'in', value: ['failed'] }`.
 * A `sourceId` condition has no `path`; an op without a value has no `value`.
 */
function toCondition({ path, op, value }) {
    const { field, segments } = parsePath(path);
    const operator = Object.hasOwn(OPERATORS, op) ? OPERATORS[op] : null;
    if (!operator?.fields.includes(field)) {
        throw new Error(
            `queryMappings: op ${JSON.stringify(
                op
            )} is not allowed on '${path}' (allowed: ${operatorsOn(field).join(
                ', '
            )})`
        );
    }
    return {
        field,
        ...(segments.length > 0 && { path: segments }),
        op,
        ...(operator.value && { value: operator.value(value, path) }),
    };
}

function operatorsOn(field) {
    return Object.keys(OPERATORS).filter((op) =>
        OPERATORS[op].fields.includes(field)
    );
}

function toStringList(value, path) {
    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        !value.every((v) => typeof v === 'string')
    ) {
        throw new Error(
            `queryMappings: 'in' value must be a non-empty array of strings on '${path}'`
        );
    }
    if (value.length > MAX_IN_VALUES) {
        throw new Error(
            `queryMappings: 'in' value must have at most ${MAX_IN_VALUES} strings on '${path}'`
        );
    }
    return value;
}

function toPrefix(value, path) {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(
            `queryMappings: 'notStartsWith' value must be a non-empty string on '${path}'`
        );
    }
    return value;
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

module.exports = { validateMappingQuery };
