/**
 * Chat Session Repository Tests
 *
 * Tests for the file-based chat session persistence.
 * Sessions are stored in the target Frigg project directory,
 * gitignored, and recoverable across restarts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { ChatSessionRepository } from '../../../../src/infrastructure/repositories/ChatSessionRepository.js'

describe('ChatSessionRepository', () => {
  let tempDir
  let repository

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frigg-chat-test-'))
    repository = new ChatSessionRepository({ projectPath: tempDir })
  })

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('Infrastructure Layer - Atomic Operations', () => {
    describe('save', () => {
      it('should save a chat session to the .frigg directory', async () => {
        const session = {
          id: 'session-123',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] }
          ],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        await repository.save(session)

        // Verify file was created
        const sessionDir = path.join(tempDir, '.frigg', 'chat-sessions')
        const dirExists = await fs.access(sessionDir).then(() => true).catch(() => false)
        const fileExists = await fs.access(path.join(sessionDir, 'session-123.json')).then(() => true).catch(() => false)

        expect(dirExists).toBe(true)
        expect(fileExists).toBe(true)
      })

      it('should create .frigg directory if it does not exist', async () => {
        const session = {
          id: 'session-456',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        const friggDirBefore = await fs.access(path.join(tempDir, '.frigg')).then(() => true).catch(() => false)
        expect(friggDirBefore).toBe(false)

        await repository.save(session)

        const friggDirAfter = await fs.access(path.join(tempDir, '.frigg')).then(() => true).catch(() => false)
        const sessionsDirAfter = await fs.access(path.join(tempDir, '.frigg', 'chat-sessions')).then(() => true).catch(() => false)

        expect(friggDirAfter).toBe(true)
        expect(sessionsDirAfter).toBe(true)
      })

      it('should update updatedAt timestamp on save', async () => {
        const originalTime = Date.now() - 10000
        const session = {
          id: 'session-789',
          messages: [],
          createdAt: originalTime,
          updatedAt: originalTime
        }

        await repository.save(session)
        const saved = await repository.findById('session-789')

        expect(saved.createdAt).toBe(originalTime)
        expect(saved.updatedAt).toBeGreaterThan(originalTime)
      })

      it('should preserve all session data including permissionActions', async () => {
        const session = {
          id: 'session-with-actions',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Test' }] }
          ],
          permissionActions: [
            {
              id: 'action-1',
              type: 'approved',
              toolName: 'Read',
              description: 'Read file.js',
              timestamp: Date.now()
            }
          ],
          metadata: {
            branch: 'main',
            repository: 'my-project'
          },
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        await repository.save(session)
        const saved = await repository.findById('session-with-actions')

        expect(saved.permissionActions).toHaveLength(1)
        expect(saved.permissionActions[0].toolName).toBe('Read')
        expect(saved.metadata.branch).toBe('main')
      })
    })

    describe('findById', () => {
      it('should return null for non-existent session', async () => {
        const result = await repository.findById('non-existent')
        expect(result).toBeNull()
      })

      it('should retrieve a saved session', async () => {
        const session = {
          id: 'find-test',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
          ],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        await repository.save(session)
        const found = await repository.findById('find-test')

        expect(found).not.toBeNull()
        expect(found.id).toBe('find-test')
        expect(found.messages).toHaveLength(1)
      })
    })

    describe('findAll', () => {
      it('should return empty array when no sessions exist', async () => {
        const sessions = await repository.findAll()
        expect(sessions).toEqual([])
      })

      it('should return all saved sessions', async () => {
        await repository.save({ id: 'session-1', messages: [], createdAt: Date.now(), updatedAt: Date.now() })
        await repository.save({ id: 'session-2', messages: [], createdAt: Date.now(), updatedAt: Date.now() })
        await repository.save({ id: 'session-3', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

        const sessions = await repository.findAll()

        expect(sessions).toHaveLength(3)
        expect(sessions.map(s => s.id).sort()).toEqual(['session-1', 'session-2', 'session-3'])
      })

      it('should return sessions sorted by updatedAt descending (most recent first)', async () => {
        // Save sessions with delays to ensure different timestamps
        await repository.save({ id: 'first', messages: [], createdAt: Date.now(), updatedAt: Date.now() })
        await new Promise(r => setTimeout(r, 10)) // Small delay
        await repository.save({ id: 'second', messages: [], createdAt: Date.now(), updatedAt: Date.now() })
        await new Promise(r => setTimeout(r, 10)) // Small delay
        await repository.save({ id: 'third', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

        const sessions = await repository.findAll()

        // Most recent first (third was saved last, so it has the highest updatedAt)
        expect(sessions[0].id).toBe('third')
        expect(sessions[1].id).toBe('second')
        expect(sessions[2].id).toBe('first')
      })
    })

    describe('delete', () => {
      it('should delete a session by id', async () => {
        await repository.save({ id: 'to-delete', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

        expect(await repository.findById('to-delete')).not.toBeNull()

        await repository.delete('to-delete')

        expect(await repository.findById('to-delete')).toBeNull()
      })

      it('should not throw when deleting non-existent session', async () => {
        await expect(repository.delete('non-existent')).resolves.not.toThrow()
      })
    })

    describe('deleteAll', () => {
      it('should delete all sessions', async () => {
        await repository.save({ id: 's1', messages: [], createdAt: Date.now(), updatedAt: Date.now() })
        await repository.save({ id: 's2', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

        expect(await repository.findAll()).toHaveLength(2)

        await repository.deleteAll()

        expect(await repository.findAll()).toHaveLength(0)
      })
    })
  })

  describe('Session Summary', () => {
    it('should return session summaries for list view', async () => {
      await repository.save({
        id: 'summary-test',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Create a HubSpot integration' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Sure, I can help!' }] }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
      })

      const summaries = await repository.findAllSummaries()

      expect(summaries).toHaveLength(1)
      expect(summaries[0].id).toBe('summary-test')
      expect(summaries[0].messageCount).toBe(2)
      expect(summaries[0].preview).toContain('HubSpot')
      // Summary should not include full messages
      expect(summaries[0].messages).toBeUndefined()
    })
  })

  describe('Error Handling', () => {
    it('should handle corrupted JSON files gracefully', async () => {
      // Create the directory first
      await fs.mkdir(path.join(tempDir, '.frigg', 'chat-sessions'), { recursive: true })
      // Create a corrupted session file
      await fs.writeFile(
        path.join(tempDir, '.frigg', 'chat-sessions', 'corrupted.json'),
        'not valid json{'
      )

      const result = await repository.findById('corrupted')
      expect(result).toBeNull()
    })

    it('should skip corrupted files when listing all sessions', async () => {
      // Create valid session
      await repository.save({ id: 'valid', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

      // Create corrupted session file
      await fs.writeFile(
        path.join(tempDir, '.frigg', 'chat-sessions', 'corrupted.json'),
        'not valid json'
      )

      const sessions = await repository.findAll()

      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('valid')
    })
  })

  describe('Path Configuration', () => {
    it('should use custom session directory when provided', async () => {
      const customRepo = new ChatSessionRepository({
        projectPath: tempDir,
        sessionDir: 'ai-sessions'
      })

      await customRepo.save({ id: 'custom-test', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

      const fileExists = await fs.access(
        path.join(tempDir, '.frigg', 'ai-sessions', 'custom-test.json')
      ).then(() => true).catch(() => false)

      expect(fileExists).toBe(true)
    })
  })

  describe('Git Integration', () => {
    it('should create .gitignore in .frigg directory on first save', async () => {
      await repository.save({ id: 'gitignore-test', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

      const gitignorePath = path.join(tempDir, '.frigg', '.gitignore')
      const gitignoreExists = await fs.access(gitignorePath).then(() => true).catch(() => false)

      expect(gitignoreExists).toBe(true)

      const content = await fs.readFile(gitignorePath, 'utf-8')
      expect(content).toContain('*')
      expect(content).toContain('!.gitignore')
    })

    it('should not overwrite existing .gitignore', async () => {
      // Create .frigg directory with custom .gitignore
      await fs.mkdir(path.join(tempDir, '.frigg'), { recursive: true })
      await fs.writeFile(path.join(tempDir, '.frigg', '.gitignore'), 'custom content')

      await repository.save({ id: 'preserve-test', messages: [], createdAt: Date.now(), updatedAt: Date.now() })

      const content = await fs.readFile(path.join(tempDir, '.frigg', '.gitignore'), 'utf-8')
      expect(content).toBe('custom content')
    })
  })
})
