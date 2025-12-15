/**
 * Controller Wrapper Utilities
 * Provides higher-order functions to reduce boilerplate in Express controllers
 *
 * DDD: Part of Presentation layer - handles HTTP-specific concerns
 */

import { sendSuccess, sendCreated, sendError, emitSocketEvent } from './responseHelpers.js'

/**
 * Wraps an async controller method with try/catch and automatic error forwarding
 * @param {Function} fn - Async controller method
 * @returns {Function} Wrapped controller method
 *
 * @example
 * // Before:
 * async getProject(req, res, next) {
 *   try {
 *     const project = await this.useCase.execute(req.params.id)
 *     res.json({ success: true, data: project })
 *   } catch (error) {
 *     next(error)
 *   }
 * }
 *
 * // After:
 * getProject = asyncHandler(async (req, res) => {
 *   const project = await this.useCase.execute(req.params.id)
 *   return project
 * })
 */
export function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res, next)
      // If the handler returned a value and response hasn't been sent, send it
      if (result !== undefined && !res.headersSent) {
        sendSuccess(res, result)
      }
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Creates an async handler that sends a 201 Created response
 * @param {Function} fn - Async controller method
 * @returns {Function} Wrapped controller method
 */
export function createHandler(fn) {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res, next)
      if (result !== undefined && !res.headersSent) {
        sendCreated(res, result)
      }
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Creates an async handler that also emits a WebSocket event on success
 * @param {Function} fn - Async controller method
 * @param {string} eventName - WebSocket event name
 * @returns {Function} Wrapped controller method
 */
export function asyncHandlerWithSocket(fn, eventName) {
  return async (req, res, next) => {
    try {
      const result = await fn(req, res, next)
      if (result !== undefined && !res.headersSent) {
        emitSocketEvent(req, eventName, result)
        sendSuccess(res, result)
      }
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Wraps all methods of a controller class with asyncHandler
 * @param {Object} controller - Controller instance
 * @param {string[]} exclude - Method names to exclude from wrapping
 * @returns {Object} Controller with wrapped methods
 */
export function wrapController(controller, exclude = []) {
  const prototype = Object.getPrototypeOf(controller)
  const methodNames = Object.getOwnPropertyNames(prototype)
    .filter(name =>
      name !== 'constructor' &&
      typeof prototype[name] === 'function' &&
      !exclude.includes(name) &&
      !name.startsWith('_') // Skip private methods
    )

  methodNames.forEach(name => {
    const originalMethod = controller[name].bind(controller)
    controller[name] = asyncHandler(originalMethod)
  })

  return controller
}

/**
 * Decorator-style function for validation before handler execution
 * @param {Object} schema - Validation schema (field: validator pairs)
 * @param {Function} fn - Handler function to execute after validation
 * @returns {Function} Wrapped handler with validation
 *
 * @example
 * withValidation(
 *   { name: required, port: isNumber },
 *   async (req, res) => {
 *     // Validation passed, execute handler
 *   }
 * )
 */
export function withValidation(schema, fn) {
  return async (req, res, next) => {
    const errors = []
    const body = req.body || {}
    const params = req.params || {}
    const query = req.query || {}
    const data = { ...query, ...params, ...body }

    for (const [field, validator] of Object.entries(schema)) {
      const value = data[field]
      const error = validator(value, field)
      if (error) {
        errors.push(error)
      }
    }

    if (errors.length > 0) {
      return sendError(res, 'Validation failed', 400, { errors })
    }

    try {
      const result = await fn(req, res, next)
      if (result !== undefined && !res.headersSent) {
        sendSuccess(res, result)
      }
    } catch (error) {
      next(error)
    }
  }
}

/**
 * Common validators for use with withValidation
 */
export const validators = {
  required: (value, field) =>
    value === undefined || value === null || value === ''
      ? `${field} is required`
      : null,

  isString: (value, field) =>
    value !== undefined && typeof value !== 'string'
      ? `${field} must be a string`
      : null,

  isNumber: (value, field) =>
    value !== undefined && (typeof value !== 'number' || isNaN(value))
      ? `${field} must be a number`
      : null,

  isBoolean: (value, field) =>
    value !== undefined && typeof value !== 'boolean'
      ? `${field} must be a boolean`
      : null,

  isArray: (value, field) =>
    value !== undefined && !Array.isArray(value)
      ? `${field} must be an array`
      : null,

  minLength: (min) => (value, field) =>
    value !== undefined && typeof value === 'string' && value.length < min
      ? `${field} must be at least ${min} characters`
      : null,

  maxLength: (max) => (value, field) =>
    value !== undefined && typeof value === 'string' && value.length > max
      ? `${field} must be at most ${max} characters`
      : null,

  isOneOf: (options) => (value, field) =>
    value !== undefined && !options.includes(value)
      ? `${field} must be one of: ${options.join(', ')}`
      : null,

  isPath: (value, field) =>
    value !== undefined && (typeof value !== 'string' || !value.startsWith('/'))
      ? `${field} must be an absolute path`
      : null
}

export default {
  asyncHandler,
  createHandler,
  asyncHandlerWithSocket,
  wrapController,
  withValidation,
  validators
}
