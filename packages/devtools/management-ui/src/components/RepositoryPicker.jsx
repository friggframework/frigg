import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Search, Folder, GitBranch } from 'lucide-react'
import { cn } from '../lib/utils'
import api from '../services/api'

const RepositoryPicker = ({ currentRepo, onRepoChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [repositories, setRepositories] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    fetchRepositories()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchRepositories = async () => {
    setLoading(true)
    try {
      const response = await api.get('/api/project/repositories')
      console.log('Repository API response:', response.data)
      const repos = response.data.data?.repositories || response.data.repositories || []
      console.log(`Setting ${repos.length} repositories`)
      setRepositories(repos)
    } catch (error) {
      console.error('Failed to fetch repositories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRepoSelect = async (repo) => {
    try {
      await api.post('/api/project/switch-repository', { repositoryPath: repo.path })
      onRepoChange(repo)
      setIsOpen(false)
      // Reload the page to refresh all data with new repository context
      window.location.reload()
    } catch (error) {
      console.error('Failed to switch repository:', error)
    }
  }

  const filteredRepos = repositories.filter(repo => 
    repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    repo.path.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getFrameworkColor = (framework) => {
    const colors = {
      'React': 'text-blue-500',
      'Vue': 'text-green-500',
      'Angular': 'text-red-500',
      'Svelte': 'text-orange-500'
    }
    return colors[framework] || 'text-gray-500'
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md",
          "bg-white border border-gray-300 hover:bg-gray-50",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          "transition-colors duration-150"
        )}
      >
        <Folder className="h-4 w-4 text-gray-500" />
        <span className="max-w-[200px] truncate">
          {currentRepo?.name || 'Select Repository'}
        </span>
        <ChevronDown className={cn(
          "h-4 w-4 text-gray-400 transition-transform duration-200",
          isOpen && "transform rotate-180"
        )} />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute z-50 mt-2 w-96 rounded-md shadow-lg",
          "bg-white border border-gray-200",
          "max-h-96 overflow-hidden flex flex-col"
        )}>
          {/* Search bar */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Repository list */}
          <div className="overflow-y-auto max-h-80">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                Loading repositories...
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No repositories found
              </div>
            ) : (
              <div className="py-1">
                {filteredRepos.map((repo) => (
                  <button
                    key={repo.path}
                    onClick={() => handleRepoSelect(repo)}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-gray-50",
                      "flex items-start gap-3 group",
                      currentRepo?.path === repo.path && "bg-blue-50"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {currentRepo?.path === repo.path ? (
                        <Check className="h-4 w-4 text-blue-600" />
                      ) : (
                        <GitBranch className="h-4 w-4 text-gray-400 group-hover:text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {repo.name}
                        </p>
                        {repo.framework && (
                          <span className={cn(
                            "text-xs font-medium",
                            getFrameworkColor(repo.framework)
                          )}>
                            {repo.framework}
                          </span>
                        )}
                        {repo.hasBackend && (
                          <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            Backend
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {repo.path}
                      </p>
                      {repo.version && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          v{repo.version}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current repository info */}
          {currentRepo && (
            <div className="p-3 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                Current: <span className="font-medium">{currentRepo.name}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { RepositoryPicker }
export default RepositoryPicker