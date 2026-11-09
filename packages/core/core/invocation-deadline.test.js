const {
    MAX_IN_PROCESS_WAIT_MS,
    deadlineFromContext,
    invocationMaxInProcessWaitMs,
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
        await runWithInvocationDeadline({ deadlineAt }, async () => {
            await tick();
            await Promise.resolve().then(() => {
                expect(remainingInvocationMs(1_000_000)).toBe(60_000);
            });
        });
    });

    it('never reports a negative time', () => {
        runWithInvocationDeadline({ deadlineAt: 1_000 }, () => {
            expect(remainingInvocationMs(5_000)).toBe(0);
        });
    });

    it('returns the value of fn and passes a rejection through', async () => {
        await expect(
            runWithInvocationDeadline({ deadlineAt: 2e12 }, async () => 'ok')
        ).resolves.toBe('ok');
        const boom = new Error('boom');
        await expect(
            runWithInvocationDeadline({ deadlineAt: 2e12 }, async () => {
                throw boom;
            })
        ).rejects.toBe(boom);
    });

    it.each([undefined, null, NaN, Infinity, 'soon'])(
        'runs fn with no limit for the deadline %p',
        (deadlineAt) => {
            const result = runWithInvocationDeadline({ deadlineAt }, () =>
                remainingInvocationMs()
            );
            expect(result).toBe(Infinity);
        }
    );

    it('lets a nested scope shorten the deadline, then restores the outer one', () => {
        runWithInvocationDeadline({ deadlineAt: 1_060_000 }, () => {
            runWithInvocationDeadline({ deadlineAt: 1_010_000 }, () => {
                expect(remainingInvocationMs(1_000_000)).toBe(10_000);
            });
            expect(remainingInvocationMs(1_000_000)).toBe(60_000);
        });
    });

    it('does not let a nested scope extend the deadline', () => {
        runWithInvocationDeadline({ deadlineAt: 1_010_000 }, () => {
            runWithInvocationDeadline({ deadlineAt: 1_060_000 }, () => {
                expect(remainingInvocationMs(1_000_000)).toBe(10_000);
            });
        });
    });

    describe('maxInProcessWaitMs', () => {
        it('has one table of defaults, frozen', () => {
            expect(MAX_IN_PROCESS_WAIT_MS).toEqual({
                outsideInvocation: 300_000,
                http: 10_000,
                queueWorker: 60_000,
            });
            expect(Object.isFrozen(MAX_IN_PROCESS_WAIT_MS)).toBe(true);
        });

        it('reads the outside-invocation default when no scope is open', () => {
            expect(invocationMaxInProcessWaitMs()).toBe(300_000);
        });

        it('reads the default when the scope sets only a deadline', () => {
            runWithInvocationDeadline({ deadlineAt: 2e12 }, () => {
                expect(invocationMaxInProcessWaitMs()).toBe(300_000);
            });
        });

        it('reads the value of the scope, deep inside async work', async () => {
            await runWithInvocationDeadline(
                { maxInProcessWaitMs: 10_000 },
                async () => {
                    await tick();
                    expect(invocationMaxInProcessWaitMs()).toBe(10_000);
                }
            );
        });

        it('sets no deadline when it is the only field', () => {
            runWithInvocationDeadline({ maxInProcessWaitMs: 0 }, () => {
                expect(invocationMaxInProcessWaitMs()).toBe(0);
                expect(remainingInvocationMs()).toBe(Infinity);
            });
        });

        it.each([undefined, null, NaN, Infinity, -1, '5'])(
            'ignores the value %p and runs fn with no scope',
            (maxInProcessWaitMs) => {
                runWithInvocationDeadline({ maxInProcessWaitMs }, () => {
                    expect(invocationMaxInProcessWaitMs()).toBe(300_000);
                    expect(remainingInvocationMs()).toBe(Infinity);
                });
            }
        );

        it('lets a nested scope lower the value, then restores the outer one', () => {
            runWithInvocationDeadline({ maxInProcessWaitMs: 60_000 }, () => {
                runWithInvocationDeadline({ maxInProcessWaitMs: 5_000 }, () => {
                    expect(invocationMaxInProcessWaitMs()).toBe(5_000);
                });
                expect(invocationMaxInProcessWaitMs()).toBe(60_000);
            });
        });

        it('does not let a nested scope raise the value', () => {
            runWithInvocationDeadline({ maxInProcessWaitMs: 5_000 }, () => {
                runWithInvocationDeadline(
                    { maxInProcessWaitMs: 60_000 },
                    () => {
                        expect(invocationMaxInProcessWaitMs()).toBe(5_000);
                    }
                );
            });
        });

        it('takes the lower of each field on its own', () => {
            runWithInvocationDeadline(
                { deadlineAt: 1_010_000, maxInProcessWaitMs: 60_000 },
                () => {
                    runWithInvocationDeadline(
                        { deadlineAt: 1_060_000, maxInProcessWaitMs: 5_000 },
                        () => {
                            expect(remainingInvocationMs(1_000_000)).toBe(
                                10_000
                            );
                            expect(invocationMaxInProcessWaitMs()).toBe(5_000);
                        }
                    );
                }
            );
        });

        it('keeps the outer value of a field the nested scope leaves out', () => {
            runWithInvocationDeadline(
                { deadlineAt: 1_010_000, maxInProcessWaitMs: 60_000 },
                () => {
                    runWithInvocationDeadline({ deadlineAt: 1_005_000 }, () => {
                        expect(invocationMaxInProcessWaitMs()).toBe(60_000);
                    });
                    runWithInvocationDeadline(
                        { maxInProcessWaitMs: 5_000 },
                        () => {
                            expect(remainingInvocationMs(1_000_000)).toBe(
                                10_000
                            );
                        }
                    );
                }
            );
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
