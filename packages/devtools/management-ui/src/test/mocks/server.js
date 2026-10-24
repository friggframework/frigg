import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock API responses
export const handlers = [
  // Health check
  http.get('/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 123.45,
      version: '1.0.0'
    })
  }),

  // Repository endpoints
  http.get('/api/repository/current', () => {
    return HttpResponse.json({
      data: {
        repository: {
          name: 'test-repo',
          path: '/test/path',
          framework: 'React',
          hasBackend: true,
          version: '1.0.0'
        }
      }
    })
  }),

  http.get('/api/project/repositories', () => {
    return HttpResponse.json({
      data: {
        repositories: [
          {
            name: 'test-repo-1',
            path: '/test/path/1',
            framework: 'React',
            hasBackend: true,
            detectionReasons: ['frigg dependencies']
          },
          {
            name: 'test-repo-2', 
            path: '/test/path/2',
            framework: 'Vue',
            hasBackend: false,
            detectionReasons: ['frigg config file']
          }
        ]
      }
    })
  }),

  http.post('/api/project/switch-repository', () => {
    return HttpResponse.json({
      data: {
        repository: {
          name: 'switched-repo',
          path: '/switched/path'
        }
      }
    })
  }),

  // Project status
  http.get('/api/project/status', () => {
    return HttpResponse.json({
      data: {
        status: 'running'
      }
    })
  }),

  // Integrations
  http.get('/api/integrations', () => {
    return HttpResponse.json({
      data: {
        integrations: [
          {
            name: 'slack',
            version: '1.0.0',
            installed: true,
            configured: true
          },
          {
            name: 'github',
            version: '2.0.0', 
            installed: false,
            configured: false
          }
        ]
      }
    })
  }),

  // Environment
  http.get('/api/environment', () => {
    return HttpResponse.json({
      data: {
        variables: {
          NODE_ENV: 'test',
          DATABASE_URL: 'test://localhost:27017/test'
        }
      }
    })
  }),

  // Users
  http.get('/api/users', () => {
    return HttpResponse.json({
      data: {
        users: [
          {
            id: '1',
            email: 'test@example.com',
            name: 'Test User',
            createdAt: '2023-01-01T00:00:00Z'
          }
        ]
      }
    })
  }),

  // Connections
  http.get('/api/connections', () => {
    return HttpResponse.json({
      data: {
        connections: [
          {
            id: '1',
            type: 'slack',
            name: 'Test Slack',
            status: 'active',
            lastUsed: '2023-01-01T00:00:00Z'
          }
        ]
      }
    })
  }),

  // Logs
  http.get('/api/project/logs', () => {
    return HttpResponse.json({
      data: {
        logs: [
          {
            timestamp: '2023-01-01T00:00:00Z',
            level: 'info',
            message: 'Test log message',
            source: 'test'
          }
        ]
      }
    })
  }),

  // Metrics
  http.get('/api/project/metrics', () => {
    return HttpResponse.json({
      data: {
        cpu: 45.2,
        memory: 67.8,
        requests: 1234,
        errors: 5
      }
    })
  }),

  // IDE integration
  http.post('/api/open-in-ide', () => {
    return HttpResponse.json({
      success: true,
      method: 'vscode'
    })
  }),
]

export const server = setupServer(...handlers)