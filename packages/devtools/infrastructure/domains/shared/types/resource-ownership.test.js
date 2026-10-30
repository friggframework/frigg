const { ResourceOwnership, validateOwnership, resolveOwnership } = require('./resource-ownership');

describe('ResourceOwnership', () => {
    describe('enum values', () => {
        it('should have correct enum values', () => {
            expect(ResourceOwnership.STACK).toBe('stack');
            expect(ResourceOwnership.EXTERNAL).toBe('external');
            expect(ResourceOwnership.AUTO).toBe('auto');
        });
    });

    describe('validateOwnership', () => {
        it('should accept valid ownership values', () => {
            expect(() => validateOwnership('stack', 'test')).not.toThrow();
            expect(() => validateOwnership('external', 'test')).not.toThrow();
            expect(() => validateOwnership('auto', 'test')).not.toThrow();
        });

        it('should reject invalid ownership values', () => {
            expect(() => validateOwnership('invalid', 'test')).toThrow(
                "Invalid ownership 'invalid' for test"
            );
            expect(() => validateOwnership('managed', 'test')).toThrow();
            expect(() => validateOwnership('', 'test')).toThrow();
        });
    });

    describe('resolveOwnership', () => {
        describe('with explicit STACK intent', () => {
            it('should return STACK regardless of discovery', () => {
                expect(resolveOwnership('stack', false, false)).toBe('stack');
                expect(resolveOwnership('stack', true, false)).toBe('stack');
                expect(resolveOwnership('stack', false, true)).toBe('stack');
                expect(resolveOwnership('stack', true, true)).toBe('stack');
            });
        });

        describe('with explicit EXTERNAL intent', () => {
            it('should return EXTERNAL regardless of discovery', () => {
                expect(resolveOwnership('external', false, false)).toBe('external');
                expect(resolveOwnership('external', true, false)).toBe('external');
                expect(resolveOwnership('external', false, true)).toBe('external');
                expect(resolveOwnership('external', true, true)).toBe('external');
            });
        });

        describe('with AUTO intent', () => {
            it('should return STACK if resource is in stack (CRITICAL: must keep in template)', () => {
                expect(resolveOwnership('auto', true, false)).toBe('stack');
                expect(resolveOwnership('auto', true, true)).toBe('stack');
            });

            it('should return EXTERNAL if found externally but not in stack', () => {
                expect(resolveOwnership('auto', false, true)).toBe('external');
            });

            it('should return STACK if not found anywhere (will create new)', () => {
                expect(resolveOwnership('auto', false, false)).toBe('stack');
            });
        });

        describe('edge cases', () => {
            it('should throw on invalid intent', () => {
                expect(() => resolveOwnership('invalid', false, false)).toThrow(
                    'Invalid ownership intent: invalid'
                );
            });

            it('should handle undefined intent as invalid', () => {
                expect(() => resolveOwnership(undefined, false, false)).toThrow();
            });
        });

        describe('real-world scenarios', () => {
            it('scenario: fresh deploy, no resources exist', () => {
                const ownership = resolveOwnership('auto', false, false);
                expect(ownership).toBe('stack');
            });

            it('scenario: redeploy existing stack, resource in stack', () => {
                const ownership = resolveOwnership('auto', true, false);
                expect(ownership).toBe('stack');
            });

            it('scenario: resource exists in another stack/manually created', () => {
                const ownership = resolveOwnership('auto', false, true);
                expect(ownership).toBe('external');
            });

            it('scenario: user explicitly wants to use external VPC', () => {
                const ownership = resolveOwnership('external', false, false);
                expect(ownership).toBe('external');
            });

            it('scenario: user explicitly manages in stack even if external exists', () => {
                const ownership = resolveOwnership('stack', false, true);
                expect(ownership).toBe('stack');
            });
        });
    });
});
