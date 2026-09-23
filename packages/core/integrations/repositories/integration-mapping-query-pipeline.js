const SORT_KEY = '__sortKey';
const MONGO_DIRECTIONS = { asc: 1, desc: -1 };
const SORT_TYPE_RANKS = [
    ['string'],
    ['int', 'long', 'double', 'decimal'],
    ['bool'],
    ['array'],
    ['object'],
];
const SCALAR_TYPES = SORT_TYPE_RANKS.slice(0, 3).flat();

const isType = (expression, type) => ({ $eq: [{ $type: expression }, type] });
const isAbsent = (expression) => ({
    $eq: [{ $ifNull: [expression, null] }, null],
});
const mappingField = (segments) => `$mapping.${segments.join('.')}`;

const CONDITION_EXPRESSIONS = {
    exists: (operand) => ({ $ne: [{ $ifNull: [operand, null] }, null] }),
    notExists: (operand) => isAbsent(operand),
    in: (operand, values) => ({
        $and: [
            isType(operand, 'string'),
            { $in: [operand, { $literal: values }] },
        ],
    }),
    notStartsWith: (operand, prefix) => ({
        $cond: [
            isType(operand, 'string'),
            {
                $ne: [
                    { $substrCP: [operand, 0, [...prefix].length] },
                    { $literal: prefix },
                ],
            },
            true,
        ],
    }),
};

/**
 * Aggregation stages that answer a validated queryMappings query on the
 * MongoDB wire protocol.
 *
 * @param {*} integrationId - The value IntegrationMapping.integrationId is stored as
 * @param {ReturnType<import('./integration-mapping-query').validateMappingQuery>} query
 * @returns {{match: Object, page: Object[]}} `match` selects the matching
 *   documents; `page` sorts, skips and limits them
 */
function buildMappingQueryStages(
    integrationId,
    { where, orderBy, skip, take, omit }
) {
    const match = {
        $match: {
            integrationId,
            $expr: {
                $and: [
                    isType('$mapping', 'object'),
                    ...where.map(entryExpression),
                ],
            },
        },
    };
    const page = [
        ...(orderBy
            ? [{ $addFields: { [SORT_KEY]: sortKey(orderBy.path) } }]
            : []),
        ...(omit.length > 0 ? [{ $project: omitProjection(omit) }] : []),
        { $sort: sortSpec(orderBy) },
        ...(skip > 0 ? [{ $skip: skip }] : []),
        { $limit: take },
    ];
    return { match, page };
}

function entryExpression(entry) {
    if (!entry.anyOf) return conditionExpression(entry);
    return { $or: entry.anyOf.map(conditionExpression) };
}

function conditionExpression({ field, path, op, value }) {
    const operand = field === 'sourceId' ? '$sourceId' : resolvePath(path);
    return CONDITION_EXPRESSIONS[op](operand, value);
}

/**
 * The value at a mapping path; null when an enclosing value is not an object.
 */
function resolvePath(segments) {
    const enclosing = segments
        .slice(0, -1)
        .map((_, i) =>
            isType(mappingField(segments.slice(0, i + 1)), 'object')
        );
    if (enclosing.length === 0) return mappingField(segments);
    return {
        $cond: [
            enclosing.length === 1 ? enclosing[0] : { $and: enclosing },
            mappingField(segments),
            null,
        ],
    };
}

/**
 * Orders values like jsonb: strings < numbers < booleans < arrays < objects,
 * scalars by value within their type. Null and absent values sort last in
 * both directions.
 */
function sortKey(path) {
    const type = { $type: '$$value' };
    return {
        $let: {
            vars: { value: resolvePath(path) },
            in: {
                missing: isAbsent('$$value'),
                rank: {
                    $switch: {
                        branches: SORT_TYPE_RANKS.map((types, i) => ({
                            case: { $in: [type, types] },
                            then: i + 1,
                        })),
                        default: 0,
                    },
                },
                value: {
                    $cond: [{ $in: [type, SCALAR_TYPES] }, '$$value', null],
                },
            },
        },
    };
}

function sortSpec(orderBy) {
    if (!orderBy) return { _id: 1 };
    const direction = MONGO_DIRECTIONS[orderBy.direction];
    return {
        [`${SORT_KEY}.missing`]: 1,
        [`${SORT_KEY}.rank`]: direction,
        [`${SORT_KEY}.value`]: direction,
        _id: direction,
    };
}

function omitProjection(omit) {
    return Object.fromEntries(omit.map((key) => [`mapping.${key}`, 0]));
}

module.exports = { buildMappingQueryStages };
