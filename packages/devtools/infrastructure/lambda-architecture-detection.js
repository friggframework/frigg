/**
 * Lambda Architecture Detection Utilities
 * 
 * This module provides utilities to detect and work with Lambda architecture
 * both at deployment time (for Serverless Framework) and at runtime (in Lambda)
 */

/**
 * Detect Lambda architecture at runtime
 * This can be called from within a Lambda function to determine its architecture
 * 
 * @returns {string} 'x86_64' or 'arm64'
 */
function detectRuntimeArchitecture() {
    // Method 1: Check process.arch (Node.js built-in)
    // Maps Node.js arch values to Lambda architecture names
    const archMap = {
        'x64': 'x86_64',
        'x86_64': 'x86_64',
        'arm64': 'arm64',
        'arm': 'arm64'
    };
    
    if (archMap[process.arch]) {
        console.log(`Detected architecture from process.arch: ${process.arch} -> ${archMap[process.arch]}`);
        return archMap[process.arch];
    }
    
    // Method 2: Check AWS_EXECUTION_ENV for architecture hints
    const executionEnv = process.env.AWS_EXECUTION_ENV;
    if (executionEnv) {
        if (executionEnv.toLowerCase().includes('arm64')) {
            console.log(`Detected ARM64 from AWS_EXECUTION_ENV: ${executionEnv}`);
            return 'arm64';
        }
        // AWS_EXECUTION_ENV format is typically like: AWS_Lambda_nodejs18.x
        // It doesn't directly indicate architecture, but we can use it as a hint
    }
    
    // Method 3: Check Lambda function configuration via environment
    // AWS Lambda sets _HANDLER and _X_AMZN_TRACE_ID which might contain hints
    const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
    if (lambdaTaskRoot && lambdaTaskRoot.includes('arm64')) {
        console.log(`Detected ARM64 from LAMBDA_TASK_ROOT: ${lambdaTaskRoot}`);
        return 'arm64';
    }
    
    // Default to x86_64 as it's the most common
    console.log('Defaulting to x86_64 architecture');
    return 'x86_64';
}

/**
 * Get the appropriate SSM Lambda Extension layer ARN for the current runtime
 * This combines architecture detection with region-specific ARN lookup
 * 
 * @param {string} region - AWS region (defaults to AWS_REGION env var)
 * @returns {string|null} The layer ARN or null if not found
 */
function getRuntimeSSMLayerArn(region = process.env.AWS_REGION) {
    const architecture = detectRuntimeArchitecture();
    const { getSSMLayerArn } = require('./aws-ssm-layer-arns');
    
    return getSSMLayerArn(region, architecture);
}

/**
 * Check if the Lambda Extension is available
 * The extension runs on port 2773 by default
 * 
 * @returns {Promise<boolean>} True if the extension is available
 */
async function isExtensionAvailable() {
    const http = require('http');
    const port = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
    
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: '/ping',
            method: 'GET',
            timeout: 1000
        };
        
        const req = http.request(options, (res) => {
            resolve(res.statusCode === 200 || res.statusCode === 404);
        });
        
        req.on('error', () => {
            resolve(false);
        });
        
        req.on('timeout', () => {
            req.abort();
            resolve(false);
        });
        
        req.end();
    });
}

/**
 * Get Lambda function metadata including architecture
 * This uses the Lambda Runtime API if available
 * 
 * @returns {Promise<Object>} Function metadata
 */
async function getFunctionMetadata() {
    const metadata = {
        architecture: detectRuntimeArchitecture(),
        region: process.env.AWS_REGION,
        functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        functionVersion: process.env.AWS_LAMBDA_FUNCTION_VERSION,
        memoryLimit: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
        logGroup: process.env.AWS_LAMBDA_LOG_GROUP_NAME,
        logStream: process.env.AWS_LAMBDA_LOG_STREAM_NAME,
        runtime: process.env.AWS_EXECUTION_ENV
    };
    
    // Check if Lambda Extension is available
    metadata.hasSSMExtension = await isExtensionAvailable();
    
    return metadata;
}

/**
 * Determine the best architecture to use for deployment
 * This is used at deployment time by Serverless Framework
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.preferred - Preferred architecture from config
 * @param {string} options.provider - Provider-level architecture setting
 * @param {boolean} options.autoDetect - Whether to auto-detect from environment
 * @returns {string} The architecture to use ('x86_64' or 'arm64')
 */
function getDeploymentArchitecture(options = {}) {
    // Priority order:
    // 1. Explicit SSM architecture setting
    // 2. Provider-level architecture setting
    // 3. Auto-detection from build environment
    // 4. Default to x86_64
    
    if (options.preferred && ['x86_64', 'arm64'].includes(options.preferred)) {
        return options.preferred;
    }
    
    if (options.provider && ['x86_64', 'arm64'].includes(options.provider)) {
        return options.provider;
    }
    
    if (options.autoDetect) {
        // Try to detect from the build environment
        // This might not match the deployment target, so use with caution
        const buildArch = process.arch;
        if (buildArch === 'arm64') {
            console.log('Auto-detected ARM64 build environment, using arm64 for deployment');
            return 'arm64';
        }
    }
    
    // Default to x86_64 as it's universally supported
    return 'x86_64';
}

module.exports = {
    detectRuntimeArchitecture,
    getRuntimeSSMLayerArn,
    isExtensionAvailable,
    getFunctionMetadata,
    getDeploymentArchitecture
};