/**
 * ListAvailableIDEsUseCase Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ListAvailableIDEsUseCase } from '../../../../../src/application/use-cases/ide/ListAvailableIDEsUseCase.js'

describe('ListAvailableIDEsUseCase', () => {
  let useCase
  let mockIDERepository

  beforeEach(() => {
    mockIDERepository = {
      getAvailableIDEs: vi.fn()
    }

    useCase = new ListAvailableIDEsUseCase({
      ideRepository: mockIDERepository
    })
  })

  describe('listing IDEs', () => {
    it('should return list of available IDEs', async () => {
      mockIDERepository.getAvailableIDEs.mockResolvedValue({
        vscode: { id: 'vscode', name: 'Visual Studio Code', available: true },
        cursor: { id: 'cursor', name: 'Cursor', available: true }
      })

      const result = await useCase.execute()

      expect(result.ides.vscode).toBeDefined()
      expect(result.ides.vscode.name).toBe('Visual Studio Code')
      expect(result.ides.cursor.available).toBe(true)
    })
  })
})
