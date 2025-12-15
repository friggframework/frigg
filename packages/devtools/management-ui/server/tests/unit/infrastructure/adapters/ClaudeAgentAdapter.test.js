/**
 * ClaudeAgentAdapter Tests (TDD - RED Phase)
 *
 * These tests define the expected behavior of the Claude Agent adapter.
 * We're testing:
 * 1. Session lifecycle (start, stop, status)
 * 2. System prompt building from prompts registry
 * 3. Event transformation from SDK to our format
 * 4. Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the SDK before importing the adapter
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn()
}))

import { ClaudeAgentAdapter } from '../../../../src/infrastructure/adapters/ClaudeAgentAdapter.js'
import { query } from '@anthropic-ai/claude-agent-sdk'

describe('ClaudeAgentAdapter', () => {
  let adapter
  const mockProjectPath = '/test/project/path'

  beforeEach(() => {
    vi.clearAllMocks()
    adapter = new ClaudeAgentAdapter({ projectPath: mockProjectPath })
  })

  afterEach(async () => {
    await adapter.cleanup()
  })

  describe('constructor', () => {
    it('should initialize with project path', () => {
      expect(adapter.projectPath).toBe(mockProjectPath)
    })

    it('should initialize with empty active sessions', () => {
      expect(adapter.activeSessions.size).toBe(0)
    })

    it('should use current directory if no project path provided', () => {
      const defaultAdapter = new ClaudeAgentAdapter()
      expect(defaultAdapter.projectPath).toBe(process.cwd())
    })
  })

  describe('startSession', () => {
    it('should create a new session with correct session ID', async () => {
      const mockGenerator = (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Hello' }] } }
      })()

      query.mockReturnValue(mockGenerator)

      const events = []
      await adapter.startSession({
        sessionId: 'test-session-1',
        prompt: 'Test prompt',
        config: {},
        onEvent: (event) => events.push(event)
      })

      expect(adapter.activeSessions.has('test-session-1') || events.some(e => e.type === 'done')).toBe(true)
    })

    it('should call query with correct options', async () => {
      const mockGenerator = (async function* () {})()
      query.mockReturnValue(mockGenerator)

      await adapter.startSession({
        sessionId: 'test-session-2',
        prompt: 'Test prompt',
        config: { model: 'claude-opus-4-20250514' },
        onEvent: vi.fn()
      })

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Test prompt',
          options: expect.objectContaining({
            cwd: mockProjectPath,
            model: 'claude-opus-4-20250514'
          })
        })
      )
    })

    it('should use default model when not specified', async () => {
      const mockGenerator = (async function* () {})()
      query.mockReturnValue(mockGenerator)

      await adapter.startSession({
        sessionId: 'test-session-3',
        prompt: 'Test prompt',
        config: {},
        onEvent: vi.fn()
      })

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            model: 'claude-sonnet-4-20250514'
          })
        })
      )
    })

    it('should set permissionMode based on requireApproval config', async () => {
      const mockGenerator = (async function* () {})()
      query.mockReturnValue(mockGenerator)

      // With approval required
      await adapter.startSession({
        sessionId: 'test-session-4',
        prompt: 'Test',
        config: { requireApproval: true },
        onEvent: vi.fn()
      })

      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            permissionMode: 'default'
          })
        })
      )

      // Without approval required
      await adapter.startSession({
        sessionId: 'test-session-5',
        prompt: 'Test',
        config: { requireApproval: false },
        onEvent: vi.fn()
      })

      expect(query).toHaveBeenLastCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            permissionMode: 'acceptEdits'
          })
        })
      )
    })

    it('should stop existing session before starting new one with same ID', async () => {
      const mockGenerator1 = (async function* () {
        // Simulate a long-running session
        await new Promise(resolve => setTimeout(resolve, 100))
        yield { type: 'content', content: 'test' }
      })()

      const mockGenerator2 = (async function* () {})()

      query.mockReturnValueOnce(mockGenerator1).mockReturnValueOnce(mockGenerator2)

      // Start first session (don't await)
      const firstSession = adapter.startSession({
        sessionId: 'duplicate-session',
        prompt: 'First',
        config: {},
        onEvent: vi.fn()
      })

      // Immediately start second session with same ID
      await adapter.startSession({
        sessionId: 'duplicate-session',
        prompt: 'Second',
        config: {},
        onEvent: vi.fn()
      })

      // First session should have been stopped
      expect(query).toHaveBeenCalledTimes(2)
    })

    it('should emit done event when session completes', async () => {
      const mockGenerator = (async function* () {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Done' }] } }
      })()

      query.mockReturnValue(mockGenerator)

      const events = []
      await adapter.startSession({
        sessionId: 'complete-session',
        prompt: 'Test',
        config: {},
        onEvent: (event) => events.push(event)
      })

      expect(events.some(e => e.type === 'done')).toBe(true)
      expect(events.find(e => e.type === 'done').sessionId).toBe('complete-session')
    })

    it('should emit error event on SDK error', async () => {
      const mockGenerator = (async function* () {
        throw new Error('SDK Error')
      })()

      query.mockReturnValue(mockGenerator)

      const events = []

      await expect(adapter.startSession({
        sessionId: 'error-session',
        prompt: 'Test',
        config: {},
        onEvent: (event) => events.push(event)
      })).rejects.toThrow('SDK Error')

      expect(events.some(e => e.type === 'error')).toBe(true)
    })
  })

  describe('stopSession', () => {
    it('should stop an active session', async () => {
      // Manually add a session
      const abortController = new AbortController()
      adapter.activeSessions.set('stop-test', {
        abortController,
        startedAt: Date.now(),
        status: 'running'
      })

      const result = await adapter.stopSession('stop-test')

      expect(result).toBe(true)
      expect(adapter.activeSessions.has('stop-test')).toBe(false)
    })

    it('should return false for non-existent session', async () => {
      const result = await adapter.stopSession('non-existent')
      expect(result).toBe(false)
    })

    it('should abort the session controller', async () => {
      const abortController = new AbortController()
      const abortSpy = vi.spyOn(abortController, 'abort')

      adapter.activeSessions.set('abort-test', {
        abortController,
        startedAt: Date.now(),
        status: 'running'
      })

      await adapter.stopSession('abort-test')

      expect(abortSpy).toHaveBeenCalled()
    })
  })

  describe('getSessionStatus', () => {
    it('should return session status for active session', () => {
      const startedAt = Date.now()
      adapter.activeSessions.set('status-test', {
        abortController: new AbortController(),
        startedAt,
        status: 'running',
        role: 'coder'
      })

      const status = adapter.getSessionStatus('status-test')

      expect(status).toMatchObject({
        sessionId: 'status-test',
        status: 'running',
        role: 'coder',
        startedAt
      })
      expect(status.duration).toBeGreaterThanOrEqual(0)
    })

    it('should return null for non-existent session', () => {
      const status = adapter.getSessionStatus('non-existent')
      expect(status).toBeNull()
    })
  })

  describe('getAvailableRoles', () => {
    it('should return standard and adversarial roles', () => {
      const roles = adapter.getAvailableRoles()

      expect(roles).toHaveProperty('standard')
      expect(roles).toHaveProperty('adversarial')
      expect(Array.isArray(roles.standard)).toBe(true)
      expect(Array.isArray(roles.adversarial)).toBe(true)
    })

    it('should include expected standard roles', () => {
      const roles = adapter.getAvailableRoles()

      expect(roles.standard).toContain('coder')
      expect(roles.standard).toContain('reviewer')
      expect(roles.standard).toContain('architect')
      expect(roles.standard).toContain('tdd')
    })

    it('should include expected adversarial roles', () => {
      const roles = adapter.getAvailableRoles()

      expect(roles.adversarial).toContain('securityAuditor')
      expect(roles.adversarial).toContain('architectureCritic')
      expect(roles.adversarial).toContain('testCritic')
    })
  })

  describe('_buildSystemPrompt', () => {
    it('should include Frigg framework context', () => {
      const prompt = adapter._buildSystemPrompt({})

      expect(prompt).toContain('Frigg')
      expect(prompt).toContain('integration')
    })

    it('should include role-specific prompt when role is specified', () => {
      const prompt = adapter._buildSystemPrompt({ role: 'coder' })

      expect(prompt).toContain('code generation')
    })

    it('should include TDD patterns when includeTDD is true', () => {
      const prompt = adapter._buildSystemPrompt({ includeTDD: true })

      expect(prompt).toContain('TDD')
      expect(prompt).toContain('RED')
      expect(prompt).toContain('GREEN')
    })

    it('should include architecture patterns when includeArchitecture is true', () => {
      const prompt = adapter._buildSystemPrompt({ includeArchitecture: true })

      expect(prompt).toContain('Hexagonal')
      expect(prompt).toContain('Repository')
      expect(prompt).toContain('Use Case')
    })

    it('should include adversarial role prompt', () => {
      const prompt = adapter._buildSystemPrompt({ role: 'securityAuditor' })

      expect(prompt).toContain('security')
      expect(prompt).toContain('vulnerabil')
    })
  })

  describe('_transformSDKMessage', () => {
    it('should transform assistant text message', () => {
      const sdkMessage = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }]
        }
      }

      const event = adapter._transformSDKMessage(sdkMessage)

      expect(event).toEqual({ type: 'content', content: 'Hello world' })
    })

    it('should transform tool_use message', () => {
      const sdkMessage = {
        type: 'tool_use',
        name: 'read_file',
        input: { path: '/test.js' },
        id: 'tool-123'
      }

      const event = adapter._transformSDKMessage(sdkMessage)

      expect(event).toEqual({
        type: 'tool_call',
        name: 'read_file',
        args: { path: '/test.js' },
        toolUseId: 'tool-123'
      })
    })

    it('should transform tool_result message', () => {
      const sdkMessage = {
        type: 'tool_result',
        name: 'read_file',
        content: 'file contents',
        is_error: false
      }

      const event = adapter._transformSDKMessage(sdkMessage)

      expect(event).toEqual({
        type: 'tool_result',
        name: 'read_file',
        result: 'file contents',
        isError: false
      })
    })

    it('should transform error message', () => {
      const sdkMessage = {
        type: 'error',
        error: { message: 'Something went wrong' }
      }

      const event = adapter._transformSDKMessage(sdkMessage)

      expect(event).toEqual({
        type: 'error',
        error: { message: 'Something went wrong' }
      })
    })

    it('should return null for user messages', () => {
      const sdkMessage = { type: 'user' }
      const event = adapter._transformSDKMessage(sdkMessage)
      expect(event).toBeNull()
    })

    it('should return null for unknown message types', () => {
      const sdkMessage = { type: 'unknown_type' }
      const event = adapter._transformSDKMessage(sdkMessage)
      expect(event).toBeNull()
    })
  })

  describe('cleanup', () => {
    it('should stop all active sessions', async () => {
      // Add multiple sessions
      adapter.activeSessions.set('session-1', {
        abortController: new AbortController(),
        startedAt: Date.now(),
        status: 'running'
      })
      adapter.activeSessions.set('session-2', {
        abortController: new AbortController(),
        startedAt: Date.now(),
        status: 'running'
      })

      await adapter.cleanup()

      expect(adapter.activeSessions.size).toBe(0)
    })
  })
})
