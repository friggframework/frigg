/**
 * Entity Validation Error
 * Thrown when domain entity validation fails
 */
export class EntityValidationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EntityValidationError'
    this.code = 'ENTITY_VALIDATION_ERROR'
  }
}