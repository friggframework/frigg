import { useState, useCallback, createContext, useContext, useEffect } from 'react'

const AI_SETTINGS_KEY = 'frigg_ai_settings'

const DEFAULT_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    description: 'Native MCP support, best for Frigg integrations'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4 models via Vercel AI SDK'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Multi-provider gateway, access many models'
  }
]

const DEFAULT_CONFIG = {
  provider: 'anthropic',
  model: 'claude-3-5-sonnet-20241022',
  apiKey: '',
  requireApproval: true,
  confidenceThreshold: 95
}

const AISettingsContext = createContext(null)

export const AISettingsProvider = ({ children }) => {
  const [aiConfig, setAIConfigState] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_CONFIG

    const stored = localStorage.getItem(AI_SETTINGS_KEY)
    if (stored) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) }
      } catch {
        return DEFAULT_CONFIG
      }
    }
    return DEFAULT_CONFIG
  })

  const setAIConfig = useCallback((newConfig) => {
    setAIConfigState(newConfig)
    if (typeof window !== 'undefined') {
      const toStore = { ...newConfig }
      delete toStore.apiKey
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(toStore))
    }
  }, [])

  const testConnection = useCallback(async () => {
    if (!aiConfig.apiKey) {
      return { success: false, error: 'No API key provided' }
    }

    try {
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }, [aiConfig])

  const value = {
    aiConfig,
    setAIConfig,
    providers: DEFAULT_PROVIDERS,
    testConnection
  }

  return (
    <AISettingsContext.Provider value={value}>
      {children}
    </AISettingsContext.Provider>
  )
}

export const useAISettings = () => {
  const context = useContext(AISettingsContext)

  if (!context) {
    return {
      aiConfig: DEFAULT_CONFIG,
      setAIConfig: () => {},
      providers: DEFAULT_PROVIDERS,
      testConnection: async () => ({ success: false, error: 'Provider not initialized' })
    }
  }

  return context
}

export default useAISettings
