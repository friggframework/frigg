/**
 * Unit tests for Controller Wrapper Utilities
 * Presentation Layer - Controller helper functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  asyncHandler,
  createHandler,
  asyncHandlerWithSocket,
  wrapController,
  withValidation,
  validators
} from '../../../../src/presentation/utils/controllerWrapper.js'

describe('Controller Wrapper Utilities', () => {
  let mockReq
  let mockRes
  let mockNext

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
      query: {},
      app: { get: vi.fn() }
    }
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      headersSent: false
    }
    mockNext = vi.fn()
  })

  describe('asyncHandler', () => {
    it('should wrap async function and send success response', async () => {
      const handler = asyncHandler(async () => {
        return { id: 1, name: 'test' }
      })

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 1, name: 'test' }
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should call next with error on failure', async () => {
      const error = new Error('Test error')
      const handler = asyncHandler(async () => {
        throw error
      })

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(error)
      expect(mockRes.json).not.toHaveBeenCalled()
    })

    it('should not send response if headers already sent', async () => {
      mockRes.headersSent = true
      const handler = asyncHandler(async () => {
        return { data: 'test' }
      })

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.json).not.toHaveBeenCalled()
    })

    it('should not send response if handler returns undefined', async () => {
      const handler = asyncHandler(async (req, res) => {
        res.json({ custom: 'response' })
        // Return undefined
      })

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.status).not.toHaveBeenCalledWith(200)
    })
  })

  describe('createHandler', () => {
    it('should send 201 response for created resources', async () => {
      const handler = createHandler(async () => {
        return { id: 123, created: true }
      })

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 123, created: true }
      })
    })

    it('should call next with error on failure', async () => {
      const error = new Error('Creation failed')
      const handler = createHandler(async () => {
        throw error
      })

      await handler(mockReq, mockRes, mockNext)

      expect(mockNext).toHaveBeenCalledWith(error)
    })
  })

  describe('asyncHandlerWithSocket', () => {
    it('should emit socket event on success', async () => {
      const mockIo = { emit: vi.fn() }
      mockReq.app.get.mockReturnValue(mockIo)

      const handler = asyncHandlerWithSocket(async () => {
        return { status: 'updated' }
      }, 'status:changed')

      await handler(mockReq, mockRes, mockNext)

      expect(mockIo.emit).toHaveBeenCalledWith('status:changed', { status: 'updated' })
      expect(mockRes.status).toHaveBeenCalledWith(200)
    })

    it('should not emit if io is not available', async () => {
      mockReq.app.get.mockReturnValue(null)

      const handler = asyncHandlerWithSocket(async () => {
        return { data: 'test' }
      }, 'test:event')

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(200)
    })
  })

  describe('wrapController', () => {
    it('should wrap all public methods', async () => {
      class TestController {
        async getData() {
          return { data: 'test' }
        }

        async createItem() {
          return { id: 1 }
        }

        _privateMethod() {
          return 'private'
        }
      }

      const controller = new TestController()
      const wrapped = wrapController(controller)

      await wrapped.getData(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(200)
    })

    it('should exclude specified methods', async () => {
      class TestController {
        async getData() {
          return { data: 'test' }
        }

        async excludedMethod() {
          throw new Error('Should not be wrapped')
        }
      }

      const controller = new TestController()
      wrapController(controller, ['excludedMethod'])

      // excludedMethod should still throw directly
      await expect(controller.excludedMethod()).rejects.toThrow('Should not be wrapped')
    })
  })

  describe('withValidation', () => {
    it('should execute handler when validation passes', async () => {
      mockReq.body = { name: 'test' }

      const handler = withValidation(
        { name: validators.required },
        async () => ({ validated: true })
      )

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { validated: true }
      })
    })

    it('should return 400 when validation fails', async () => {
      mockReq.body = {}

      const handler = withValidation(
        { name: validators.required },
        async () => ({ validated: true })
      )

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: { errors: ['name is required'] }
      })
    })

    it('should collect multiple validation errors', async () => {
      mockReq.body = {}

      const handler = withValidation(
        {
          name: validators.required,
          email: validators.required
        },
        async () => ({})
      )

      await handler(mockReq, mockRes, mockNext)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details: {
          errors: ['name is required', 'email is required']
        }
      })
    })
  })

  describe('validators', () => {
    describe('required', () => {
      it('should return error for undefined', () => {
        expect(validators.required(undefined, 'field')).toBe('field is required')
      })

      it('should return error for null', () => {
        expect(validators.required(null, 'field')).toBe('field is required')
      })

      it('should return error for empty string', () => {
        expect(validators.required('', 'field')).toBe('field is required')
      })

      it('should return null for valid value', () => {
        expect(validators.required('value', 'field')).toBeNull()
      })
    })

    describe('isString', () => {
      it('should return error for non-string', () => {
        expect(validators.isString(123, 'field')).toBe('field must be a string')
      })

      it('should return null for string', () => {
        expect(validators.isString('test', 'field')).toBeNull()
      })

      it('should return null for undefined', () => {
        expect(validators.isString(undefined, 'field')).toBeNull()
      })
    })

    describe('isNumber', () => {
      it('should return error for non-number', () => {
        expect(validators.isNumber('123', 'field')).toBe('field must be a number')
      })

      it('should return error for NaN', () => {
        expect(validators.isNumber(NaN, 'field')).toBe('field must be a number')
      })

      it('should return null for number', () => {
        expect(validators.isNumber(42, 'field')).toBeNull()
      })
    })

    describe('isBoolean', () => {
      it('should return error for non-boolean', () => {
        expect(validators.isBoolean('true', 'field')).toBe('field must be a boolean')
      })

      it('should return null for boolean', () => {
        expect(validators.isBoolean(true, 'field')).toBeNull()
        expect(validators.isBoolean(false, 'field')).toBeNull()
      })
    })

    describe('isArray', () => {
      it('should return error for non-array', () => {
        expect(validators.isArray({}, 'field')).toBe('field must be an array')
      })

      it('should return null for array', () => {
        expect(validators.isArray([1, 2, 3], 'field')).toBeNull()
      })
    })

    describe('minLength', () => {
      it('should return error for too short string', () => {
        expect(validators.minLength(5)('abc', 'field')).toBe('field must be at least 5 characters')
      })

      it('should return null for valid length', () => {
        expect(validators.minLength(3)('test', 'field')).toBeNull()
      })
    })

    describe('maxLength', () => {
      it('should return error for too long string', () => {
        expect(validators.maxLength(3)('test', 'field')).toBe('field must be at most 3 characters')
      })

      it('should return null for valid length', () => {
        expect(validators.maxLength(10)('test', 'field')).toBeNull()
      })
    })

    describe('isOneOf', () => {
      it('should return error for invalid option', () => {
        expect(validators.isOneOf(['a', 'b', 'c'])('d', 'field')).toBe('field must be one of: a, b, c')
      })

      it('should return null for valid option', () => {
        expect(validators.isOneOf(['a', 'b', 'c'])('b', 'field')).toBeNull()
      })
    })

    describe('isPath', () => {
      it('should return error for non-absolute path', () => {
        expect(validators.isPath('relative/path', 'field')).toBe('field must be an absolute path')
      })

      it('should return null for absolute path', () => {
        expect(validators.isPath('/absolute/path', 'field')).toBeNull()
      })
    })
  })
})
