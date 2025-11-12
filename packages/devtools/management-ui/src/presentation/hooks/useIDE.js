import { useState, useEffect, useCallback } from 'react'

const IDE_PREFERENCES_KEY = 'frigg_ide_preferences'
const IDE_AVAILABILITY_CACHE_KEY = 'frigg_ide_availability_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export const useIDE = () => {
    const [preferredIDE, setPreferredIDE] = useState(null)
    const [availableIDEs, setAvailableIDEs] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDetecting, setIsDetecting] = useState(false)
    const [error, setError] = useState(null)

    // Load IDE preference from localStorage
    useEffect(() => {
        const savedPreference = localStorage.getItem(IDE_PREFERENCES_KEY)
        if (savedPreference) {
            try {
                setPreferredIDE(JSON.parse(savedPreference))
            } catch (error) {
                console.error('Failed to parse IDE preference:', error)
            }
        }
        setIsLoading(false)
    }, [])

    // Fetch available IDEs from backend with caching
    const fetchAvailableIDEs = useCallback(async (forceRefresh = false) => {
        try {
            setIsDetecting(true)
            setError(null)

            // Check cache first unless forcing refresh
            if (!forceRefresh) {
                const cached = localStorage.getItem(IDE_AVAILABILITY_CACHE_KEY)
                if (cached) {
                    try {
                        const { data, timestamp } = JSON.parse(cached)
                        if (Date.now() - timestamp < CACHE_DURATION) {
                            setAvailableIDEs(data)
                            setIsDetecting(false)
                            return data
                        }
                    } catch (error) {
                        console.warn('Failed to parse IDE cache:', error)
                    }
                }
            }

            const response = await fetch('/api/projects/ides/available')
            if (!response.ok) {
                throw new Error('Failed to fetch available IDEs')
            }

            const result = await response.json()
            const ides = Object.values(result.data.ides)

            // Cache the results
            localStorage.setItem(IDE_AVAILABILITY_CACHE_KEY, JSON.stringify({
                data: ides,
                timestamp: Date.now()
            }))

            setAvailableIDEs(ides)
            return ides
        } catch (error) {
            console.error('Failed to fetch available IDEs:', error)
            setError(error.message)

            // Fallback to basic IDE list without availability detection
            const fallbackIDEs = [
                { id: 'cursor', name: 'Cursor', available: false, reason: 'Detection failed' },
                { id: 'vscode', name: 'Visual Studio Code', available: false, reason: 'Detection failed' },
                { id: 'webstorm', name: 'WebStorm', available: false, reason: 'Detection failed' },
                { id: 'intellij', name: 'IntelliJ IDEA', available: false, reason: 'Detection failed' },
                { id: 'pycharm', name: 'PyCharm', available: false, reason: 'Detection failed' },
                { id: 'rider', name: 'JetBrains Rider', available: false, reason: 'Detection failed' },
                { id: 'android-studio', name: 'Android Studio', available: false, reason: 'Detection failed' },
                { id: 'sublime', name: 'Sublime Text', available: false, reason: 'Detection failed' },
                { id: 'atom', name: 'Atom (Deprecated)', available: false, reason: 'Detection failed' },
                { id: 'notepadpp', name: 'Notepad++', available: false, reason: 'Detection failed' },
                { id: 'xcode', name: 'Xcode', available: false, reason: 'Detection failed' },
                { id: 'eclipse', name: 'Eclipse IDE', available: false, reason: 'Detection failed' },
                { id: 'vim', name: 'Vim', available: false, reason: 'Detection failed' },
                { id: 'neovim', name: 'Neovim', available: false, reason: 'Detection failed' },
                { id: 'emacs', name: 'Emacs', available: false, reason: 'Detection failed' },
                { id: 'custom', name: 'Custom Command', available: true, reason: 'Always available' }
            ]
            setAvailableIDEs(fallbackIDEs)
            return fallbackIDEs
        } finally {
            setIsDetecting(false)
        }
    }, [])

    // Load available IDEs on mount
    useEffect(() => {
        fetchAvailableIDEs()
    }, [fetchAvailableIDEs])

    // Set IDE preference
    const setIDE = useCallback((ide) => {
        setPreferredIDE(ide)
        localStorage.setItem(IDE_PREFERENCES_KEY, JSON.stringify(ide))
    }, [])

    // Check specific IDE availability
    const checkIDEAvailability = useCallback(async (ideId) => {
        try {
            const response = await fetch(`/api/project/ides/${ideId}/check`)
            if (!response.ok) {
                throw new Error('Failed to check IDE availability')
            }
            return await response.json()
        } catch (error) {
            console.error(`Failed to check availability of ${ideId}:`, error)
            throw error
        }
    }, [])

    // Open file in IDE with enhanced error handling
    const openInIDE = useCallback(async (filePath, projectId = null, customCommand = null) => {
        if (!filePath) {
            throw new Error('File path is required')
        }

        try {
            let requestBody = { path: filePath }

            if (customCommand) {
                // Use custom command
                requestBody.command = customCommand
            } else if (preferredIDE) {
                // Use preferred IDE
                if (preferredIDE.id === 'custom' && preferredIDE.command) {
                    requestBody.command = preferredIDE.command
                } else {
                    requestBody.ide = preferredIDE.id
                }
            } else {
                throw new Error('No IDE configured. Please select an IDE in settings.')
            }

            // Use project-specific route (projectId is required)
            if (!projectId) {
                throw new Error('Project ID is required to open in IDE. Please ensure a project is selected.')
            }

            const url = `/api/projects/${projectId}/ide-sessions`

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.message || result.error || 'Failed to open in IDE')
            }

            return result
        } catch (error) {
            console.error('Failed to open in IDE:', error)
            throw error
        }
    }, [preferredIDE])

    // Get IDEs grouped by category
    const getIDEsByCategory = useCallback(() => {
        const categories = {
            popular: [],
            jetbrains: [],
            terminal: [],
            mobile: [],
            apple: [],
            java: [],
            windows: [],
            deprecated: [],
            other: []
        }

        availableIDEs.forEach(ide => {
            const category = ide.category || 'other'
            if (categories[category]) {
                categories[category].push(ide)
            } else {
                categories.other.push(ide)
            }
        })

        // Sort each category by availability first, then by name
        Object.keys(categories).forEach(category => {
            categories[category].sort((a, b) => {
                if (a.available !== b.available) {
                    return b.available - a.available // Available first
                }
                return a.name.localeCompare(b.name)
            })
        })

        return categories
    }, [availableIDEs])

    // Get only available IDEs
    const getAvailableIDEs = useCallback(() => {
        return availableIDEs.filter(ide => ide.available || ide.id === 'custom')
    }, [availableIDEs])

    // Clear IDE cache and refresh
    const refreshIDEDetection = useCallback(() => {
        localStorage.removeItem(IDE_AVAILABILITY_CACHE_KEY)
        return fetchAvailableIDEs(true)
    }, [fetchAvailableIDEs])

    return {
        // State
        preferredIDE,
        availableIDEs,
        isLoading,
        isDetecting,
        error,

        // Actions
        setIDE,
        openInIDE,
        checkIDEAvailability,
        fetchAvailableIDEs,
        refreshIDEDetection,

        // Computed values
        getIDEsByCategory,
        getAvailableIDEs,

        // Backward compatibility
        availableIDEs: availableIDEs // Legacy property name
    }
}
