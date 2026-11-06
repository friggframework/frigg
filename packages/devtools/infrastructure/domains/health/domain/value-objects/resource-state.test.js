/**
 * Tests for ResourceState Value Object
 */

const ResourceState = require('./resource-state');

describe('ResourceState', () => {
    describe('valid states', () => {
        it('should accept IN_STACK state', () => {
            const state = new ResourceState('IN_STACK');

            expect(state.value).toBe('IN_STACK');
        });

        it('should accept ORPHANED state', () => {
            const state = new ResourceState('ORPHANED');

            expect(state.value).toBe('ORPHANED');
        });

        it('should accept MISSING state', () => {
            const state = new ResourceState('MISSING');

            expect(state.value).toBe('MISSING');
        });

        it('should accept DRIFTED state', () => {
            const state = new ResourceState('DRIFTED');

            expect(state.value).toBe('DRIFTED');
        });

        it('should accept EXTERNAL state', () => {
            const state = new ResourceState('EXTERNAL');

            expect(state.value).toBe('EXTERNAL');
        });
    });

    describe('invalid states', () => {
        it('should reject invalid state', () => {
            expect(() => {
                new ResourceState('INVALID');
            }).toThrow('Invalid resource state: INVALID');
        });

        it('should reject lowercase state', () => {
            expect(() => {
                new ResourceState('in_stack');
            }).toThrow('Invalid resource state: in_stack');
        });

        it('should reject null', () => {
            expect(() => {
                new ResourceState(null);
            }).toThrow('Resource state is required');
        });

        it('should reject undefined', () => {
            expect(() => {
                new ResourceState(undefined);
            }).toThrow('Resource state is required');
        });
    });

    describe('state checks', () => {
        it('should check if resource is in stack', () => {
            const state = new ResourceState('IN_STACK');

            expect(state.isInStack()).toBe(true);
            expect(state.isOrphaned()).toBe(false);
            expect(state.isMissing()).toBe(false);
            expect(state.isDrifted()).toBe(false);
            expect(state.isExternal()).toBe(false);
        });

        it('should check if resource is orphaned', () => {
            const state = new ResourceState('ORPHANED');

            expect(state.isInStack()).toBe(false);
            expect(state.isOrphaned()).toBe(true);
            expect(state.isMissing()).toBe(false);
            expect(state.isDrifted()).toBe(false);
            expect(state.isExternal()).toBe(false);
        });

        it('should check if resource is missing', () => {
            const state = new ResourceState('MISSING');

            expect(state.isInStack()).toBe(false);
            expect(state.isOrphaned()).toBe(false);
            expect(state.isMissing()).toBe(true);
            expect(state.isDrifted()).toBe(false);
            expect(state.isExternal()).toBe(false);
        });

        it('should check if resource is drifted', () => {
            const state = new ResourceState('DRIFTED');

            expect(state.isInStack()).toBe(false);
            expect(state.isOrphaned()).toBe(false);
            expect(state.isMissing()).toBe(false);
            expect(state.isDrifted()).toBe(true);
            expect(state.isExternal()).toBe(false);
        });

        it('should check if resource is external', () => {
            const state = new ResourceState('EXTERNAL');

            expect(state.isInStack()).toBe(false);
            expect(state.isOrphaned()).toBe(false);
            expect(state.isMissing()).toBe(false);
            expect(state.isDrifted()).toBe(false);
            expect(state.isExternal()).toBe(true);
        });
    });

    describe('equality', () => {
        it('should be equal to same state', () => {
            const state1 = new ResourceState('IN_STACK');
            const state2 = new ResourceState('IN_STACK');

            expect(state1.equals(state2)).toBe(true);
        });

        it('should not be equal to different state', () => {
            const state1 = new ResourceState('IN_STACK');
            const state2 = new ResourceState('ORPHANED');

            expect(state1.equals(state2)).toBe(false);
        });

        it('should not be equal to non-ResourceState', () => {
            const state = new ResourceState('IN_STACK');

            expect(state.equals('IN_STACK')).toBe(false);
            expect(state.equals(null)).toBe(false);
        });
    });

    describe('toString', () => {
        it('should return string representation', () => {
            const state = new ResourceState('IN_STACK');

            expect(state.toString()).toBe('IN_STACK');
        });
    });

    describe('static constants', () => {
        it('should provide IN_STACK constant', () => {
            expect(ResourceState.IN_STACK.value).toBe('IN_STACK');
        });

        it('should provide ORPHANED constant', () => {
            expect(ResourceState.ORPHANED.value).toBe('ORPHANED');
        });

        it('should provide MISSING constant', () => {
            expect(ResourceState.MISSING.value).toBe('MISSING');
        });

        it('should provide DRIFTED constant', () => {
            expect(ResourceState.DRIFTED.value).toBe('DRIFTED');
        });

        it('should provide EXTERNAL constant', () => {
            expect(ResourceState.EXTERNAL.value).toBe('EXTERNAL');
        });

        it('should provide VALID_STATES array', () => {
            expect(ResourceState.VALID_STATES).toEqual([
                'IN_STACK',
                'ORPHANED',
                'MISSING',
                'DRIFTED',
                'EXTERNAL',
            ]);
        });
    });

    describe('immutability', () => {
        it('should not allow modification of value', () => {
            const state = new ResourceState('IN_STACK');

            expect(() => {
                state.value = 'ORPHANED';
            }).toThrow();
        });

        it('should be frozen', () => {
            const state = new ResourceState('IN_STACK');

            expect(Object.isFrozen(state)).toBe(true);
        });
    });
});
