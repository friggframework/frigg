/**
 * Unit tests for FileSystemProjectRepository
 * Infrastructure Layer - Repository should handle file system operations atomically
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'

// Mock fs/promises module
vi.mock('fs/promises', async (importOriginal) => {
  return {
    default: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      access: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn()
    }
  }
})

// Mock node:module - need to provide actual createRequire
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createRequire: vi.fn(() => vi.fn())
  }
})

import fs from 'fs/promises'
import { FileSystemProjectRepository } from '../../../../src/infrastructure/repositories/FileSystemProjectRepository.js'

describe('FileSystemProjectRepository - Infrastructure Layer', () => {
  let repository
  const mockProjectPath = '/Users/test/frigg-project/backend'

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new FileSystemProjectRepository({ projectPath: mockProjectPath })
  })

  describe('Constructor', () => {
    it('should initialize with project path', () => {
      expect(repository.projectPath).toBe(mockProjectPath)
      expect(repository.appDefinitionPath).toBe(path.join(mockProjectPath, 'src', 'app.js'))
      expect(repository.configPath).toBe(path.join(mockProjectPath, 'frigg.config.json'))
      expect(repository.packageJsonPath).toBe(path.join(mockProjectPath, 'package.json'))
    })

    it('should throw when projectPath not provided', () => {
      expect(() => new FileSystemProjectRepository({})).toThrow()
    })
  })

  describe('findByPath - Atomic Operation', () => {
    it('should return null when package.json fails to load', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'))
      fs.access.mockRejectedValue(new Error('ENOENT'))

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeNull()
    })

    it('should return AppDefinition when package.json exists', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        description: 'Test project'
      }))
      fs.access.mockRejectedValue(new Error('ENOENT')) // No index.js or app.js

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeDefined()
      expect(result.name).toBe('test-project')
      expect(result.version).toBe('1.0.0')
    })

    it('should use the requested projectPath when provided', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({
        name: 'other-project',
        version: '2.0.0'
      }))
      fs.access.mockRejectedValue(new Error('ENOENT'))

      const customPath = '/Users/test/other-project'
      await repository.findByPath(customPath)

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(customPath, 'package.json'),
        'utf-8'
      )
    })
  })

  describe('loadPackageJson', () => {
    it('should load and parse package.json', async () => {
      const mockPackage = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          '@friggframework/core': '^2.0.0'
        }
      }
      fs.readFile.mockResolvedValue(JSON.stringify(mockPackage))

      const result = await repository.loadPackageJson()

      expect(result).toEqual(mockPackage)
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(mockProjectPath, 'package.json'),
        'utf-8'
      )
    })

    it('should allow custom path for loadPackageJson', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({ name: 'custom' }))

      const customPath = '/custom/path'
      await repository.loadPackageJson(customPath)

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(customPath, 'package.json'),
        'utf-8'
      )
    })
  })

  describe('save', () => {
    it('should save project state to .frigg-state.json', async () => {
      fs.writeFile.mockResolvedValue()

      const mockAppDefinition = {
        name: 'test',
        version: '1.0.0',
        status: { value: 'running' },
        processId: 12345,
        port: 3001,
        integrations: []
      }

      await repository.save(mockAppDefinition)

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(mockProjectPath, '.frigg-state.json'),
        expect.stringContaining('"status": "running"'),
        'utf-8'
      )
    })
  })

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      fs.access.mockResolvedValue()

      const result = await repository.fileExists('/some/file.js')

      expect(result).toBe(true)
    })

    it('should return false when file does not exist', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT'))

      const result = await repository.fileExists('/nonexistent/file.js')

      expect(result).toBe(false)
    })
  })

  describe('loadProjectState', () => {
    it('should return state when .frigg-state.json exists', async () => {
      const mockState = {
        status: 'running',
        processId: 12345,
        port: 3001
      }
      fs.access.mockResolvedValue() // File exists
      fs.readFile.mockResolvedValue(JSON.stringify(mockState))

      const result = await repository.loadProjectState()

      expect(result).toEqual(mockState)
    })

    it('should return null when state file does not exist', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT'))

      const result = await repository.loadProjectState()

      expect(result).toBeNull()
    })
  })

  describe('Error Handling', () => {
    it('should handle parse errors gracefully', async () => {
      fs.readFile.mockResolvedValue('invalid json{')

      const result = await repository.findByPath(mockProjectPath)

      expect(result).toBeNull()
    })

    it('should handle concurrent read operations', async () => {
      fs.readFile.mockResolvedValue(JSON.stringify({
        name: 'test',
        version: '1.0.0'
      }))
      fs.access.mockRejectedValue(new Error('ENOENT'))

      const promises = [
        repository.findByPath('/path1'),
        repository.findByPath('/path2'),
        repository.findByPath('/path3')
      ]

      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(fs.readFile).toHaveBeenCalledTimes(3)
    })
  })
})
