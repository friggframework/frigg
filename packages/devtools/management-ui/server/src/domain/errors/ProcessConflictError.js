/**
 * Error thrown when attempting to start a process that's already running
 */
export class ProcessConflictError extends Error {
  constructor(message, existingProcess) {
    super(message)
    this.name = 'ProcessConflictError'
    this.statusCode = 409 // Conflict
    this.existingProcess = existingProcess
  }
}
