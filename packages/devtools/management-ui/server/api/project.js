import express from 'express'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'

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

export default router