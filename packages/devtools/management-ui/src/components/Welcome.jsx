import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFrigg } from '../hooks/useFrigg'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Plus, Code, ChevronRight, RefreshCw, ChevronDown, Rocket, Settings, Layers, GitBranch, Search, BookOpen } from 'lucide-react'
import { Button } from './ui/button'
// Using RefreshCw for loading spinner
import { Card } from './ui/card'
// Temporarily disable IntegrationExplorer to test basic functionality
// const IntegrationExplorer = React.lazy(() => import('./IntegrationExplorer'))
const openInIDE = async (repoPath) => {
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

const FalconLogo = ({ className, animate = false }) => (
  <motion.svg 
    viewBox="0 0 83.72 100" 
    className={className}
    animate={animate ? {
      scale: [1, 1.05, 1]
    } : {}}
    transition={{
      duration: 3,
      ease: "easeInOut",
      repeat: animate ? Infinity : 0,
      repeatDelay: 2
    }}
  >
    <defs>
      <style>{`.cls-1{fill:#575959;}.cls-1,.cls-2{fill-rule:evenodd;}.cls-2{fill:#71a087;}`}</style>
    </defs>
    <g>
      <path className="cls-2" d="M55.47,64.04c6.99-6.38,12.45-6.24,18.5,.64,2.62,3.87,.43,7.52-1.58,9.32-.02,.02-.03,.03-.05,.05l-2.02,1.71c2.06-3.99-1.7-4.53-3.13-3.6-.1,.07-.21,.14-.3,.23l-.03,.02-31.08,27.49c-.16,.14-.4,.12-.54-.04l-9.09-10.3c-.14-.16-.13-.4,.03-.54l29.29-24.99Z"/>
      <path className="cls-1" d="M83.43,8.57l.29-7.73c.04-1.09-.36-1.12-1.65-.05l-37.42,31.68,7.1,6.98,29.72-25.82c1.26-1.11,1.92-3.7,1.97-5.06h0Z"/>
      <path className="cls-2" d="M83.1,27.7l.29-7.73c.04-1.09-.36-1.12-1.65-.05l-26.93,22.8,7.16,6.68,19.16-16.64c1.26-1.11,1.92-3.7,1.97-5.06h0Z"/>
      <path className="cls-1" d="M83.25,46.68l.29-7.73c.04-1.09-.36-1.12-1.65-.05l-16.02,13.55,7.01,6.56,8.38-7.27c1.26-1.11,1.92-3.7,1.98-5.06h0Z"/>
      <path className="cls-2" d="M50.96,59.82L3.51,17.25C.72,14.75,.61,12.31,.73,9.61L1.06,1.46,58.48,53.26l-7.52,6.56Z"/>
      <path className="cls-1" d="M39.79,69.37L3.03,36.42c-1.47-1.33-1.92-5.47-1.85-6.98l.57-7.63L47.23,62.94l-7.44,6.43Z"/>
      <path className="cls-2" d="M27.6,80.1L2.74,56.36C1.02,54.72-.08,52.17,0,50.43l.5-8.69,34.92,31.54-7.82,6.82Z"/>
    </g>
  </motion.svg>
)

const loadingMessages = [
  "Scanning for local Frigg repositories...",
  "Checking installed integrations...",
  "Pinging npm for up-to-date API modules...",
  "Loading Frigg core plugins...",
  "Initializing management interface..."
]

export default function Welcome() {
  const navigate = useNavigate()
  const { repositories, isLoading, switchRepository, currentRepository } = useFrigg()
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [showContent, setShowContent] = useState(false)
  const [isChangingRepo, setIsChangingRepo] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeMode, setActiveMode] = useState('project') // 'project', 'explore', 'analyze'

  useEffect(() => {
    // Always show loading steps for better UX, even if data loads quickly
    const timer = setInterval(() => {
      setLoadingStep(prev => {
        if (prev >= loadingMessages.length - 1) {
          // Add a minimum delay to ensure loading feels substantial
          setTimeout(() => setShowContent(true), 800)
          return prev
        }
        return prev + 1
      })
    }, 600)
    return () => clearInterval(timer)
  }, [])

  // Always show the repository selection screen - never auto-navigate
  // User should explicitly choose their project

  const handleRepoSelect = async (repo) => {
    setSelectedRepo(repo)
    setShowDropdown(false)
    setIsChangingRepo(true)
    try {
      await switchRepository(repo.path)
      // Add a brief delay to show the selection, then navigate
      setTimeout(() => navigate('/dashboard'), 800)
    } catch (error) {
      console.error('Failed to switch repository:', error)
      setIsChangingRepo(false)
      setSelectedRepo(null)
    }
  }

  const handleCreateNew = () => {
    // Launch frigg init wizard
    window.open('/api/cli/init-wizard', '_blank')
  }

  const handleProceed = () => {
    if (selectedRepo) {
      handleRepoSelect(selectedRepo)
    }
  }


  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {!showContent ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-center"
          >
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ 
                rotate: 360,
                transition: { duration: 2, ease: "linear", repeat: Infinity }
              }}
              className="mb-8"
            >
              <FalconLogo className="w-24 h-24 mx-auto text-primary" />
            </motion.div>
            
            <div className="space-y-2">
              {loadingMessages.slice(0, loadingStep + 1).map((message, index) => (
                <motion.p
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="text-muted-foreground text-sm"
                >
                  {message}
                </motion.p>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl text-center"
          >
            {/* Welcome Header */}
            <div className="mb-12">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <FalconLogo className="w-20 h-20 mx-auto text-primary mb-6" animate />
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent"
              >
                Welcome to Frigg
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed"
              >
                Your local development interface for managing Frigg applications. 
                Create integrations, manage connections, and configure your APIs.
              </motion.p>
            </div>

            {/* Builder Assistant Section */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mb-8"
            >
              <h2 className="text-2xl font-semibold mb-6">Frigg Builder Assistant</h2>
              
              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <Card className="p-4 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50" onClick={() => setActiveMode('explore')}>
                  <div className="flex items-center gap-3">
                    <Search className="w-6 h-6 text-primary" />
                    <div>
                      <h3 className="font-semibold">Explore Integrations</h3>
                      <p className="text-sm text-muted-foreground">Browse available API modules</p>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-4 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50" onClick={() => setActiveMode('analyze')}>
                  <div className="flex items-center gap-3">
                    <Layers className="w-6 h-6 text-primary" />
                    <div>
                      <h3 className="font-semibold">Code Analysis</h3>
                      <p className="text-sm text-muted-foreground">Analyze project structure</p>
                    </div>
                  </div>
                </Card>
                
                <Card className="p-4 hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50" onClick={() => setActiveMode('project')}>
                  <div className="flex items-center gap-3">
                    <GitBranch className="w-6 h-6 text-primary" />
                    <div>
                      <h3 className="font-semibold">Project Selection</h3>
                      <p className="text-sm text-muted-foreground">Choose or create project</p>
                    </div>
                  </div>
                </Card>
              </div>
              
              {/* Mode-specific Content */}
              {activeMode === 'project' && (
                <>
                  <h3 className="text-xl font-semibold mb-4">Choose Your Project</h3>
                  {isLoading || isChangingRepo ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                      <span className="ml-3 text-lg">
                        {isChangingRepo ? 'Loading project...' : 'Discovering projects...'}
                      </span>
                    </div>
                  ) : repositories && repositories.length > 0 ? (
                <div className="space-y-6">
                  {/* Central Dropdown */}
                  <div className="relative">
                    <Card 
                      className={`p-6 cursor-pointer transition-all hover:shadow-lg border-2 ${
                        selectedRepo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <FolderOpen className="w-6 h-6 text-primary" />
                          <div className="text-left">
                            <h3 className="text-lg font-semibold">
                              {selectedRepo ? selectedRepo.name : 'Select a Frigg Project'}
                            </h3>
                            {selectedRepo && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedRepo.path}
                              </p>
                            )}
                            {!selectedRepo && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {repositories.length} project{repositories.length !== 1 ? 's' : ''} available
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${
                          showDropdown ? 'rotate-180' : ''
                        }`} />
                      </div>
                    </Card>

                    {/* Dropdown Options */}
                    <AnimatePresence>
                      {showDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          className="absolute top-full left-0 right-0 mt-2 z-50"
                        >
                          <Card className="border-2 border-border shadow-lg">
                            <div className="max-h-64 overflow-y-auto">
                              {repositories.map((repo, index) => (
                                <motion.div
                                  key={repo.path}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                  className={`p-4 cursor-pointer transition-colors hover:bg-primary/10 ${
                                    selectedRepo?.path === repo.path ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                                  } ${index !== repositories.length - 1 ? 'border-b border-border' : ''}`}
                                  onClick={() => setSelectedRepo(repo)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <FolderOpen className="w-5 h-5 text-muted-foreground" />
                                      <div>
                                        <h4 className="font-medium">{repo.name}</h4>
                                        <p className="text-sm text-muted-foreground">{repo.path}</p>
                                        {repo.framework && repo.framework !== 'Unknown' && (
                                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded mt-1 inline-block">
                                            {repo.framework}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          openInIDE(repo.path)
                                        }}
                                      >
                                        <Code className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </motion.div>
                              ))}
                            </div>
                          </Card>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-4 justify-center pt-4">
                    <Button 
                      onClick={handleProceed}
                      disabled={!selectedRepo}
                      size="lg" 
                      className="gap-2 px-8"
                    >
                      <Rocket className="w-5 h-5" />
                      Launch Project
                    </Button>
                    
                    <Button 
                      onClick={handleCreateNew} 
                      variant="outline" 
                      size="lg" 
                      className="gap-2 px-6"
                    >
                      <Plus className="w-5 h-5" />
                      Create New
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FolderOpen className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Frigg Projects Found</h3>
                  <p className="text-muted-foreground mb-6">
                    No Frigg applications found in your local environment.
                  </p>
                  <Button onClick={handleCreateNew} size="lg" className="gap-2">
                    <Plus className="w-5 h-5" />
                    Create Your First Frigg Application
                  </Button>
                </div>
              )}
                </>
              )}
              
              {/* Integration Explorer Mode */}
              {activeMode === 'explore' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold mb-4">Integration Explorer</h3>
                  <Card className="p-6">
                    <div className="text-center py-8">
                      <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h4 className="font-semibold mb-2">Integration Explorer</h4>
                      <p className="text-muted-foreground mb-4">
                        Browse and explore available integrations
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Integration Explorer coming soon...
                      </p>
                    </div>
                  </Card>
                </div>
              )}
              
              {/* Code Analysis Mode */}
              {activeMode === 'analyze' && (
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold mb-4">Project Code Analysis</h3>
                  <Card className="p-6">
                    <div className="text-center py-8">
                      <Layers className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h4 className="font-semibold mb-2">Static Code Analysis</h4>
                      <p className="text-muted-foreground mb-4">
                        Select a project to analyze its integration structure and dependencies
                      </p>
                      <Button 
                        onClick={() => setActiveMode('project')}
                        variant="outline"
                      >
                        <GitBranch className="w-4 h-4 mr-2" />
                        Choose Project First
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
            </motion.div>

            {/* Footer */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-center text-sm text-muted-foreground border-t border-border pt-6"
            >
              <p>All features are available via CLI and directly in code.</p>
              <p>This UI is here to help you use those tools more efficiently.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}