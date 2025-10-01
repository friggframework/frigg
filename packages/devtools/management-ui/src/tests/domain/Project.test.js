/**
 * Project Domain Entity Tests
 * Testing business rules and domain logic
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Project } from '../../domain/entities/Project.js'

describe('Project Domain Entity', () => {
  describe('constructor', () => {
    it('should create project with required fields', () => {
      const project = new Project({
        id: 'test-project',
        name: 'Test Project'
      })

      expect(project.id).toBe('test-project')
      expect(project.name).toBe('Test Project')
      expect(project.status).toBe('stopped')
      expect(project.path).toBe('')
    })

    it('should create project with all fields', () => {
      const projectData = {
        id: 'my-project',
        name: 'My Project',
        description: 'A test project',
        path: '/path/to/project',
        status: 'running',
        port: 3000,
        environment: 'development',
        integrations: ['salesforce', 'github'],
        config: { debug: true },
        metadata: { created: '2024-01-01' }
      }

      const project = new Project(projectData)

      expect(project.id).toBe('my-project')
      expect(project.name).toBe('My Project')
      expect(project.description).toBe('A test project')
      expect(project.path).toBe('/path/to/project')
      expect(project.status).toBe('running')
      expect(project.port).toBe(3000)
      expect(project.environment).toBe('development')
      expect(project.integrations).toEqual(['salesforce', 'github'])
      expect(project.config).toEqual({ debug: true })
      expect(project.metadata).toEqual({ created: '2024-01-01' })
    })
  })

  describe('validation', () => {
    it('should throw error when id is missing', () => {
      expect(() => {
        new Project({ name: 'Test' })
      }).toThrow('Project id is required and must be a string')
    })

    it('should throw error when id is not string', () => {
      expect(() => {
        new Project({ id: 123, name: 'Test' })
      }).toThrow('Project id is required and must be a string')
    })

    it('should throw error when name is missing', () => {
      expect(() => {
        new Project({ id: 'test' })
      }).toThrow('Project name is required and must be a string')
    })

    it('should throw error when name is not string', () => {
      expect(() => {
        new Project({ id: 'test', name: 123 })
      }).toThrow('Project name is required and must be a string')
    })
  })

  describe('business methods', () => {
    let project

    beforeEach(() => {
      project = new Project({
        id: 'test-project',
        name: 'Test Project',
        status: 'running',
        port: 3000,
        integrations: ['salesforce', 'github'],
        config: { debug: true, timeout: 5000 }
      })
    })

    describe('isRunning', () => {
      it('should return true when status is running', () => {
        expect(project.isRunning()).toBe(true)
      })

      it('should return false when status is not running', () => {
        project.status = 'stopped'
        expect(project.isRunning()).toBe(false)
      })
    })

    describe('isStopped', () => {
      it('should return false when status is running', () => {
        expect(project.isStopped()).toBe(false)
      })

      it('should return true when status is stopped', () => {
        project.status = 'stopped'
        expect(project.isStopped()).toBe(true)
      })
    })

    describe('hasIntegrations', () => {
      it('should return true when integrations exist', () => {
        expect(project.hasIntegrations()).toBe(true)
      })

      it('should return false when no integrations', () => {
        project.integrations = []
        expect(project.hasIntegrations()).toBe(false)
      })

      it('should return false when integrations is null', () => {
        project.integrations = null
        expect(project.hasIntegrations()).toBe(false)
      })
    })

    describe('hasIntegration', () => {
      it('should return true for existing integration', () => {
        expect(project.hasIntegration('salesforce')).toBe(true)
        expect(project.hasIntegration('github')).toBe(true)
      })

      it('should return false for non-existing integration', () => {
        expect(project.hasIntegration('slack')).toBe(false)
      })

      it('should handle null integrations', () => {
        project.integrations = null
        expect(project.hasIntegration('salesforce')).toBe(false)
      })
    })

    describe('getConfigValue', () => {
      it('should return config value for existing key', () => {
        expect(project.getConfigValue('debug')).toBe(true)
        expect(project.getConfigValue('timeout')).toBe(5000)
      })

      it('should return undefined for non-existing key', () => {
        expect(project.getConfigValue('nonExistent')).toBeUndefined()
      })
    })

    describe('updateStatus', () => {
      it('should update status to valid value', () => {
        project.updateStatus('stopped')
        expect(project.status).toBe('stopped')
      })

      it('should throw error for invalid status', () => {
        expect(() => {
          project.updateStatus('invalid')
        }).toThrow('Invalid status: invalid. Must be one of: running, stopped, error, starting, stopping')
      })

      it('should accept all valid statuses', () => {
        const validStatuses = ['running', 'stopped', 'error', 'starting', 'stopping']

        validStatuses.forEach(status => {
          expect(() => {
            project.updateStatus(status)
          }).not.toThrow()
          expect(project.status).toBe(status)
        })
      })
    })

    describe('addIntegration', () => {
      it('should add new integration', () => {
        project.addIntegration('slack')
        expect(project.integrations).toContain('slack')
        expect(project.integrations).toEqual(['salesforce', 'github', 'slack'])
      })

      it('should not add duplicate integration', () => {
        project.addIntegration('salesforce')
        expect(project.integrations).toEqual(['salesforce', 'github'])
      })

      it('should handle null integrations array', () => {
        project.integrations = null
        project.addIntegration('slack')
        expect(project.integrations).toEqual(['slack'])
      })
    })

    describe('removeIntegration', () => {
      it('should remove existing integration', () => {
        project.removeIntegration('salesforce')
        expect(project.integrations).not.toContain('salesforce')
        expect(project.integrations).toEqual(['github'])
      })

      it('should handle non-existing integration gracefully', () => {
        project.removeIntegration('slack')
        expect(project.integrations).toEqual(['salesforce', 'github'])
      })

      it('should handle null integrations array', () => {
        project.integrations = null
        expect(() => {
          project.removeIntegration('salesforce')
        }).not.toThrow()
        expect(project.integrations).toBeNull()
      })
    })

    describe('updateConfig', () => {
      it('should merge new config with existing', () => {
        project.updateConfig({ newSetting: 'value', timeout: 10000 })
        expect(project.config).toEqual({
          debug: true,
          timeout: 10000,
          newSetting: 'value'
        })
      })

      it('should handle null config', () => {
        project.config = null
        project.updateConfig({ newSetting: 'value' })
        expect(project.config).toEqual({ newSetting: 'value' })
      })
    })

    describe('clone', () => {
      it('should create exact copy of project', () => {
        const cloned = project.clone()

        expect(cloned).not.toBe(project)
        expect(cloned.id).toBe(project.id)
        expect(cloned.name).toBe(project.name)
        expect(cloned.status).toBe(project.status)
        expect(cloned.integrations).toEqual(project.integrations)
        expect(cloned.integrations).not.toBe(project.integrations)
        expect(cloned.config).toEqual(project.config)
        expect(cloned.config).not.toBe(project.config)
      })

      it('should create independent copy', () => {
        const cloned = project.clone()

        cloned.updateStatus('stopped')
        cloned.addIntegration('slack')
        cloned.config.newKey = 'newValue'

        expect(project.status).toBe('running')
        expect(project.integrations).toEqual(['salesforce', 'github'])
        expect(project.config).toEqual({ debug: true, timeout: 5000 })
      })
    })

    describe('toObject', () => {
      it('should convert to plain object', () => {
        const obj = project.toObject()

        expect(obj).toEqual({
          id: 'test-project',
          name: 'Test Project',
          description: undefined,
          path: '',
          status: 'running',
          port: 3000,
          environment: undefined,
          integrations: ['salesforce', 'github'],
          config: { debug: true, timeout: 5000 },
          metadata: {}
        })
      })
    })

    describe('fromObject', () => {
      it('should create project from plain object', () => {
        const obj = {
          id: 'new-project',
          name: 'New Project',
          status: 'stopped',
          integrations: ['slack']
        }

        const project = Project.fromObject(obj)

        expect(project).toBeInstanceOf(Project)
        expect(project.id).toBe('new-project')
        expect(project.name).toBe('New Project')
        expect(project.status).toBe('stopped')
        expect(project.integrations).toEqual(['slack'])
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty arrays and objects', () => {
      const project = new Project({
        id: 'test',
        name: 'Test',
        integrations: [],
        config: {},
        metadata: {}
      })

      expect(project.hasIntegrations()).toBe(false)
      expect(project.integrations).toEqual([])
      expect(project.config).toEqual({})
      expect(project.metadata).toEqual({})
    })

    it('should handle undefined port', () => {
      const project = new Project({
        id: 'test',
        name: 'Test'
      })

      expect(project.port).toBeUndefined()
    })

    it('should handle complex config objects', () => {
      const complexConfig = {
        database: {
          host: 'localhost',
          port: 5432,
          settings: { ssl: true }
        },
        apis: ['api1', 'api2']
      }

      const project = new Project({
        id: 'test',
        name: 'Test',
        config: complexConfig
      })

      expect(project.config).toEqual(complexConfig)
      expect(project.getConfigValue('database')).toEqual(complexConfig.database)
    })
  })
})