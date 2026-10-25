const {
    deadlineFromContext,
    remainingInvocationMs,
    runWithInvocationDeadline,
} = require('./invocation-deadline');

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('core/invocation-deadline', () => {
    afterEach(() => jest.restoreAllMocks());

    it('has no limit outside a deadline scope', () => {
        expect(remainingInvocationMs()).toBe(Infinity);
    });

    it('reports the time left, deep inside async work', async () => {
        const deadlineAt = 1_060_000;
        await runWithInvocationDeadline(deadlineAt, async () => {
            await tick();
            await Promise.resolve().then(() => {
                expect(remainingInvocationMs(1_000_000)).toBe(60_000);
            });
        });
    });

    it('never reports a negative time', () => {
        runWithInvocationDeadline(1_000, () => {
            expect(remainingInvocationMs(5_000)).toBe(0);
        });
    });

    it('returns the value of fn and passes a rejection through', async () => {
        await expect(
            runWithInvocationDeadline(2e12, async () => 'ok')
        ).resolves.toBe('ok');
        const boom = new Error('boom');
        await expect(
            runWithInvocationDeadline(2e12, async () => {
                throw boom;
            })
        ).rejects.toBe(boom);
    });

    it.each([undefined, null, NaN, Infinity, 'soon'])(
        'runs fn with no limit for the deadline %p',
        (deadlineAt) => {
            const result = runWithInvocationDeadline(deadlineAt, () =>
                remainingInvocationMs()
            );
            expect(result).toBe(Infinity);
        }
    );

    it('lets a nested scope shorten the deadline, then restores the outer one', () => {
        runWithInvocationDeadline(1_060_000, () => {
            runWithInvocationDeadline(1_010_000, () => {
                expect(remainingInvocationMs(1_000_000)).toBe(10_000);
            });
            expect(remainingInvocationMs(1_000_000)).toBe(60_000);
        });
    });

    it('does not let a nested scope extend the deadline', () => {
        runWithInvocationDeadline(1_010_000, () => {
            runWithInvocationDeadline(1_060_000, () => {
                expect(remainingInvocationMs(1_000_000)).toBe(10_000);
            });
        });
    });

    describe('deadlineFromContext', () => {
        it('adds the time left to the current time', () => {
            jest.spyOn(Date, 'now').mockReturnValue(1_000);
            expect(
                deadlineFromContext({ getRemainingTimeInMillis: () => 5_000 })
            ).toBe(6_000);
        });

        it.each([
            ['no context', undefined],
            ['a context without the method', {}],
            [
                'a time that is not a number',
                { getRemainingTimeInMillis: () => 'soon' },
            ],
            [
                'a time that is not finite',
                { getRemainingTimeInMillis: () => Infinity },
            ],
            [
                'a method that throws',
                {
                    getRemainingTimeInMillis: () => {
                        throw new Error('gone');
                    },
                },
            ],
        ])('returns undefined for %s', (_label, context) => {
            expect(deadlineFromContext(context)).toBeUndefined();
        });
    });
});
