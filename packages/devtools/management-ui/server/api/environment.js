import express from 'express'
import path from 'path'
import fs from 'fs-extra'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'
import { wsHandler } from '../websocket/handler.js'

const router = express.Router();

// Helper to get .env file path
async function getEnvFilePath() {
    const possiblePaths = [
        path.join(process.cwd(), '../../../backend/.env'),
        path.join(process.cwd(), '../../backend/.env'),
        path.join(process.cwd(), 'backend/.env'),
        path.join(process.cwd(), '.env')
    ];

    for (const envPath of possiblePaths) {
        if (await fs.pathExists(envPath)) {
            return envPath;
        }
    }

    // If no .env exists, create one in the most likely location
    const defaultPath = possiblePaths[0];
    await fs.ensureFile(defaultPath);
    return defaultPath;
}

// Parse .env file content
function parseEnvFile(content) {
    const lines = content.split('\n');
    const variables = [];
    
    lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        
        // Skip empty lines and comments
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            return;
        }
        
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex > 0) {
            const key = trimmedLine.substring(0, equalIndex).trim();
            const value = trimmedLine.substring(equalIndex + 1).trim();
            
            variables.push({
                key,
                value: value.replace(/^["']|["']$/g, ''), // Remove quotes
                line: index + 1
            });
        }
    });
    
    return variables;
}

// Build .env file content from variables
function buildEnvContent(variables) {
    return variables
        .map(({ key, value }) => {
            // Add quotes if value contains spaces or special characters
            if (value && (value.includes(' ') || value.includes('#'))) {
                return `${key}="${value}"`;
            }
            return `${key}=${value}`;
        })
        .join('\n');
}

// Get all environment variables
router.get('/', async (req, res) => {
    try {
        const envPath = await getEnvFilePath();
        const content = await fs.readFile(envPath, 'utf8');
        const variables = parseEnvFile(content);
        
        // Mask sensitive values
        const maskedVariables = variables.map(variable => {
            const isSensitive = [
                'KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'API', 'PRIVATE'
            ].some(keyword => variable.key.toUpperCase().includes(keyword));
            
            return {
                ...variable,
                value: isSensitive ? '***' : variable.value,
                masked: isSensitive
            };
        });
        
        res.json({
            variables: maskedVariables,
            path: envPath
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to read environment variables'
        });
    }
});

// Get specific environment variable
router.get('/:key', async (req, res) => {
    const { key } = req.params;
    
    try {
        const envPath = await getEnvFilePath();
        const content = await fs.readFile(envPath, 'utf8');
        const variables = parseEnvFile(content);
        
        const variable = variables.find(v => v.key === key);
        
        if (!variable) {
            return res.status(404).json({
                error: `Environment variable ${key} not found`
            });
        }
        
        // Check if it's sensitive
        const isSensitive = [
            'KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'API', 'PRIVATE'
        ].some(keyword => key.toUpperCase().includes(keyword));
        
        res.json({
            key: variable.key,
            value: isSensitive ? '***' : variable.value,
            masked: isSensitive
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to read environment variable'
        });
    }
});

// Set environment variable
router.post('/', async (req, res) => {
    const { key, value } = req.body;
    
    if (!key) {
        return res.status(400).json({
            error: 'Key is required'
        });
    }
    
    try {
        const envPath = await getEnvFilePath();
        const content = await fs.readFile(envPath, 'utf8');
        const variables = parseEnvFile(content);
        
        // Check if variable exists
        const existingIndex = variables.findIndex(v => v.key === key);
        
        if (existingIndex >= 0) {
            variables[existingIndex].value = value;
        } else {
            variables.push({ key, value });
        }
        
        // Write back to file
        const newContent = buildEnvContent(variables);
        await fs.writeFile(envPath, newContent);
        
        // Broadcast update
        wsHandler.broadcast('env-update', {
            action: existingIndex >= 0 ? 'updated' : 'created',
            key,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: `Environment variable ${key} ${existingIndex >= 0 ? 'updated' : 'created'}`,
            key,
            value: value.includes('SECRET') || value.includes('KEY') ? '***' : value
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to set environment variable'
        });
    }
});

// Update multiple environment variables
router.put('/batch', async (req, res) => {
    const { variables } = req.body;
    
    if (!Array.isArray(variables)) {
        return res.status(400).json({
            error: 'Variables must be an array'
        });
    }
    
    try {
        const envPath = await getEnvFilePath();
        const content = await fs.readFile(envPath, 'utf8');
        const existingVariables = parseEnvFile(content);
        
        // Update or add variables
        variables.forEach(({ key, value }) => {
            const existingIndex = existingVariables.findIndex(v => v.key === key);
            
            if (existingIndex >= 0) {
                existingVariables[existingIndex].value = value;
            } else {
                existingVariables.push({ key, value });
            }
        });
        
        // Write back to file
        const newContent = buildEnvContent(existingVariables);
        await fs.writeFile(envPath, newContent);
        
        // Broadcast update
        wsHandler.broadcast('env-update', {
            action: 'batch-update',
            count: variables.length,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: `Updated ${variables.length} environment variables`,
            updated: variables.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to update environment variables'
        });
    }
});

// Delete environment variable
router.delete('/:key', async (req, res) => {
    const { key } = req.params;
    
    try {
        const envPath = await getEnvFilePath();
        const content = await fs.readFile(envPath, 'utf8');
        const variables = parseEnvFile(content);
        
        const filteredVariables = variables.filter(v => v.key !== key);
        
        if (filteredVariables.length === variables.length) {
            return res.status(404).json({
                error: `Environment variable ${key} not found`
            });
        }
        
        // Write back to file
        const newContent = buildEnvContent(filteredVariables);
        await fs.writeFile(envPath, newContent);
        
        // Broadcast update
        wsHandler.broadcast('env-update', {
            action: 'deleted',
            key,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: `Environment variable ${key} deleted`
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to delete environment variable'
        });
    }
});

// Validate environment variables
router.post('/validate', async (req, res) => {
    try {
        const envPath = await getEnvFilePath();
        const content = await fs.readFile(envPath, 'utf8');
        const variables = parseEnvFile(content);
        
        const issues = [];
        
        // Check for required variables
        const requiredVars = [
            'DATABASE_URL',
            'JWT_SECRET',
            'NODE_ENV'
        ];
        
        requiredVars.forEach(reqVar => {
            if (!variables.find(v => v.key === reqVar)) {
                issues.push({
                    type: 'missing',
                    key: reqVar,
                    message: `Required variable ${reqVar} is missing`
                });
            }
        });
        
        // Check for empty values
        variables.forEach(variable => {
            if (!variable.value || variable.value.trim() === '') {
                issues.push({
                    type: 'empty',
                    key: variable.key,
                    message: `Variable ${variable.key} has an empty value`
                });
            }
        });
        
        res.json({
            valid: issues.length === 0,
            issues,
            totalVariables: variables.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to validate environment variables'
        });
    }
});

export default router