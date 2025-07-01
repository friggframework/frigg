import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFrigg } from '../hooks/useFrigg'
import { motion, AnimatePresence } from 'framer-motion'
import { FolderOpen, Plus, Code, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
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
    viewBox="0 0 24 24" 
    className={className}
    animate={animate ? {
      rotate: [0, 360],
      scale: [1, 1.1, 1]
    } : {}}
    transition={{
      duration: 2,
      ease: "easeInOut",
      times: [0, 0.5, 1],
      repeat: animate ? Infinity : 0,
      repeatDelay: 3
    }}
  >
    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.3"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" fill="none"/>
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

  useEffect(() => {
    if (!isLoading && loadingStep < loadingMessages.length) {
      const timer = setInterval(() => {
        setLoadingStep(prev => {
          if (prev >= loadingMessages.length - 1) {
            setShowContent(true)
            return prev
          }
          return prev + 1
        })
      }, 600)
      return () => clearInterval(timer)
    }
  }, [isLoading, loadingStep])

  useEffect(() => {
    if (currentRepository && !isLoading) {
      // If we already have a repository selected, go to dashboard
      navigate('/dashboard')
    }
  }, [currentRepository, isLoading, navigate])

  const handleRepoSelect = async (repo) => {
    setSelectedRepo(repo)
    setIsChangingRepo(true)
    try {
      await switchRepository(repo.path)
      navigate('/dashboard')
    } catch (error) {
      console.error('Failed to switch repository:', error)
      setIsChangingRepo(false)
    }
  }

  const handleCreateNew = () => {
    // TODO: Implement create new Frigg app flow
    console.log('Create new Frigg app')
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
            className="w-full max-w-4xl"
          >
            <div className="text-center mb-8">
              <FalconLogo className="w-16 h-16 mx-auto text-primary mb-4" animate />
              <h1 className="text-4xl font-bold mb-4">Welcome to Frigg Management UI</h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Your local development interface for managing Frigg applications. 
                Create integrations, manage connections, and configure your APIs - 
                all through an intuitive interface or directly via CLI and code.
              </p>
            </div>

            <Card className="p-6 mb-6">
              <h2 className="text-2xl font-semibold mb-4">Select Your Frigg Application</h2>
              <p className="text-muted-foreground mb-6">
                Choose an existing Frigg application to manage, or create a new one to get started.
              </p>

              {isLoading || isChangingRepo ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : repositories && repositories.length > 0 ? (
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {repositories.map((repo, index) => (
                    <motion.div
                      key={repo.path}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card
                        className={`p-4 cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
                          selectedRepo?.path === repo.path ? 'border-primary shadow-lg' : ''
                        }`}
                        onClick={() => handleRepoSelect(repo)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FolderOpen className="w-5 h-5 text-muted-foreground" />
                            <div>
                              <h3 className="font-semibold">{repo.name}</h3>
                              <p className="text-sm text-muted-foreground">{repo.path}</p>
                              {repo.detectionReasons && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {repo.detectionReasons.join(' • ')}
                                </p>
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
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No Frigg applications found in your local environment.</p>
                  <p className="mt-2">Create a new one to get started!</p>
                </div>
              )}

              <div className="mt-6 flex justify-center">
                <Button onClick={handleCreateNew} size="lg" className="gap-2">
                  <Plus className="w-5 h-5" />
                  Create New Frigg Application
                </Button>
              </div>
            </Card>

            <div className="text-center text-sm text-muted-foreground">
              <p>All features are available via CLI and directly in code.</p>
              <p>This UI is here to help you use those tools more efficiently.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}