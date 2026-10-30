import express from 'express'
import { spawn } from 'child_process'
import path from 'path'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'

const router = express.Router()

// Available Frigg CLI commands
const AVAILABLE_COMMANDS = [
    {
        name: 'init',
        description: 'Initialize a new Frigg project',
        usage: 'frigg init [project-name]',
        options: [
            { name: '--template', description: 'Template to use (serverless, express)' },
            { name: '--skip-install', description: 'Skip npm install' },
            { name: '--force', description: 'Overwrite existing directory' }
        ]
    },
    {
        name: 'create',
        description: 'Create a new integration module',
        usage: 'frigg create [integration-name]',
        options: [
            { name: '--template', description: 'Integration template to use' },
            { name: '--skip-config', description: 'Skip initial configuration' }
        ]
    },
    {
        name: 'install',
        description: 'Install an integration module',
        usage: 'frigg install [module-name]',
        options: [
            { name: '--version', description: 'Specific version to install' },
            { name: '--save-dev', description: 'Install as dev dependency' }
        ]
    },
    {
        name: 'start',
        description: 'Start the Frigg application',
        usage: 'frigg start',
        options: [
            { name: '--port', description: 'Port to run on' },
            { name: '--stage', description: 'Environment stage' },
            { name: '--verbose', description: 'Verbose logging' }
        ]
    },
    {
        name: 'build',
        description: 'Build the Frigg application',
        usage: 'frigg build',
        options: [
            { name: '--stage', description: 'Build for specific stage' },
            { name: '--optimize', description: 'Enable optimizations' }
        ]
    },
    {
        name: 'deploy',
        description: 'Deploy the Frigg application',
        usage: 'frigg deploy',
        options: [
            { name: '--stage', description: 'Deploy to specific stage' },
            { name: '--region', description: 'AWS region' },
            { name: '--dry-run', description: 'Preview deployment without executing' }
        ]
    },
    {
        name: 'ui',
        description: 'Launch the management UI',
        usage: 'frigg ui',
        options: [
            { name: '--port', description: 'UI port (default: 3001)' },
            { name: '--open', description: 'Auto-open browser' }
        ]
    }
]

/**
 * Get available CLI commands
 */
router.get('/commands', asyncHandler(async (req, res) => {
    res.json(createStandardResponse({
        commands: AVAILABLE_COMMANDS,
        friggPath: await getFriggPath()
    }))
}))

/**
 * Execute a CLI command
 */
router.post('/execute', asyncHandler(async (req, res) => {
    const { command, args = [], options = {} } = req.body

    if (!command) {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.INVALID_REQUEST, 'Command is required')
        )
    }

    // Validate command
    const validCommand = AVAILABLE_COMMANDS.find(cmd => cmd.name === command)
    if (!validCommand) {
        return res.status(400).json(
            createErrorResponse(ERROR_CODES.CLI_COMMAND_NOT_FOUND, `Unknown command: ${command}`)
        )
    }

    try {
        const result = await executeFriggCommand(command, args, options, req.app.get('io'))
        
        res.json(createStandardResponse({
            command,
            args,
            options,
            output: result.output,
            exitCode: result.exitCode,
            duration: result.duration
        }))

    } catch (error) {
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.CLI_COMMAND_FAILED, error.message, {
                command,
                args,
                options
            })
        )
    }
}))

/**
 * Get CLI command history
 */
router.get('/history', asyncHandler(async (req, res) => {
    // In a real implementation, this would read from a persistent history
    // For now, return empty array
    res.json(createStandardResponse({
        history: [],
        message: 'Command history not yet implemented'
    }))
}))

/**
 * Get Frigg CLI version and info
 */
router.get('/info', asyncHandler(async (req, res) => {
    try {
        const result = await executeFriggCommand('--version', [], {}, null)
        
        res.json(createStandardResponse({
            version: result.output.trim(),
            path: await getFriggPath(),
            nodeVersion: process.version,
            platform: process.platform
        }))

    } catch (error) {
        return res.status(500).json(
            createErrorResponse(ERROR_CODES.CLI_COMMAND_FAILED, 'Failed to get CLI info', {
                error: error.message
            })
        )
    }
}))

/**
 * Execute a Frigg CLI command
 */
async function executeFriggCommand(command, args = [], options = {}, io = null) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now()
        
        // Build command arguments
        const cmdArgs = [command, ...args]
        
        // Add options as flags
        Object.entries(options).forEach(([key, value]) => {
            if (value === true) {
                cmdArgs.push(`--${key}`)
            } else if (value !== false && value !== null && value !== undefined) {
                cmdArgs.push(`--${key}`, value.toString())
            }
        })

        let output = ''
        let errorOutput = ''

        // Try to find frigg command
        const friggCommand = process.platform === 'win32' ? 'frigg.cmd' : 'frigg'
        
        // Spawn the command
        const childProcess = spawn(friggCommand, cmdArgs, {
            cwd: process.cwd(),
            env: process.env,
            shell: true
        })

        // Capture stdout
        childProcess.stdout?.on('data', (data) => {
            const chunk = data.toString()
            output += chunk
            
            // Broadcast real-time output via WebSocket
            if (io) {
                io.emit('cli:output', {
                    type: 'stdout',
                    data: chunk,
                    command,
                    timestamp: new Date().toISOString()
                })
            }
        })

        // Capture stderr
        childProcess.stderr?.on('data', (data) => {
            const chunk = data.toString()
            errorOutput += chunk
            
            // Broadcast real-time output via WebSocket
            if (io) {
                io.emit('cli:output', {
                    type: 'stderr',
                    data: chunk,
                    command,
                    timestamp: new Date().toISOString()
                })
            }
        })

        // Handle process completion
        childProcess.on('close', (code) => {
            const duration = Date.now() - startTime
            
            // Broadcast completion via WebSocket
            if (io) {
                io.emit('cli:complete', {
                    command,
                    args,
                    options,
                    exitCode: code,
                    duration,
                    timestamp: new Date().toISOString()
                })
            }

            if (code === 0) {
                resolve({
                    output: output || errorOutput,
                    exitCode: code,
                    duration
                })
            } else {
                reject(new Error(`Command failed with exit code ${code}: ${errorOutput || output}`))
            }
        })

        // Handle process errors
        childProcess.on('error', (error) => {
            const duration = Date.now() - startTime
            
            // Broadcast error via WebSocket
            if (io) {
                io.emit('cli:error', {
                    command,
                    args,
                    options,
                    error: error.message,
                    duration,
                    timestamp: new Date().toISOString()
                })
            }

            reject(error)
        })

        // Set timeout for long-running commands (5 minutes)
        setTimeout(() => {
            if (!childProcess.killed) {
                childProcess.kill('SIGTERM')
                reject(new Error('Command timed out after 5 minutes'))
            }
        }, 5 * 60 * 1000)
    })
}

/**
 * Get the path to the Frigg CLI
 */
async function getFriggPath() {
    return new Promise((resolve) => {
        const which = process.platform === 'win32' ? 'where' : 'which'
        const friggCommand = process.platform === 'win32' ? 'frigg.cmd' : 'frigg'
        
        const childProcess = spawn(which, [friggCommand], { shell: true })
        
        let output = ''
        childProcess.stdout?.on('data', (data) => {
            output += data.toString()
        })
        
        childProcess.on('close', (code) => {
            if (code === 0) {
                resolve(output.trim().split('\n')[0])
            } else {
                resolve('frigg command not found in PATH')
            }
        })
        
        childProcess.on('error', () => {
            resolve('frigg command not found')
        })
    })
}

export default router