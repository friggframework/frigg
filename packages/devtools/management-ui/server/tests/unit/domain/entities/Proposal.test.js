/**
 * Proposal Entity Tests
 * TDD tests for the Proposal domain entity
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Proposal } from '../../../../src/domain/entities/Proposal.js'

describe('Proposal Entity', () => {
  describe('constructor', () => {
    it('should create a valid proposal with required fields', () => {
      const proposal = new Proposal({
        id: 'proposal-123',
        sessionId: 'session-456',
        toolName: 'Write',
        toolArgs: { file_path: '/test/file.js', content: 'test' }
      })

      expect(proposal.id).toBe('proposal-123')
      expect(proposal.sessionId).toBe('session-456')
      expect(proposal.toolName).toBe('Write')
      expect(proposal.status).toBe('pending')
      expect(proposal.createdAt).toBeInstanceOf(Date)
      expect(proposal.resolvedAt).toBeNull()
      expect(proposal.resolvedBy).toBeNull()
    })

    it('should throw error if id is missing', () => {
      expect(() => new Proposal({
        sessionId: 'session-456',
        toolName: 'Write',
        toolArgs: {}
      })).toThrow('Proposal ID is required')
    })

    it('should throw error if sessionId is missing', () => {
      expect(() => new Proposal({
        id: 'proposal-123',
        toolName: 'Write',
        toolArgs: {}
      })).toThrow('Session ID is required')
    })

    it('should throw error if toolName is missing', () => {
      expect(() => new Proposal({
        id: 'proposal-123',
        sessionId: 'session-456',
        toolArgs: {}
      })).toThrow('Tool name is required')
    })

    it('should throw error for invalid status', () => {
      expect(() => new Proposal({
        id: 'proposal-123',
        sessionId: 'session-456',
        toolName: 'Write',
        toolArgs: {},
        status: 'invalid'
      })).toThrow('Invalid proposal status: invalid')
    })
  })

  describe('canApprove', () => {
    it('should return true for pending proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {}
      })
      expect(proposal.canApprove()).toBe(true)
    })

    it('should return false for approved proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })
      expect(proposal.canApprove()).toBe(false)
    })

    it('should return false for rejected proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'rejected'
      })
      expect(proposal.canApprove()).toBe(false)
    })
  })

  describe('canReject', () => {
    it('should return true for pending proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {}
      })
      expect(proposal.canReject()).toBe(true)
    })

    it('should return false for non-pending proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })
      expect(proposal.canReject()).toBe(false)
    })
  })

  describe('canRollback', () => {
    it('should return true for approved proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })
      expect(proposal.canRollback()).toBe(true)
    })

    it('should return false for pending proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {}
      })
      expect(proposal.canRollback()).toBe(false)
    })

    it('should return false for rejected proposals', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'rejected'
      })
      expect(proposal.canRollback()).toBe(false)
    })
  })

  describe('approve', () => {
    it('should change status to approved', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {}
      })

      proposal.approve('user-123')

      expect(proposal.status).toBe('approved')
      expect(proposal.resolvedAt).toBeInstanceOf(Date)
      expect(proposal.resolvedBy).toBe('user-123')
    })

    it('should throw error if already approved', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })

      expect(() => proposal.approve()).toThrow('Cannot approve proposal with status: approved')
    })

    it('should throw error if rejected', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'rejected'
      })

      expect(() => proposal.approve()).toThrow('Cannot approve proposal with status: rejected')
    })
  })

  describe('reject', () => {
    it('should change status to rejected', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {}
      })

      proposal.reject('user-123')

      expect(proposal.status).toBe('rejected')
      expect(proposal.resolvedAt).toBeInstanceOf(Date)
      expect(proposal.resolvedBy).toBe('user-123')
    })

    it('should throw error if not pending', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })

      expect(() => proposal.reject()).toThrow('Cannot reject proposal with status: approved')
    })
  })

  describe('rollback', () => {
    it('should change status to rolled_back', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {},
        status: 'approved'
      })

      proposal.rollback('user-123')

      expect(proposal.status).toBe('rolled_back')
      expect(proposal.resolvedAt).toBeInstanceOf(Date)
      expect(proposal.resolvedBy).toBe('user-123')
    })

    it('should throw error if not approved', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: {}
      })

      expect(() => proposal.rollback()).toThrow('Cannot rollback proposal with status: pending')
    })
  })

  describe('getFilePath', () => {
    it('should return file_path from toolArgs', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: { file_path: '/test/file.js' }
      })

      expect(proposal.getFilePath()).toBe('/test/file.js')
    })

    it('should return path from toolArgs if file_path not present', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Glob',
        toolArgs: { path: '/test/dir' }
      })

      expect(proposal.getFilePath()).toBe('/test/dir')
    })

    it('should return null if no path in toolArgs', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Bash',
        toolArgs: { command: 'ls -la' }
      })

      expect(proposal.getFilePath()).toBeNull()
    })
  })

  describe('getProposedChanges', () => {
    it('should return create change for Write tool', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: { file_path: '/test/new.js', content: 'const x = 1' }
      })

      expect(proposal.getProposedChanges()).toEqual({
        type: 'create',
        filePath: '/test/new.js',
        content: 'const x = 1'
      })
    })

    it('should return edit change for Edit tool', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Edit',
        toolArgs: {
          file_path: '/test/existing.js',
          old_string: 'const x = 1',
          new_string: 'const x = 2',
          replace_all: true
        }
      })

      expect(proposal.getProposedChanges()).toEqual({
        type: 'edit',
        filePath: '/test/existing.js',
        oldString: 'const x = 1',
        newString: 'const x = 2',
        replaceAll: true
      })
    })

    it('should return unknown for other tools', () => {
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Bash',
        toolArgs: { command: 'npm install' }
      })

      expect(proposal.getProposedChanges()).toEqual({
        type: 'unknown',
        toolName: 'Bash',
        args: { command: 'npm install' }
      })
    })
  })

  describe('toJSON', () => {
    it('should return serializable object', () => {
      const createdAt = new Date('2024-01-01T00:00:00Z')
      const proposal = new Proposal({
        id: 'p-1',
        sessionId: 's-1',
        toolName: 'Write',
        toolArgs: { file_path: '/test/file.js', content: 'test' },
        createdAt
      })

      const json = proposal.toJSON()

      expect(json.id).toBe('p-1')
      expect(json.sessionId).toBe('s-1')
      expect(json.toolName).toBe('Write')
      expect(json.status).toBe('pending')
      expect(json.createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(json.resolvedAt).toBeNull()
      expect(json.filePath).toBe('/test/file.js')
      expect(json.changes.type).toBe('create')
    })
  })

  describe('fromToolCall', () => {
    it('should create proposal from tool_call event', () => {
      const toolCallEvent = {
        type: 'tool_call',
        name: 'Write',
        args: { file_path: '/test/file.js', content: 'test content' },
        toolUseId: 'tool-123'
      }

      const proposal = Proposal.fromToolCall(toolCallEvent, 'session-456')

      expect(proposal.id).toBe('tool-123')
      expect(proposal.sessionId).toBe('session-456')
      expect(proposal.toolName).toBe('Write')
      expect(proposal.toolArgs).toEqual(toolCallEvent.args)
      expect(proposal.status).toBe('pending')
    })

    it('should generate id if toolUseId not present', () => {
      const toolCallEvent = {
        type: 'tool_call',
        name: 'Edit',
        args: { file_path: '/test/file.js', old_string: 'a', new_string: 'b' }
      }

      const proposal = Proposal.fromToolCall(toolCallEvent, 'session-456')

      expect(proposal.id).toMatch(/^proposal-\d+$/)
    })
  })
})
