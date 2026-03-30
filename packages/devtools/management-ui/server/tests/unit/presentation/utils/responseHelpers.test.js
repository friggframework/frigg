/**
 * Unit tests for Response Helpers
 * Presentation Layer - HTTP response utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendError,
  sendBadRequest,
  sendNotFound,
  sendConflict,
  emitSocketEvent,
  emitToRoom,
  HttpStatus
} from '../../../../src/presentation/utils/responseHelpers.js'

describe('Response Helpers', () => {
  let mockRes

  beforeEach(() => {
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    }
  })

  describe('sendSuccess', () => {
    it('should send success response with data', () => {
      const data = { id: 1, name: 'test' }

      sendSuccess(mockRes, data)

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data
      })
    })

    it('should allow custom status code', () => {
      sendSuccess(mockRes, { test: true }, 202)

      expect(mockRes.status).toHaveBeenCalledWith(202)
    })
  })

  describe('sendCreated', () => {
    it('should send 201 response with data', () => {
      const data = { id: 123 }

      sendCreated(mockRes, data)

      expect(mockRes.status).toHaveBeenCalledWith(201)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data
      })
    })
  })

  describe('sendNoContent', () => {
    it('should send 204 response with no body', () => {
      sendNoContent(mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(204)
      expect(mockRes.send).toHaveBeenCalledWith()
    })
  })

  describe('sendError', () => {
    it('should send error response with message', () => {
      sendError(mockRes, 'Something went wrong')

      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Something went wrong'
      })
    })

    it('should allow custom status code', () => {
      sendError(mockRes, 'Not authorized', 401)

      expect(mockRes.status).toHaveBeenCalledWith(401)
    })

    it('should include details when provided', () => {
      const details = { field: 'name', issue: 'required' }

      sendError(mockRes, 'Validation failed', 400, details)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details
      })
    })
  })

  describe('sendBadRequest', () => {
    it('should send 400 response', () => {
      sendBadRequest(mockRes, 'Invalid input')

      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid input'
      })
    })

    it('should include validation details', () => {
      const details = { errors: ['name is required'] }

      sendBadRequest(mockRes, 'Validation failed', details)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details
      })
    })
  })

  describe('sendNotFound', () => {
    it('should send 404 response with default message', () => {
      sendNotFound(mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found'
      })
    })

    it('should use custom resource name', () => {
      sendNotFound(mockRes, 'Project')

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Project not found'
      })
    })
  })

  describe('sendConflict', () => {
    it('should send 409 response', () => {
      sendConflict(mockRes, 'Resource already exists')

      expect(mockRes.status).toHaveBeenCalledWith(409)
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Resource already exists'
      })
    })

    it('should include conflict details', () => {
      const details = { existingId: 123 }

      sendConflict(mockRes, 'Duplicate entry', details)

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Duplicate entry',
        details
      })
    })
  })

  describe('emitSocketEvent', () => {
    it('should emit event when io is available', () => {
      const mockIo = { emit: vi.fn() }
      const mockReq = {
        app: { get: vi.fn().mockReturnValue(mockIo) }
      }

      emitSocketEvent(mockReq, 'test:event', { data: 'test' })

      expect(mockReq.app.get).toHaveBeenCalledWith('io')
      expect(mockIo.emit).toHaveBeenCalledWith('test:event', { data: 'test' })
    })

    it('should not throw when io is not available', () => {
      const mockReq = {
        app: { get: vi.fn().mockReturnValue(null) }
      }

      expect(() => {
        emitSocketEvent(mockReq, 'test:event', { data: 'test' })
      }).not.toThrow()
    })
  })

  describe('emitToRoom', () => {
    it('should emit event to specific room', () => {
      const mockIo = {
        to: vi.fn().mockReturnThis(),
        emit: vi.fn()
      }
      const mockReq = {
        app: { get: vi.fn().mockReturnValue(mockIo) }
      }

      emitToRoom(mockReq, 'project-123', 'status:update', { status: 'running' })

      expect(mockIo.to).toHaveBeenCalledWith('project-123')
      expect(mockIo.emit).toHaveBeenCalledWith('status:update', { status: 'running' })
    })

    it('should not throw when io is not available', () => {
      const mockReq = {
        app: { get: vi.fn().mockReturnValue(null) }
      }

      expect(() => {
        emitToRoom(mockReq, 'room', 'event', {})
      }).not.toThrow()
    })
  })

  describe('HttpStatus constants', () => {
    it('should have correct status codes', () => {
      expect(HttpStatus.OK).toBe(200)
      expect(HttpStatus.CREATED).toBe(201)
      expect(HttpStatus.NO_CONTENT).toBe(204)
      expect(HttpStatus.BAD_REQUEST).toBe(400)
      expect(HttpStatus.UNAUTHORIZED).toBe(401)
      expect(HttpStatus.FORBIDDEN).toBe(403)
      expect(HttpStatus.NOT_FOUND).toBe(404)
      expect(HttpStatus.CONFLICT).toBe(409)
      expect(HttpStatus.UNPROCESSABLE_ENTITY).toBe(422)
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500)
      expect(HttpStatus.SERVICE_UNAVAILABLE).toBe(503)
    })
  })
})
