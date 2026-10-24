const { validateMappingQuery } = require('./integration-mapping-query');

const consumerQuery = () => ({
    where: [
        { path: 'mapping.outbound', op: 'exists' },
        { path: 'mapping.outbound.status', op: 'in', value: ['failed'] },
        {
            anyOf: [
                {
                    path: 'sourceId',
                    op: 'notStartsWith',
                    value: 'alias:',
                },
                { path: 'mapping.externalId', op: 'notExists' },
            ],
        },
    ],
    orderBy: { path: 'mapping.outbound.attemptedAt', direction: 'desc' },
    skip: 50,
    take: 25,
    omit: ['history', 'snapshot', 'extras'],
});

describe('validateMappingQuery', () => {
    it('normalizes a filtered, sorted page query into fields and path segments', () => {
        expect(validateMappingQuery(consumerQuery())).toEqual({
            where: [
                { field: 'mapping', path: ['outbound'], op: 'exists' },
                {
                    field: 'mapping',
                    path: ['outbound', 'status'],
                    op: 'in',
                    value: ['failed'],
                },
                {
                    anyOf: [
                        {
                            field: 'sourceId',
                            op: 'notStartsWith',
                            value: 'alias:',
                        },
                        {
                            field: 'mapping',
                            path: ['externalId'],
                            op: 'notExists',
                        },
                    ],
                },
            ],
            orderBy: {
                path: ['outbound', 'attemptedAt'],
                direction: 'desc',
            },
            skip: 50,
            take: 25,
            omit: ['history', 'snapshot', 'extras'],
        });
    });

    const withCondition = (condition) => ({ where: [condition], take: 10 });

    describe('paths', () => {
        it.each([
            'mapping.outbound$',
            "mapping.outbound'",
            'mapping.outbound"',
            'mapping.1st',
            'mapping.a-b',
            'mapping.a b',
            'mapping.outbound}',
            'mapping.outbound,x',
            'mapping..outbound',
            'mapping.',
            'mapping',
            'mapping.outbound[0]',
            'context.outbound',
            'sourceId.x',
            'id',
            '',
        ])('rejects %j', (path) => {
            expect(() =>
                validateMappingQuery(withCondition({ path, op: 'exists' }))
            ).toThrow(/queryMappings: invalid path/);
        });

        it('rejects a non-string path', () => {
            expect(() =>
                validateMappingQuery(withCondition({ path: 42, op: 'exists' }))
            ).toThrow(/queryMappings: invalid path/);
        });

        it('accepts underscores and digits after the first character', () => {
            expect(
                validateMappingQuery(
                    withCondition({ path: 'mapping._a1.B_2', op: 'exists' })
                ).where[0].path
            ).toEqual(['_a1', 'B_2']);
        });
    });

    describe('operators', () => {
        it.each([
            [{ path: 'sourceId', op: 'exists' }],
            [{ path: 'mapping.externalId', op: 'toString' }],
            [{ path: 'mapping.externalId', op: '__proto__' }],
            [{ path: 'sourceId', op: 'notExists' }],
            [{ path: 'sourceId', op: 'in', value: ['a'] }],
            [{ path: 'mapping.externalId', op: 'notStartsWith', value: 'a' }],
            [{ path: 'mapping.externalId', op: 'equals', value: 'a' }],
            [{ path: 'mapping.externalId' }],
        ])('rejects an op that does not fit the path: %j', (condition) => {
            expect(() =>
                validateMappingQuery(withCondition(condition))
            ).toThrow(/queryMappings: op .* is not allowed/);
        });

        it.each([[undefined], ['failed'], [[]], [[1]], [['failed', null]]])(
            'rejects in with value %j',
            (value) => {
                expect(() =>
                    validateMappingQuery(
                        withCondition({
                            path: 'mapping.outbound.status',
                            op: 'in',
                            value,
                        })
                    )
                ).toThrow(
                    /queryMappings: 'in' value must be a non-empty array of strings/
                );
            }
        );

        const inCondition = (count) => ({
            path: 'mapping.outbound.status',
            op: 'in',
            value: Array.from({ length: count }, (_, i) => `status${i}`),
        });

        it('accepts in with 500 values', () => {
            expect(
                validateMappingQuery(withCondition(inCondition(500))).where[0]
                    .value
            ).toHaveLength(500);
        });

        it('rejects in with more than 500 values', () => {
            expect(() =>
                validateMappingQuery(withCondition(inCondition(501)))
            ).toThrow(
                /queryMappings: 'in' value must have at most 500 strings on 'mapping\.outbound\.status'/
            );
        });

        it.each([[undefined], [''], [7], [['alias:']]])(
            'rejects notStartsWith with value %j',
            (value) => {
                expect(() =>
                    validateMappingQuery(
                        withCondition({
                            path: 'sourceId',
                            op: 'notStartsWith',
                            value,
                        })
                    )
                ).toThrow(
                    /queryMappings: 'notStartsWith' value must be a non-empty string/
                );
            }
        );
    });

    describe('where', () => {
        it('defaults to no conditions', () => {
            expect(validateMappingQuery({ take: 10 }).where).toEqual([]);
        });

        it.each([[null], [undefined], ['x'], [[]]])(
            'rejects a query of %j',
            (query) => {
                expect(() => validateMappingQuery(query)).toThrow(
                    /queryMappings: query must be an object/
                );
            }
        );

        it.each([[{}], ['mapping.outbound'], [{ path: 'mapping.outbound' }]])(
            'rejects a where that is not an array: %j',
            (where) => {
                expect(() => validateMappingQuery({ where, take: 10 })).toThrow(
                    /queryMappings: where must be an array/
                );
            }
        );

        it.each([
            [null],
            ['mapping.outbound'],
            [[{ path: 'mapping.outbound', op: 'exists' }]],
        ])('rejects a where entry of %j', (entry) => {
            expect(() =>
                validateMappingQuery({ where: [entry], take: 10 })
            ).toThrow(/queryMappings: each where entry must be an object/);
        });

        it.each([[[]], [{}], [null], ['x']])('rejects anyOf of %j', (anyOf) => {
            expect(() =>
                validateMappingQuery(withCondition({ anyOf }))
            ).toThrow(/queryMappings: anyOf must be a non-empty array/);
        });

        it('rejects a nested anyOf', () => {
            expect(() =>
                validateMappingQuery(
                    withCondition({
                        anyOf: [
                            { path: 'mapping.a', op: 'exists' },
                            { anyOf: [{ path: 'mapping.b', op: 'exists' }] },
                        ],
                    })
                )
            ).toThrow(/queryMappings: nested anyOf is not supported/);
        });

        const exists = (i) => ({ path: `mapping.f${i}`, op: 'exists' });
        const conditions = (count) =>
            Array.from({ length: count }, (_, i) => exists(i));

        it('accepts 20 conditions, anyOf members included', () => {
            const where = [
                ...conditions(17),
                { anyOf: [exists(17), exists(18), exists(19)] },
            ];

            expect(
                validateMappingQuery({ where, take: 10 }).where
            ).toHaveLength(18);
        });

        it.each([
            ['top-level conditions', conditions(21)],
            [
                'conditions once anyOf members are counted',
                [
                    ...conditions(18),
                    { anyOf: [exists(18), exists(19), exists(20)] },
                ],
            ],
            ['members of one anyOf', [{ anyOf: conditions(21) }]],
        ])('rejects more than 20 %s', (_, where) => {
            expect(() => validateMappingQuery({ where, take: 10 })).toThrow(
                /queryMappings: where must have at most 20 conditions, anyOf members included/
            );
        });
    });

    describe('paging', () => {
        it('defaults skip to 0', () => {
            expect(validateMappingQuery({ take: 1 }).skip).toBe(0);
        });

        it.each([[1], [500]])('accepts take %j', (take) => {
            expect(validateMappingQuery({ take }).take).toBe(take);
        });

        it.each([
            [undefined],
            [0],
            [501],
            [-1],
            [1.5],
            ['10'],
            [NaN],
            [Infinity],
        ])('rejects take %p', (take) => {
            expect(() => validateMappingQuery({ take })).toThrow(
                /queryMappings: take must be an integer between 1 and 500/
            );
        });

        it.each([[-1], [1.5], ['10'], [NaN], [Infinity], [null], [2 ** 53]])(
            'rejects skip %p',
            (skip) => {
                expect(() => validateMappingQuery({ skip, take: 1 })).toThrow(
                    /queryMappings: skip must be a non-negative integer/
                );
            }
        );
    });

    describe('omit', () => {
        it('defaults to no keys', () => {
            expect(validateMappingQuery({ take: 1 }).omit).toEqual([]);
        });

        it.each([
            [['a.b']],
            [['1a']],
            [["a'"]],
            [['']],
            [[7]],
            [[null]],
            ['history'],
            [{}],
        ])('rejects omit %j', (omit) => {
            expect(() => validateMappingQuery({ omit, take: 1 })).toThrow(
                /queryMappings: omit must be an array of top-level mapping keys/
            );
        });
    });

    describe('orderBy', () => {
        it('is null when omitted', () => {
            expect(validateMappingQuery({ take: 1 }).orderBy).toBeNull();
        });

        it.each([['asc'], ['desc']])('keeps direction %j', (direction) => {
            expect(
                validateMappingQuery({
                    orderBy: { path: 'mapping.a', direction },
                    take: 1,
                }).orderBy.direction
            ).toBe(direction);
        });

        it.each([
            [undefined],
            ['ASC'],
            ['up'],
            ['desc; DROP TABLE "IntegrationMapping"'],
            [1],
        ])('rejects direction %j', (direction) => {
            expect(() =>
                validateMappingQuery({
                    orderBy: { path: 'mapping.a', direction },
                    take: 1,
                })
            ).toThrow(
                /queryMappings: orderBy.direction must be 'asc' or 'desc'/
            );
        });

        it('rejects ordering by sourceId', () => {
            expect(() =>
                validateMappingQuery({
                    orderBy: { path: 'sourceId', direction: 'asc' },
                    take: 1,
                })
            ).toThrow(/queryMappings: orderBy.path must be a mapping path/);
        });

        it('rejects an unsafe orderBy path', () => {
            expect(() =>
                validateMappingQuery({
                    orderBy: { path: "mapping.a'", direction: 'asc' },
                    take: 1,
                })
            ).toThrow(/queryMappings: invalid path/);
        });

        it.each([['mapping.a'], [['mapping.a', 'desc']]])(
            'rejects orderBy %j',
            (orderBy) => {
                expect(() =>
                    validateMappingQuery({ orderBy, take: 1 })
                ).toThrow(/queryMappings: orderBy must be an object/);
            }
        );
    });
});
