const { validateOps, splitPath, PATH_REGEX } = require('./process-update-ops-shared');

describe('process-update-ops-shared', () => {
    describe('PATH_REGEX', () => {
        it.each([
            'context.processedRecords',
            'context.pagination.cursor',
            'results.aggregateData.totalSynced',
            'results.aggregateData.errors',
        ])('accepts %s', (path) => {
            expect(PATH_REGEX.test(path)).toBe(true);
        });

        it.each([
            'context',
            'results',
            'status',
            'context.',
            '.context.x',
            'context..x',
            'context.1stItem',
            'context.a-b',
            'context[0]',
            "context.'x'",
            'other.foo',
        ])('rejects %s', (path) => {
            expect(PATH_REGEX.test(path)).toBe(false);
        });
    });

    describe('validateOps', () => {
        it('throws when ops is null/undefined/array', () => {
            expect(() => validateOps(null)).toThrow('must be an object');
            expect(() => validateOps(undefined)).toThrow('must be an object');
            expect(() => validateOps([])).toThrow('must be an object');
        });

        it('throws when no op kinds are provided', () => {
            expect(() => validateOps({})).toThrow('at least one of');
            expect(() =>
                validateOps({
                    increment: {},
                    set: {},
                    pushSlice: {},
                })
            ).toThrow('at least one of');
        });

        it('accepts newState alone as a valid op', () => {
            expect(() => validateOps({ newState: 'COMPLETED' })).not.toThrow();
        });

        it('rejects non-finite increment values', () => {
            expect(() =>
                validateOps({ increment: { 'context.x': NaN } })
            ).toThrow('finite number');
            expect(() =>
                validateOps({ increment: { 'context.x': Infinity } })
            ).toThrow('finite number');
            expect(() =>
                validateOps({ increment: { 'context.x': '1' } })
            ).toThrow('finite number');
        });

        it('rejects invalid paths across all op kinds', () => {
            expect(() =>
                validateOps({ increment: { 'bad.path': 1 } })
            ).toThrow('invalid path');
            expect(() =>
                validateOps({ set: { 'bad.path': 'x' } })
            ).toThrow('invalid path');
            expect(() =>
                validateOps({
                    pushSlice: {
                        'bad.path': { values: [], keepLast: 1 },
                    },
                })
            ).toThrow('invalid path');
        });

        it('rejects malformed pushSlice specs', () => {
            expect(() =>
                validateOps({ pushSlice: { 'context.x': { keepLast: 10 } } })
            ).toThrow('pushSlice');
            expect(() =>
                validateOps({
                    pushSlice: {
                        'context.x': { values: [], keepLast: 0 },
                    },
                })
            ).toThrow('pushSlice');
            expect(() =>
                validateOps({
                    pushSlice: {
                        'context.x': { values: [], keepLast: 1.5 },
                    },
                })
            ).toThrow('pushSlice');
        });

        it('returns a frozen normalized object with defaults', () => {
            const result = validateOps({ newState: 'COMPLETED' });
            expect(result).toEqual({
                increment: {},
                set: {},
                pushSlice: {},
                newState: 'COMPLETED',
            });
            expect(Object.isFrozen(result)).toBe(true);
        });
    });

    describe('splitPath', () => {
        it('separates column from segments', () => {
            expect(splitPath('context.pagination.cursor')).toEqual({
                column: 'context',
                segments: ['pagination', 'cursor'],
            });
            expect(splitPath('results.aggregateData.totalSynced')).toEqual({
                column: 'results',
                segments: ['aggregateData', 'totalSynced'],
            });
        });
    });
});
