/**
 * Tests for PropertyMutability Value Object
 */

const PropertyMutability = require('./property-mutability');

describe('PropertyMutability', () => {
    describe('valid mutability types', () => {
        it('should accept MUTABLE', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(mutability.value).toBe('MUTABLE');
        });

        it('should accept IMMUTABLE', () => {
            const mutability = new PropertyMutability('IMMUTABLE');

            expect(mutability.value).toBe('IMMUTABLE');
        });

        it('should accept CONDITIONAL', () => {
            const mutability = new PropertyMutability('CONDITIONAL');

            expect(mutability.value).toBe('CONDITIONAL');
        });
    });

    describe('invalid mutability types', () => {
        it('should reject invalid mutability', () => {
            expect(() => {
                new PropertyMutability('INVALID');
            }).toThrow('Invalid property mutability: INVALID');
        });

        it('should reject lowercase mutability', () => {
            expect(() => {
                new PropertyMutability('mutable');
            }).toThrow('Invalid property mutability: mutable');
        });

        it('should reject null', () => {
            expect(() => {
                new PropertyMutability(null);
            }).toThrow('Property mutability is required');
        });

        it('should reject undefined', () => {
            expect(() => {
                new PropertyMutability(undefined);
            }).toThrow('Property mutability is required');
        });
    });

    describe('mutability checks', () => {
        it('should check if property is mutable', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(mutability.isMutable()).toBe(true);
            expect(mutability.isImmutable()).toBe(false);
            expect(mutability.isConditional()).toBe(false);
        });

        it('should check if property is immutable', () => {
            const mutability = new PropertyMutability('IMMUTABLE');

            expect(mutability.isMutable()).toBe(false);
            expect(mutability.isImmutable()).toBe(true);
            expect(mutability.isConditional()).toBe(false);
        });

        it('should check if property is conditionally mutable', () => {
            const mutability = new PropertyMutability('CONDITIONAL');

            expect(mutability.isMutable()).toBe(false);
            expect(mutability.isImmutable()).toBe(false);
            expect(mutability.isConditional()).toBe(true);
        });
    });

    describe('changeability checks', () => {
        it('should allow changes for mutable properties', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(mutability.canChange()).toBe(true);
            expect(mutability.requiresReplacement()).toBe(false);
        });

        it('should not allow changes for immutable properties', () => {
            const mutability = new PropertyMutability('IMMUTABLE');

            expect(mutability.canChange()).toBe(false);
            expect(mutability.requiresReplacement()).toBe(true);
        });

        it('should conditionally allow changes', () => {
            const mutability = new PropertyMutability('CONDITIONAL');

            // Conditional means it depends on other factors
            expect(mutability.canChange()).toBe(false); // Can't change without conditions met
            expect(mutability.requiresReplacement()).toBe(false); // Doesn't always require replacement
        });
    });

    describe('equality', () => {
        it('should be equal to same mutability', () => {
            const m1 = new PropertyMutability('MUTABLE');
            const m2 = new PropertyMutability('MUTABLE');

            expect(m1.equals(m2)).toBe(true);
        });

        it('should not be equal to different mutability', () => {
            const m1 = new PropertyMutability('MUTABLE');
            const m2 = new PropertyMutability('IMMUTABLE');

            expect(m1.equals(m2)).toBe(false);
        });

        it('should not be equal to non-PropertyMutability', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(mutability.equals('MUTABLE')).toBe(false);
            expect(mutability.equals(null)).toBe(false);
        });
    });

    describe('toString', () => {
        it('should return string representation', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(mutability.toString()).toBe('MUTABLE');
        });
    });

    describe('static constants', () => {
        it('should provide MUTABLE constant', () => {
            expect(PropertyMutability.MUTABLE.value).toBe('MUTABLE');
        });

        it('should provide IMMUTABLE constant', () => {
            expect(PropertyMutability.IMMUTABLE.value).toBe('IMMUTABLE');
        });

        it('should provide CONDITIONAL constant', () => {
            expect(PropertyMutability.CONDITIONAL.value).toBe('CONDITIONAL');
        });

        it('should provide VALID_TYPES array', () => {
            expect(PropertyMutability.VALID_TYPES).toEqual([
                'MUTABLE',
                'IMMUTABLE',
                'CONDITIONAL',
            ]);
        });
    });

    describe('immutability', () => {
        it('should not allow modification of value', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(() => {
                mutability.value = 'IMMUTABLE';
            }).toThrow();
        });

        it('should be frozen', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(Object.isFrozen(mutability)).toBe(true);
        });
    });

    describe('description', () => {
        it('should provide description for MUTABLE', () => {
            const mutability = new PropertyMutability('MUTABLE');

            expect(mutability.getDescription()).toBe(
                'Property can be changed without replacing the resource'
            );
        });

        it('should provide description for IMMUTABLE', () => {
            const mutability = new PropertyMutability('IMMUTABLE');

            expect(mutability.getDescription()).toBe(
                'Property cannot be changed - requires resource replacement'
            );
        });

        it('should provide description for CONDITIONAL', () => {
            const mutability = new PropertyMutability('CONDITIONAL');

            expect(mutability.getDescription()).toBe(
                'Property mutability depends on other property values or conditions'
            );
        });
    });
});
