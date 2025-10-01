import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, Check, Search, Folder, GitBranch, Code, ExternalLink } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useFrigg } from '../../hooks/useFrigg'

const RepositoryPicker = ({ currentRepo, onRepoChange }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const { repositories, fetchRepositories, switchRepository } = useFrigg()

  // Remove duplicate fetch - repositories are already loaded by useFrigg hook
  // useEffect(() => {
  //   fetchRepositories()
  // }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRefreshRepositories = async () => {
    setLoading(true)
    try {
      await fetchRepositories()
    } catch (error) {
      console.error('Failed to refresh repositories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRepoSelect = async (repo) => {
    try {
      // Use repo.id (deterministic ID) or fallback to path
      await switchRepository(repo.id || repo.path)
      onRepoChange(repo)
      setIsOpen(false)
      // State update should trigger re-render without page reload
    } catch (error) {
      console.error('Failed to switch repository:', error)
    }
  }

  const openInIDE = async (repoPath, e) => {
    e.stopPropagation() // Prevent repository selection
    try {
      const response = await fetch('/api/open-in-ide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath })
      })
      if (!response.ok) {
        throw new Error('Failed to open in IDE')
      }
    } catch (error) {
      console.error('Failed to open in IDE:', error)
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
      <div className="flex items-center gap-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md min-w-[300px]",
            "bg-background border border-border hover:bg-accent",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            "transition-colors duration-150"
          )}
        >
          <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-foreground font-medium">
              {currentRepo?.name || 'Select Repository'}
            </div>
            {currentRepo?.path && (
              <div className="truncate text-xs text-muted-foreground">
                {currentRepo.path}
              </div>
            )}
          </div>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 flex-shrink-0",
            isOpen && "transform rotate-180"
          )} />
        </button>
      </div>

      {isOpen && (
        <div className={cn(
          "absolute z-50 mt-2 w-96 rounded-md shadow-lg",
          "bg-popover border border-border",
          "max-h-96 overflow-hidden flex flex-col"
        )}>
          {/* Search bar */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
              />
            </div>
          </div>

          {/* Repository list */}
          <div className="overflow-y-auto max-h-80">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">
                Loading repositories...
              </div>
            ) : filteredRepos.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                No repositories found
              </div>
            ) : (
              <div className="py-1">
                {filteredRepos.map((repo) => (
                  <div
                    key={repo.path}
                    className={cn(
                      "w-full px-4 py-3 text-left hover:bg-accent/50",
                      "flex items-start gap-3 group",
                      currentRepo?.path === repo.path && "bg-accent"
                    )}
                  >
                    <button
                      onClick={() => handleRepoSelect(repo)}
                      className="flex items-start gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {currentRepo?.path === repo.path ? (
                          <Check className="h-4 w-4 text-primary" />
                        ) : (
                          <GitBranch className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
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
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              Backend
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {repo.path}
                        </p>
                        {repo.version && (
                          <p className="text-xs text-muted-foreground/80 mt-0.5">
                            v{repo.version}
                          </p>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={(e) => openInIDE(repo.path, e)}
                      title="Open in IDE"
                      className={cn(
                        "flex-shrink-0 p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent",
                        "rounded transition-colors duration-150",
                        "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      <Code className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current repository info */}
          {currentRepo && (
            <div className="p-3 bg-muted/50 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Current: <span className="font-medium text-foreground">{currentRepo.name}</span>
                </p>
                <button
                  onClick={(e) => openInIDE(currentRepo.path, e)}
                  title="Open current repo in IDE"
                  className={cn(
                    "p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent",
                    "rounded transition-colors duration-150"
                  )}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { RepositoryPicker }
export default RepositoryPicker