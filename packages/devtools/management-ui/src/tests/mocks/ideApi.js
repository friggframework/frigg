/**
 * Mock IDE API responses for testing
 */

export const mockIDEsList = {
  vscode: {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'popular',
    available: true,
    command: 'code',
    path: '/usr/local/bin/code'
  },
  webstorm: {
    id: 'webstorm',
    name: 'WebStorm',
    category: 'jetbrains',
    available: true,
    command: 'webstorm',
    path: '/Applications/WebStorm.app/Contents/MacOS/webstorm'
  },
  intellij: {
    id: 'intellij',
    name: 'IntelliJ IDEA',
    category: 'jetbrains',
    available: false,
    reason: 'Not found in PATH'
  },
  sublime: {
    id: 'sublime',
    name: 'Sublime Text',
    category: 'popular',
    available: true,
    command: 'subl',
    path: '/usr/local/bin/subl'
  },
  vim: {
    id: 'vim',
    name: 'Vim',
    category: 'terminal',
    available: true,
    command: 'vim',
    path: '/usr/bin/vim'
  },
  custom: {
    id: 'custom',
    name: 'Custom Command',
    category: 'other',
    available: true,
    reason: 'Always available'
  }
}

export const mockAPIResponses = {
  // GET /api/project/ides/available
  getAvailableIDEs: {
    success: true,
    data: {
      ides: mockIDEsList,
      detectedAt: new Date().toISOString(),
      platform: 'darwin'
    }
  },

  // POST /api/project/open-in-ide
  openInIDE: {
    success: {
      success: true,
      message: 'File opened successfully',
      ide: 'vscode',
      path: '/test/path/file.js'
    },
    error: {
      success: false,
      error: 'Failed to open file',
      message: 'IDE not found or file does not exist'
    },
    securityError: {
      success: false,
      error: 'Security validation failed',
      message: 'Path contains potentially dangerous characters'
    }
  },

  // GET /api/project/ides/:id/check
  checkIDE: {
    available: {
      success: true,
      data: {
        available: true,
        version: '1.74.0',
        path: '/usr/local/bin/code'
      }
    },
    unavailable: {
      success: false,
      data: {
        available: false,
        reason: 'Command not found in PATH'
      }
    }
  }
}

// Mock fetch function for API calls
export const mockFetch = (responses = mockAPIResponses) => {
  return jest.fn().mockImplementation((url, options = {}) => {
    const method = options.method || 'GET'

    // Handle different API endpoints
    if (url.includes('/api/project/ides/available')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responses.getAvailableIDEs)
      })
    }

    if (url.includes('/api/project/open-in-ide')) {
      const body = JSON.parse(options.body || '{}')

      // Simulate security validation
      if (body.path && (body.path.includes('../') || body.path.includes('..\\') || body.path.includes(';'))) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve(responses.openInIDE.securityError)
        })
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(responses.openInIDE.success)
      })
    }

    if (url.includes('/api/project/ides/') && url.includes('/check')) {
      const ideId = url.split('/')[4] // Extract IDE ID from URL
      const isAvailable = mockIDEsList[ideId]?.available || false

      return Promise.resolve({
        ok: isAvailable,
        status: isAvailable ? 200 : 404,
        json: () => Promise.resolve(
          isAvailable ? responses.checkIDE.available : responses.checkIDE.unavailable
        )
      })
    }

    // Default response for unknown endpoints
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Not found' })
    })
  })
}

// Security test payloads
export const securityTestPayloads = [
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32\\cmd.exe',
  '/etc/passwd; rm -rf /',
  'test.js && rm -rf /',
  'test.js | cat /etc/passwd',
  'test.js; cat /etc/passwd',
  'test.js`cat /etc/passwd`',
  'test.js$(cat /etc/passwd)',
  'test.js%00../../../etc/passwd',
  './test.js\n/etc/passwd',
  './test.js\r/etc/passwd',
  './test.js\t/etc/passwd'
]

// Helper to create mock IDE with custom properties
export const createMockIDE = (overrides = {}) => ({
  id: 'test-ide',
  name: 'Test IDE',
  category: 'other',
  available: true,
  command: 'test-command',
  ...overrides
})