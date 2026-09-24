/**
 * Process Error Helpers
 *
 * Constructs Errors carrying a stable `code` so the application layer
 * (`createProcessCommands` → `mapErrorToResponse`) can translate domain
 * failures into HTTP statuses:
 *   - INVALID_PROCESS_DATA → 400 (caller-supplied data is invalid)
 *   - PROCESS_NOT_FOUND    → 404 (the referenced process does not exist)
 *
 * Repository/infrastructure failures are intentionally left uncoded so
 * they surface as 500s.
 */

function createCodedError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function invalidProcessData(message) {
    return createCodedError(message, 'INVALID_PROCESS_DATA');
}

function processNotFound(message) {
    return createCodedError(message, 'PROCESS_NOT_FOUND');
}

module.exports = { invalidProcessData, processNotFound };
