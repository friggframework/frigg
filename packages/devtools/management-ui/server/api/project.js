import express from 'express'
import fs from 'fs/promises'
import path from 'path'
// import { analyzeIntegrations } from '../../../frigg-cli/utils/integration-analyzer.js'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'
import { fileURLToPath } from 'url'
import { promisify } from 'util'
import { spawn, exec } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const execAsync = promisify(exec)
const router = express.Router()

// Track project process state
let projectProcess = null
let projectStatus = 'stopped'
let projectLogs = []
let projectStartTime = null
const MAX_LOGS = 1000

/**
 * Get current project status and configuration
 */
router.get('/status', asyncHandler(async (req, res) => {
    const cwd = process.cwd()
    let projectInfo = {
        name: 'unknown',
        version: '0.0.0',
        friggVersion: 'unknown'
    }

    try {
        // Try to read package.json for project info
        const packageJsonPath = path.join(cwd, 'package.json')
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
        
        projectInfo = {
            name: packageJson.name || 'frigg-project',
            version: packageJson.version || '0.0.0',
            friggVersion: packageJson.dependencies?.['@friggframework/core'] || 
                         packageJson.devDependencies?.['@friggframework/core'] || 'unknown'
        }
    } catch (error) {
        console.warn('Could not read package.json:', error.message)
    }

    const statusData = {
        ...projectInfo,
        status: projectStatus,
        pid: projectProcess?.pid || null,
        uptime: projectStartTime ? Math.floor((Date.now() - projectStartTime) / 1000) : 0,
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development',
        lastStarted: projectStartTime ? new Date(projectStartTime).toISOString() : null
    }

    res.json(createStandardResponse(statusData))
}))

/**
 * Start the Frigg project
 */
router.post('/start', asyncHandler(async (req, res) => {
    if (projectProcess && projectStatus === 'running') {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.PROJECT_ALREADY_RUNNING, 'Project is already running')
        )
    }

    const { stage = 'dev', verbose = false, port = 3000 } = req.body

    try {
        projectStatus = 'starting'
        projectLogs = []
        
        // Broadcast status update via WebSocket
        const io = req.app.get('io')
        if (io) {
            io.emit('project:status', { 
                status: 'starting',
                message: 'Starting Frigg project...'
            })
        }

        // Find the project directory (current working directory)
        const projectPath = process.cwd()
        
        // Build command arguments
        const args = ['run', 'start']
        if (stage !== 'dev') {
            args.push('--', '--stage', stage)
        }
        if (verbose) {
            args.push('--', '--verbose')
        }

        // Set environment variables
        const env = {
            ...process.env,
            NODE_ENV: stage === 'production' ? 'production' : 'development',
            PORT: port.toString()
        }

        // Start the project process
        projectProcess = spawn('npm', args, {
            cwd: projectPath,
            env,
            shell: true,
            detached: false
        })

        projectStartTime = Date.now()

        // Handle stdout
        projectProcess.stdout?.on('data', (data) => {
            const log = {
                type: 'stdout',
                message: data.toString(),
                timestamp: new Date().toISOString()
            }
            projectLogs.push(log)
            if (projectLogs.length > MAX_LOGS) {
                projectLogs.shift()
            }
            
            // Broadcast log via WebSocket
            if (io) {
                io.emit('project:logs', log)
            }
        })

        // Handle stderr
        projectProcess.stderr?.on('data', (data) => {
            const log = {
                type: 'stderr',
                message: data.toString(),
                timestamp: new Date().toISOString()
            }
            projectLogs.push(log)
            if (projectLogs.length > MAX_LOGS) {
                projectLogs.shift()
            }
            
            // Broadcast log via WebSocket
            if (io) {
                io.emit('project:logs', log)
            }
        })

        // Handle process exit
        projectProcess.on('exit', (code, signal) => {
            const wasRunning = projectStatus === 'running'
            projectStatus = 'stopped'
            projectProcess = null
            projectStartTime = null
            
            const statusUpdate = {
                status: 'stopped',
                code,
                signal,
                message: `Project process exited with code ${code}`
            }
            
            if (io) {
                io.emit('project:status', statusUpdate)
                if (wasRunning) {
                    io.emit('project:error', {
                        message: 'Project stopped unexpectedly',
                        code,
                        signal
                    })
                }
            }
        })

        // Handle process errors
        projectProcess.on('error', (error) => {
            projectStatus = 'stopped'
            projectProcess = null
            projectStartTime = null
            
            if (io) {
                io.emit('project:error', {
                    message: 'Failed to start project',
                    error: error.message
                })
            }
        })

        // Wait for process to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000))

        if (projectProcess && !projectProcess.killed) {
            projectStatus = 'running'
            
            if (io) {
                io.emit('project:status', {
                    status: 'running',
                    message: 'Project started successfully',
                    pid: projectProcess.pid
                })
            }

            res.json(createStandardResponse({
                message: 'Project started successfully',
                pid: projectProcess.pid,
                status: 'running'
            }))
        } else {
            throw new Error('Failed to start project process')
        }

    } catch (error) {
        projectStatus = 'stopped'
        projectProcess = null
        projectStartTime = null
        
        const io = req.app.get('io')
        if (io) {
            io.emit('project:status', { status: 'stopped' })
            io.emit('project:error', { message: error.message })
        }
        
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.PROJECT_START_FAILED, error.message)
        )
    }
}))

/**
 * Stop the Frigg project
 */
router.post('/stop', asyncHandler(async (req, res) => {
    if (!projectProcess || projectStatus !== 'running') {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.PROJECT_NOT_RUNNING, 'Project is not running')
        )
    }

    try {
        projectStatus = 'stopping'
        
        const io = req.app.get('io')
        if (io) {
            io.emit('project:status', {
                status: 'stopping',
                message: 'Stopping project...'
            })
        }

        // Gracefully terminate the process
        projectProcess.kill('SIGTERM')

        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (projectProcess && !projectProcess.killed) {
                projectProcess.kill('SIGKILL')
            }
        }, 5000)

        res.json(createStandardResponse({
            message: 'Project is stopping',
            status: 'stopping'
        }))

    } catch (error) {
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.PROJECT_STOP_FAILED, error.message)
        )
    }
}))

/**
 * Restart the Frigg project
 */
router.post('/restart', asyncHandler(async (req, res) => {
    try {
        // Stop if running
        if (projectProcess && projectStatus === 'running') {
            projectProcess.kill('SIGTERM')
            
            // Wait for process to exit
            await new Promise((resolve) => {
                if (projectProcess) {
                    projectProcess.on('exit', resolve)
                } else {
                    resolve()
                }
            })
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Start again - we'll simulate calling the start endpoint
        const startResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/project/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        })

        const result = await startResponse.json()
        res.json(result)

    } catch (error) {
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.PROJECT_START_FAILED, error.message)
        )
    }
}))

/**
 * Get project logs
 */
router.get('/logs', asyncHandler(async (req, res) => {
    const { limit = 100, type } = req.query
    
    let logs = projectLogs
    
    if (type && ['stdout', 'stderr'].includes(type)) {
        logs = logs.filter(log => log.type === type)
    }
    
    res.json(createStandardResponse({
        logs: logs.slice(-parseInt(limit)),
        total: logs.length
    }))
}))

/**
 * Clear project logs
 */
router.delete('/logs', asyncHandler(async (req, res) => {
    projectLogs = []
    res.json(createStandardResponse({ message: 'Logs cleared' }))
}))

/**
 * Get project metrics
 */
router.get('/metrics', asyncHandler(async (req, res) => {
    const metrics = {
        status: projectStatus,
        uptime: projectStartTime ? Math.floor((Date.now() - projectStartTime) / 1000) : 0,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        logs: {
            total: projectLogs.length,
            errors: projectLogs.filter(log => log.type === 'stderr').length,
            warnings: projectLogs.filter(log => log.message.toLowerCase().includes('warning')).length
        }
    }
    
    res.json(createStandardResponse(metrics))
}))

/**
 * Get available Frigg repositories
 */
router.get('/repositories', asyncHandler(async (req, res) => {
    try {
        let repositories = []
        
        // First, check if we have available repositories from the CLI
        if (process.env.AVAILABLE_REPOSITORIES) {
            try {
                repositories = JSON.parse(process.env.AVAILABLE_REPOSITORIES)
                console.log(`Using ${repositories.length} repositories from CLI discovery`)
            } catch (parseError) {
                console.error('Failed to parse AVAILABLE_REPOSITORIES:', parseError)
            }
        }
        
        // If no repositories from CLI, fall back to direct discovery
        if (repositories.length === 0) {
            console.log('No repositories from CLI, executing discovery command...')
            // Execute the frigg CLI command directly
            const friggPath = path.join(__dirname, '../../../frigg-cli/index.js')
            const command = `node "${friggPath}" repos list --json`
            console.log('Executing command:', command)
            console.log('From directory:', process.cwd())
            
            const { stdout, stderr } = await execAsync(command, {
                cwd: process.cwd(),
                env: process.env,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer for large repo lists
            })
            
            console.log('Command stdout length:', stdout.length)
            console.log('Command stderr:', stderr)
            
            if (stderr && !stderr.includes('DeprecationWarning') && !stderr.includes('NOTE: The AWS SDK')) {
                console.error('Repository discovery stderr:', stderr)
            }
            
            // Parse the JSON output
            try {
                // With the --json flag, we should get clean JSON output
                repositories = JSON.parse(stdout)
                console.log(`Found ${repositories.length} repositories via command`)
            } catch (parseError) {
                console.error('Failed to parse repository JSON:', parseError)
                console.log('Raw output (first 500 chars):', stdout.substring(0, 500))
            }
        }
        
        // Get current repository info
        const currentRepo = process.env.REPOSITORY_INFO ? 
            JSON.parse(process.env.REPOSITORY_INFO) : 
            await getCurrentRepositoryInfo()
        
        res.json(createStandardResponse({
            repositories,
            currentRepository: currentRepo,
            isMultiRepo: currentRepo?.isMultiRepo || false
        }))
    } catch (error) {
        console.error('Failed to get repositories:', error)
        res.json(createStandardResponse({
            repositories: [],
            currentRepository: null,
            isMultiRepo: false,
            error: 'Failed to discover repositories: ' + error.message
        }))
    }
}))

/**
 * Switch to a different repository
 */
router.post('/switch-repository', asyncHandler(async (req, res) => {
    const { repositoryPath } = req.body
    
    if (!repositoryPath) {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Repository path is required')
        )
    }
    
    try {
        // Verify the repository exists and is valid
        const stats = await fs.stat(repositoryPath)
        if (!stats.isDirectory()) {
            throw new Error('Invalid repository path')
        }
        
        // Check if it's a valid Frigg repository
        const packageJsonPath = path.join(repositoryPath, 'package.json')
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
        
        // Update environment variable
        process.env.PROJECT_ROOT = repositoryPath
        process.env.REPOSITORY_INFO = JSON.stringify({
            name: packageJson.name || path.basename(repositoryPath),
            path: repositoryPath,
            version: packageJson.version
        })
        
        // Stop any running processes
        if (projectProcess && projectStatus === 'running') {
            projectProcess.kill('SIGTERM')
            projectStatus = 'stopped'
            projectProcess = null
        }
        
        // Notify via WebSocket
        const io = req.app.get('io')
        if (io) {
            io.emit('repository:switched', {
                repository: {
                    name: packageJson.name,
                    path: repositoryPath,
                    version: packageJson.version
                }
            })
        }
        
        res.json(createStandardResponse({
            message: 'Repository switched successfully',
            repository: {
                name: packageJson.name,
                path: repositoryPath,
                version: packageJson.version
            }
        }))
    } catch (error) {
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to switch repository: ' + error.message)
        )
    }
}))

/**
 * Get current repository information
 */
async function getCurrentRepositoryInfo() {
    try {
        const cwd = process.env.PROJECT_ROOT || process.cwd()
        const packageJsonPath = path.join(cwd, 'package.json')
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
        
        return {
            name: packageJson.name || path.basename(cwd),
            path: cwd,
            version: packageJson.version,
            framework: detectFramework(packageJson),
            hasBackend: await fs.access(path.join(cwd, 'backend')).then(() => true).catch(() => false)
        }
    } catch (error) {
        return null
    }
}

/**
 * Detect framework from package.json
 */
function detectFramework(packageJson) {
    const deps = { 
        ...packageJson.dependencies, 
        ...packageJson.devDependencies 
    }
    
    if (deps.react) return 'React'
    if (deps.vue) return 'Vue'
    if (deps.svelte) return 'Svelte'
    if (deps['@angular/core']) return 'Angular'

    return 'Unknown'
}

/**
 * Analyze project integrations
 */
router.get('/analyze-integrations', asyncHandler(async (req, res) => {
    try {
        const projectPath = process.env.PROJECT_ROOT || process.cwd()
        // const analysis = await analyzeIntegrations(projectPath)
        const analysis = { integrations: [], patterns: [], recommendations: [] }
        
        res.json(createStandardResponse({
            analysis,
            projectPath,
            timestamp: new Date().toISOString()
        }))
    } catch (error) {
        console.error('Integration analysis failed:', error)
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.INTERNAL_ERROR, 'Failed to analyze integrations: ' + error.message)
        )
    }
}))
export default router