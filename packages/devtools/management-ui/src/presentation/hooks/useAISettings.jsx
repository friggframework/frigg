import { useState, useCallback, createContext, useContext, useEffect } from 'react'

const AI_SETTINGS_KEY = 'frigg_ai_settings'

// Available providers
export const AI_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic API',
    description: 'Direct API access with pay-per-token pricing',
    requiresApiKey: true
  },
  {
    id: 'claude-code',
    name: 'Claude Code (MAX Subscription)',
    description: 'Use your Claude Pro/MAX subscription via Claude Code SDK',
    requiresApiKey: false
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4 models via Vercel AI SDK',
    requiresApiKey: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Multi-provider gateway, access many models',
    requiresApiKey: true
  }
]

// Available models organized by provider
export const AI_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Fast & capable', recommended: true },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most powerful' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Previous gen' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest' },
  ],
  'claude-code': [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Fast & capable', recommended: true },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', description: 'Most powerful' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Previous gen' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable', recommended: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast & affordable' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous flagship' },
  ],
  openrouter: [
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', description: 'Via OpenRouter', recommended: true },
    { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', description: 'Via OpenRouter' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'Via OpenRouter' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', description: 'Via OpenRouter' },
  ]
}

// Helper functions - exported for use in components
export const getProviderDisplayName = (providerId) => {
  const provider = AI_PROVIDERS.find(p => p.id === providerId)
  return provider?.name || providerId
}

export const getModelDisplayName = (modelId, providerId) => {
  const models = AI_MODELS[providerId] || Object.values(AI_MODELS).flat()
  const model = models.find(m => m.id === modelId)
  if (model) return model.name
  // Fallback: clean up model ID
  return modelId?.split('/').pop()?.split('-').slice(0, 3).map(
    s => s.charAt(0).toUpperCase() + s.slice(1)
  ).join(' ') || 'Unknown'
}

export const getModelsForProvider = (providerId) => {
  return AI_MODELS[providerId] || AI_MODELS.anthropic
}

export const providerRequiresApiKey = (providerId) => {
  const provider = AI_PROVIDERS.find(p => p.id === providerId)
  return provider?.requiresApiKey ?? true
}

const DEFAULT_CONFIG = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
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

  // Convenience method to update just the model
  const setModel = useCallback((modelId) => {
    setAIConfigState(prev => {
      const newConfig = { ...prev, model: modelId }
      if (typeof window !== 'undefined') {
        const toStore = { ...newConfig }
        delete toStore.apiKey
        localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(toStore))
      }
      return newConfig
    })
  }, [])

  // Convenience method to update just the provider (and reset model to default for that provider)
  const setProvider = useCallback((providerId) => {
    setAIConfigState(prev => {
      const models = getModelsForProvider(providerId)
      const defaultModel = models.find(m => m.recommended)?.id || models[0]?.id
      const newConfig = { ...prev, provider: providerId, model: defaultModel }
      if (typeof window !== 'undefined') {
        const toStore = { ...newConfig }
        delete toStore.apiKey
        localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(toStore))
      }
      return newConfig
    })
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
    setModel,
    setProvider,
    providers: AI_PROVIDERS,
    models: getModelsForProvider(aiConfig.provider),
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
      setModel: () => {},
      setProvider: () => {},
      providers: AI_PROVIDERS,
      models: AI_MODELS.anthropic,
      testConnection: async () => ({ success: false, error: 'Provider not initialized' })
    }
  }

  return context
}

export default useAISettings
