const { FixedWindowRateLimiter } = require('./rate-limiter');

describe('FixedWindowRateLimiter', () => {
    it('allows up to maxPerKey attempts, then trips per-key', () => {
        const rl = new FixedWindowRateLimiter({
            windowMs: 1000,
            maxPerKey: 3,
            maxGlobal: 100,
            now: () => 1000,
        });

        expect(rl.check('1.1.1.1').allowed).toBe(true);
        expect(rl.check('1.1.1.1').allowed).toBe(true);
        expect(rl.check('1.1.1.1').allowed).toBe(true);

        const fourth = rl.check('1.1.1.1');
        expect(fourth.allowed).toBe(false);
        expect(fourth.scope).toBe('key');
    });

    it('keeps per-key windows independent', () => {
        const rl = new FixedWindowRateLimiter({
            windowMs: 1000,
            maxPerKey: 1,
            maxGlobal: 100,
            now: () => 1000,
        });
        expect(rl.check('a').allowed).toBe(true);
        expect(rl.check('a').allowed).toBe(false);
        // A different key is unaffected.
        expect(rl.check('b').allowed).toBe(true);
    });

    it('trips the global window across keys even when per-key is fine', () => {
        const rl = new FixedWindowRateLimiter({
            windowMs: 1000,
            maxPerKey: 100,
            maxGlobal: 2,
            now: () => 1000,
        });
        expect(rl.check('a').allowed).toBe(true);
        expect(rl.check('b').allowed).toBe(true);
        const third = rl.check('c');
        expect(third.allowed).toBe(false);
        expect(third.scope).toBe('global');
    });

    it('resets counters after the window elapses', () => {
        let clock = 1000;
        const rl = new FixedWindowRateLimiter({
            windowMs: 1000,
            maxPerKey: 1,
            maxGlobal: 100,
            now: () => clock,
        });
        expect(rl.check('a').allowed).toBe(true);
        expect(rl.check('a').allowed).toBe(false);

        clock += 1001; // advance past the window
        expect(rl.check('a').allowed).toBe(true);
    });
});
