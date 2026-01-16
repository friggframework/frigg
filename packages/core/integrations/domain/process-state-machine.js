/**
 * Process State Machine
 *
 * Defines valid states, transitions, and guards for process lifecycle management.
 * Inspired by state machine patterns but simplified for process tracking.
 *
 * State Machine Concepts:
 * - States: Valid process states (INITIALIZING, RUNNING, etc.)
 * - Transitions: Valid state changes (RUNNING -> COMPLETED)
 * - Guards: Conditions that must be met for transitions
 * - Events: Operations that trigger transitions (queueStateUpdate, queueError, etc.)
 *
 * Future Enhancement:
 * - Could be formalized with XState or similar if needed
 * - Could add action callbacks on state transitions
 * - Could add history/audit trail of state changes
 */

/**
 * Valid process states
 * @enum {string}
 */
const ProcessState = {
    // Initial state when process is created
    INITIALIZING: 'INITIALIZING',

    // Process is actively running
    RUNNING: 'RUNNING',

    // Process is temporarily paused (can be resumed)
    PAUSED: 'PAUSED',

    // Process completed successfully
    COMPLETED: 'COMPLETED',

    // Process failed with an error
    ERROR: 'ERROR',

    // Process was cancelled by user/system
    CANCELLED: 'CANCELLED',
};

/**
 * Valid state transitions
 * Maps: fromState -> [toState1, toState2, ...]
 *
 * This defines which state transitions are allowed.
 * Use isValidTransition() to check before transitioning.
 */
const StateTransitions = {
    [ProcessState.INITIALIZING]: [
        ProcessState.RUNNING,
        ProcessState.ERROR,
        ProcessState.CANCELLED,
    ],
    [ProcessState.RUNNING]: [
        ProcessState.PAUSED,
        ProcessState.COMPLETED,
        ProcessState.ERROR,
        ProcessState.CANCELLED,
        ProcessState.RUNNING, // Allow self-transition for progress updates
    ],
    [ProcessState.PAUSED]: [
        ProcessState.RUNNING,
        ProcessState.COMPLETED,
        ProcessState.ERROR,
        ProcessState.CANCELLED,
    ],
    [ProcessState.COMPLETED]: [
        // Terminal state - no transitions allowed
    ],
    [ProcessState.ERROR]: [
        // Terminal state - no transitions allowed
        // Could allow ERROR -> RUNNING for retry scenarios in future
    ],
    [ProcessState.CANCELLED]: [
        // Terminal state - no transitions allowed
    ],
};

/**
 * Terminal states (no further transitions allowed)
 */
const TerminalStates = [
    ProcessState.COMPLETED,
    ProcessState.ERROR,
    ProcessState.CANCELLED,
];

/**
 * Checks if a state is terminal (no further transitions)
 * @param {string} state - State to check
 * @returns {boolean} True if terminal
 */
function isTerminalState(state) {
    return TerminalStates.includes(state);
}

/**
 * Checks if a state transition is valid
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @returns {boolean} True if transition is allowed
 *
 * @example
 * isValidTransition('RUNNING', 'COMPLETED') // true
 * isValidTransition('COMPLETED', 'RUNNING') // false
 */
function isValidTransition(fromState, toState) {
    const allowedTransitions = StateTransitions[fromState];
    return allowedTransitions ? allowedTransitions.includes(toState) : false;
}

/**
 * Gets all valid next states from current state
 * @param {string} currentState - Current state
 * @returns {string[]} Array of valid next states
 *
 * @example
 * getValidNextStates('RUNNING')
 * // ['PAUSED', 'COMPLETED', 'ERROR', 'CANCELLED', 'RUNNING']
 */
function getValidNextStates(currentState) {
    return StateTransitions[currentState] || [];
}

/**
 * Validates a state string
 * @param {string} state - State to validate
 * @returns {boolean} True if valid state
 */
function isValidState(state) {
    return Object.values(ProcessState).includes(state);
}

/**
 * Guards for state transitions
 * These are conditions that must be met before allowing a transition.
 * Currently simple, but can be extended with complex business logic.
 */
const TransitionGuards = {
    /**
     * Check if process can transition to COMPLETED
     * @param {Object} process - Process object
     * @returns {boolean} True if allowed
     */
    canComplete(process) {
        // Could add business logic here:
        // - Check all child processes are complete
        // - Verify metrics meet completion criteria
        // - etc.
        return !isTerminalState(process.state);
    },

    /**
     * Check if process can transition to ERROR
     * @param {Object} process - Process object
     * @returns {boolean} True if allowed
     */
    canError(process) {
        // Could add logic to prevent errors in certain states
        return !isTerminalState(process.state);
    },

    /**
     * Check if process can be paused
     * @param {Object} process - Process object
     * @returns {boolean} True if allowed
     */
    canPause(process) {
        return process.state === ProcessState.RUNNING;
    },

    /**
     * Check if process can be resumed
     * @param {Object} process - Process object
     * @returns {boolean} True if allowed
     */
    canResume(process) {
        return process.state === ProcessState.PAUSED;
    },

    /**
     * Check if process can be cancelled
     * @param {Object} process - Process object
     * @returns {boolean} True if allowed
     */
    canCancel(process) {
        return !isTerminalState(process.state);
    },
};

/**
 * Validates a state transition with guards
 * @param {Object} process - Process object
 * @param {string} toState - Target state
 * @returns {Object} { valid: boolean, error?: string }
 *
 * @example
 * validateTransition(process, 'COMPLETED')
 * // { valid: true } or { valid: false, error: 'Invalid transition' }
 */
function validateTransition(process, toState) {
    const fromState = process.state;

    // Check if state is valid
    if (!isValidState(toState)) {
        return {
            valid: false,
            error: `Invalid state: ${toState}. Valid states: ${Object.values(ProcessState).join(', ')}`,
        };
    }

    // Check if transition is allowed by state machine
    if (!isValidTransition(fromState, toState)) {
        return {
            valid: false,
            error: `Invalid transition from ${fromState} to ${toState}. ` +
                   `Valid next states: ${getValidNextStates(fromState).join(', ')}`,
        };
    }

    // Check guards
    if (toState === ProcessState.COMPLETED && !TransitionGuards.canComplete(process)) {
        return { valid: false, error: 'Process cannot be completed in current state' };
    }

    if (toState === ProcessState.ERROR && !TransitionGuards.canError(process)) {
        return { valid: false, error: 'Process cannot transition to ERROR in current state' };
    }

    if (toState === ProcessState.PAUSED && !TransitionGuards.canPause(process)) {
        return { valid: false, error: 'Process can only be paused from RUNNING state' };
    }

    if (toState === ProcessState.CANCELLED && !TransitionGuards.canCancel(process)) {
        return { valid: false, error: 'Process cannot be cancelled in terminal state' };
    }

    return { valid: true };
}

module.exports = {
    ProcessState,
    StateTransitions,
    TerminalStates,
    TransitionGuards,
    isTerminalState,
    isValidTransition,
    getValidNextStates,
    isValidState,
    validateTransition,
};
