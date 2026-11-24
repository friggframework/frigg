import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { wsHandler } from '../websocket/handler.js';

const router = express.Router();

// Track backend process
let backendProcess = null;
let backendStatus = 'stopped';
let backendLogs = [];
const MAX_LOGS = 1000;

// Helper function to find the backend directory
async function findBackendDirectory() {
    const cwd = process.cwd();
    const possiblePaths = [
        path.join(cwd, 'backend'),
        path.join(cwd, '../../../backend'),
        path.join(cwd, '../../backend'),
        path.join(process.env.HOME || '', 'frigg', 'backend')
    ];

    for (const backendPath of possiblePaths) {
        if (await fs.pathExists(backendPath)) {
            return backendPath;
        }
    }

    throw new Error('Backend directory not found');
}

// Get backend status
router.get('/status', (req, res) => {
    res.json({
        status: backendStatus,
        pid: backendProcess ? backendProcess.pid : null,
        uptime: backendProcess ? process.uptime() : 0,
        logs: backendLogs.slice(-100) // Return last 100 logs
    });
});

// Start backend
router.post('/start', async (req, res) => {
    if (backendProcess && backendStatus === 'running') {
        return res.status(400).json({
            error: 'Backend is already running'
        });
    }

    try {
        const backendPath = await findBackendDirectory();
        const { stage = 'dev', verbose = false } = req.body;

        // Clear previous logs
        backendLogs = [];
        backendStatus = 'starting';

        // Broadcast status update
        wsHandler.broadcast('backend-status', {
            status: 'starting',
            message: 'Starting Frigg backend...'
        });

        // Start the backend process
        const args = ['run', 'start'];
        if (stage !== 'dev') {
            args.push('--stage', stage);
        }
        if (verbose) {
            args.push('--verbose');
        }

        backendProcess = spawn('npm', args, {
            cwd: backendPath,
            env: { ...process.env, NODE_ENV: stage === 'production' ? 'production' : 'development' },
            shell: true
        });

        // Handle stdout
        backendProcess.stdout.on('data', (data) => {
            const log = {
                type: 'stdout',
                message: data.toString(),
                timestamp: new Date().toISOString()
            };
            backendLogs.push(log);
            if (backendLogs.length > MAX_LOGS) {
                backendLogs.shift();
            }
            wsHandler.broadcast('backend-log', log);
        });

        // Handle stderr
        backendProcess.stderr.on('data', (data) => {
            const log = {
                type: 'stderr',
                message: data.toString(),
                timestamp: new Date().toISOString()
            };
            backendLogs.push(log);
            if (backendLogs.length > MAX_LOGS) {
                backendLogs.shift();
            }
            wsHandler.broadcast('backend-log', log);
        });

        // Handle process exit
        backendProcess.on('exit', (code, signal) => {
            backendStatus = 'stopped';
            backendProcess = null;
            
            const message = {
                status: 'stopped',
                code,
                signal,
                message: `Backend process exited with code ${code}`
            };
            
            wsHandler.broadcast('backend-status', message);
        });

        // Wait a bit to ensure process started
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (backendProcess && !backendProcess.killed) {
            backendStatus = 'running';
            wsHandler.broadcast('backend-status', {
                status: 'running',
                message: 'Backend started successfully'
            });

            res.json({
                status: 'success',
                message: 'Backend started',
                pid: backendProcess.pid
            });
        } else {
            throw new Error('Failed to start backend process');
        }

    } catch (error) {
        backendStatus = 'stopped';
        res.status(500).json({
            error: error.message,
            details: 'Failed to start backend'
        });
    }
});

// Stop backend
router.post('/stop', (req, res) => {
    if (!backendProcess || backendStatus !== 'running') {
        return res.status(400).json({
            error: 'Backend is not running'
        });
    }

    try {
        backendStatus = 'stopping';
        wsHandler.broadcast('backend-status', {
            status: 'stopping',
            message: 'Stopping Frigg backend...'
        });

        // Kill the process group
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', backendProcess.pid, '/T', '/F']);
        } else {
            process.kill(-backendProcess.pid, 'SIGTERM');
        }

        // Give it time to shut down gracefully
        setTimeout(() => {
            if (backendProcess && !backendProcess.killed) {
                backendProcess.kill('SIGKILL');
            }
        }, 5000);

        res.json({
            status: 'success',
            message: 'Backend stopping'
        });

    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to stop backend'
        });
    }
});

// Restart backend
router.post('/restart', async (req, res) => {
    try {
        // Stop if running
        if (backendProcess && backendStatus === 'running') {
            await new Promise((resolve) => {
                backendProcess.on('exit', resolve);
                
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', backendProcess.pid, '/T', '/F']);
                } else {
                    process.kill(-backendProcess.pid, 'SIGTERM');
                }
            });
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Start again
        const response = await fetch('http://localhost:3001/api/backend/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const result = await response.json();
        res.json(result);

    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to restart backend'
        });
    }
});

// Get logs
router.get('/logs', (req, res) => {
    const { limit = 100, type } = req.query;
    
    let logs = backendLogs;
    
    if (type && ['stdout', 'stderr'].includes(type)) {
        logs = logs.filter(log => log.type === type);
    }
    
    res.json({
        logs: logs.slice(-parseInt(limit)),
        total: logs.length
    });
});

// Clear logs
router.delete('/logs', (req, res) => {
    backendLogs = [];
    res.json({
        status: 'success',
        message: 'Logs cleared'
    });
});

export default router;