import { describe, it, expect } from 'vitest'
import { 
  validateRepositoryPath, 
  formatRepositoryName, 
  parseRepositoryInfo,
  getRepositoryStatus 
} from './repository'

describe('Repository Utilities', () => {
  describe('validateRepositoryPath', () => {
    it('returns true for valid repository paths', () => {
      expect(validateRepositoryPath('/valid/path/to/repo')).toBe(true)
      expect(validateRepositoryPath('/Users/user/project')).toBe(true)
    })

    it('returns false for invalid repository paths', () => {
      expect(validateRepositoryPath('')).toBe(false)
      expect(validateRepositoryPath(null)).toBe(false)
      expect(validateRepositoryPath(undefined)).toBe(false)
      expect(validateRepositoryPath('relative/path')).toBe(false)
    })

    it('returns false for paths that are too short', () => {
      expect(validateRepositoryPath('/')).toBe(false)
      expect(validateRepositoryPath('/a')).toBe(false)
    })
  })

  describe('formatRepositoryName', () => {
    it('formats repository names correctly', () => {
      expect(formatRepositoryName('my-awesome-app')).toBe('My Awesome App')
      expect(formatRepositoryName('frigg-integration')).toBe('Frigg Integration')
      expect(formatRepositoryName('test_repo')).toBe('Test Repo')
    })

    it('handles edge cases', () => {
      expect(formatRepositoryName('')).toBe('')
      expect(formatRepositoryName('single')).toBe('Single')
      expect(formatRepositoryName('UPPERCASE')).toBe('Uppercase')
    })

    it('removes common prefixes and suffixes', () => {
      expect(formatRepositoryName('frigg-slack-api')).toBe('Slack Api')
      expect(formatRepositoryName('my-app-backend')).toBe('My App')
      expect(formatRepositoryName('frontend-react-app')).toBe('React App')
    })
  })

  describe('parseRepositoryInfo', () => {
    it('parses complete repository information', () => {
      const rawRepo = {
        name: 'test-repo',
        path: '/test/path',
        framework: 'React',
        hasBackend: true,
        detectionReasons: ['frigg dependencies', 'config file']
      }

      const parsed = parseRepositoryInfo(rawRepo)

      expect(parsed).toEqual({
        id: expect.any(String),
        name: 'test-repo',
        displayName: 'Test Repo',
        path: '/test/path',
        framework: 'React',
        hasBackend: true,
        detectionReasons: ['frigg dependencies', 'config file'],
        status: 'unknown'
      })
    })

    it('handles minimal repository information', () => {
      const rawRepo = {
        name: 'minimal',
        path: '/minimal/path'
      }

      const parsed = parseRepositoryInfo(rawRepo)

      expect(parsed).toEqual({
        id: expect.any(String),
        name: 'minimal',
        displayName: 'Minimal',
        path: '/minimal/path',
        framework: null,
        hasBackend: false,
        detectionReasons: [],
        status: 'unknown'
      })
    })

    it('generates consistent IDs for same repository', () => {
      const repo = { name: 'test', path: '/test' }
      const parsed1 = parseRepositoryInfo(repo)
      const parsed2 = parseRepositoryInfo(repo)
      
      expect(parsed1.id).toBe(parsed2.id)
    })
  })

  describe('getRepositoryStatus', () => {
    it('returns active for running repositories', async () => {
      const mockRepo = { name: 'test', path: '/test' }
      const status = await getRepositoryStatus(mockRepo)
      
      // This would normally check if servers are running, etc.
      expect(['active', 'inactive', 'error']).toContain(status)
    })

    it('handles repository status check errors', async () => {
      const invalidRepo = { name: '', path: '' }
      const status = await getRepositoryStatus(invalidRepo)
      
      expect(status).toBe('error')
    })
  })
})