const {
    ProcessState,
    StateTransitions,
    TerminalStates,
    isTerminalState,
    isValidTransition,
    getValidNextStates,
    isValidState,
    validateTransition,
} = require('./process-state-machine');

describe('ProcessState', () => {
    it('should define all process states', () => {
        expect(ProcessState.INITIALIZING).toBe('INITIALIZING');
        expect(ProcessState.RUNNING).toBe('RUNNING');
        expect(ProcessState.PAUSED).toBe('PAUSED');
        expect(ProcessState.COMPLETED).toBe('COMPLETED');
        expect(ProcessState.ERROR).toBe('ERROR');
        expect(ProcessState.CANCELLED).toBe('CANCELLED');
    });
});

describe('isValidState', () => {
    it('should return true for valid states', () => {
        expect(isValidState('INITIALIZING')).toBe(true);
        expect(isValidState('RUNNING')).toBe(true);
        expect(isValidState('COMPLETED')).toBe(true);
    });

    it('should return false for invalid states', () => {
        expect(isValidState('INVALID')).toBe(false);
        expect(isValidState('')).toBe(false);
        expect(isValidState(null)).toBe(false);
    });
});

describe('isTerminalState', () => {
    it('should identify terminal states', () => {
        expect(isTerminalState(ProcessState.COMPLETED)).toBe(true);
        expect(isTerminalState(ProcessState.ERROR)).toBe(true);
        expect(isTerminalState(ProcessState.CANCELLED)).toBe(true);
    });

    it('should identify non-terminal states', () => {
        expect(isTerminalState(ProcessState.INITIALIZING)).toBe(false);
        expect(isTerminalState(ProcessState.RUNNING)).toBe(false);
        expect(isTerminalState(ProcessState.PAUSED)).toBe(false);
    });
});

describe('StateTransitions', () => {
    it('should define transitions from INITIALIZING', () => {
        expect(StateTransitions.INITIALIZING).toContain('RUNNING');
        expect(StateTransitions.INITIALIZING).toContain('ERROR');
        expect(StateTransitions.INITIALIZING).toContain('CANCELLED');
    });

    it('should define transitions from RUNNING', () => {
        expect(StateTransitions.RUNNING).toContain('PAUSED');
        expect(StateTransitions.RUNNING).toContain('COMPLETED');
        expect(StateTransitions.RUNNING).toContain('ERROR');
        expect(StateTransitions.RUNNING).toContain('CANCELLED');
        expect(StateTransitions.RUNNING).toContain('RUNNING'); // Self-transition
    });

    it('should define transitions from PAUSED', () => {
        expect(StateTransitions.PAUSED).toContain('RUNNING');
        expect(StateTransitions.PAUSED).toContain('COMPLETED');
        expect(StateTransitions.PAUSED).toContain('ERROR');
        expect(StateTransitions.PAUSED).toContain('CANCELLED');
    });

    it('should not allow transitions from terminal states', () => {
        expect(StateTransitions.COMPLETED).toEqual([]);
        expect(StateTransitions.ERROR).toEqual([]);
        expect(StateTransitions.CANCELLED).toEqual([]);
    });
});

describe('isValidTransition', () => {
    describe('valid transitions', () => {
        it('should allow INITIALIZING -> RUNNING', () => {
            expect(isValidTransition('INITIALIZING', 'RUNNING')).toBe(true);
        });

        it('should allow RUNNING -> COMPLETED', () => {
            expect(isValidTransition('RUNNING', 'COMPLETED')).toBe(true);
        });

        it('should allow RUNNING -> PAUSED', () => {
            expect(isValidTransition('RUNNING', 'PAUSED')).toBe(true);
        });

        it('should allow PAUSED -> RUNNING', () => {
            expect(isValidTransition('PAUSED', 'RUNNING')).toBe(true);
        });

        it('should allow RUNNING -> ERROR', () => {
            expect(isValidTransition('RUNNING', 'ERROR')).toBe(true);
        });

        it('should allow RUNNING -> CANCELLED', () => {
            expect(isValidTransition('RUNNING', 'CANCELLED')).toBe(true);
        });

        it('should allow RUNNING -> RUNNING (self-transition)', () => {
            expect(isValidTransition('RUNNING', 'RUNNING')).toBe(true);
        });
    });

    describe('invalid transitions', () => {
        it('should not allow COMPLETED -> RUNNING', () => {
            expect(isValidTransition('COMPLETED', 'RUNNING')).toBe(false);
        });

        it('should not allow ERROR -> RUNNING', () => {
            expect(isValidTransition('ERROR', 'RUNNING')).toBe(false);
        });

        it('should not allow CANCELLED -> RUNNING', () => {
            expect(isValidTransition('CANCELLED', 'RUNNING')).toBe(false);
        });

        it('should not allow INITIALIZING -> PAUSED', () => {
            expect(isValidTransition('INITIALIZING', 'PAUSED')).toBe(false);
        });

        it('should not allow INITIALIZING -> COMPLETED', () => {
            expect(isValidTransition('INITIALIZING', 'COMPLETED')).toBe(false);
        });
    });
});

describe('getValidNextStates', () => {
    it('should return valid next states from INITIALIZING', () => {
        const nextStates = getValidNextStates('INITIALIZING');
        expect(nextStates).toContain('RUNNING');
        expect(nextStates).toContain('ERROR');
        expect(nextStates).toContain('CANCELLED');
        expect(nextStates.length).toBe(3);
    });

    it('should return valid next states from RUNNING', () => {
        const nextStates = getValidNextStates('RUNNING');
        expect(nextStates).toContain('PAUSED');
        expect(nextStates).toContain('COMPLETED');
        expect(nextStates).toContain('ERROR');
        expect(nextStates).toContain('CANCELLED');
        expect(nextStates).toContain('RUNNING');
        expect(nextStates.length).toBe(5);
    });

    it('should return empty array for terminal states', () => {
        expect(getValidNextStates('COMPLETED')).toEqual([]);
        expect(getValidNextStates('ERROR')).toEqual([]);
        expect(getValidNextStates('CANCELLED')).toEqual([]);
    });

    it('should return empty array for invalid states', () => {
        expect(getValidNextStates('INVALID')).toEqual([]);
    });
});

describe('validateTransition', () => {
    describe('valid transitions', () => {
        it('should validate RUNNING -> COMPLETED', () => {
            const process = { state: 'RUNNING' };
            const result = validateTransition(process, 'COMPLETED');
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should validate RUNNING -> PAUSED', () => {
            const process = { state: 'RUNNING' };
            const result = validateTransition(process, 'PAUSED');
            expect(result.valid).toBe(true);
        });

        it('should validate PAUSED -> RUNNING', () => {
            const process = { state: 'PAUSED' };
            const result = validateTransition(process, 'RUNNING');
            expect(result.valid).toBe(true);
        });
    });

    describe('invalid state', () => {
        it('should reject invalid target state', () => {
            const process = { state: 'RUNNING' };
            const result = validateTransition(process, 'INVALID_STATE');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid state');
        });
    });

    describe('invalid transitions', () => {
        it('should reject COMPLETED -> RUNNING', () => {
            const process = { state: 'COMPLETED' };
            const result = validateTransition(process, 'RUNNING');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid transition');
        });

        it('should reject INITIALIZING -> PAUSED', () => {
            const process = { state: 'INITIALIZING' };
            const result = validateTransition(process, 'PAUSED');
            expect(result.valid).toBe(false);
            expect(result.error).toContain('Invalid transition');
        });
    });

    describe('guard validation', () => {
        it('should enforce pause guard (only from RUNNING)', () => {
            const process = { state: 'INITIALIZING' };
            const result = validateTransition(process, 'PAUSED');
            expect(result.valid).toBe(false);
        });

        it('should allow pause from RUNNING', () => {
            const process = { state: 'RUNNING' };
            const result = validateTransition(process, 'PAUSED');
            expect(result.valid).toBe(true);
        });

        it('should not allow cancel from terminal state', () => {
            const process = { state: 'COMPLETED' };
            const result = validateTransition(process, 'CANCELLED');
            expect(result.valid).toBe(false);
        });
    });

    describe('error messages', () => {
        it('should provide helpful error for invalid state', () => {
            const process = { state: 'RUNNING' };
            const result = validateTransition(process, 'INVALID');
            expect(result.error).toContain('Valid states:');
        });

        it('should provide helpful error for invalid transition', () => {
            const process = { state: 'COMPLETED' };
            const result = validateTransition(process, 'RUNNING');
            expect(result.error).toContain('Valid next states:');
        });
    });
});
