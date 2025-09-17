/**
 * SSM Parameter Store integration for Frigg core
 * Works alongside the existing secretsToEnv for comprehensive configuration management
 * 
 * This module provides automatic detection of Lambda architecture and
 * efficient parameter retrieval using the AWS Parameters and Secrets Lambda Extension
 */

/**
 * Detect the Lambda architecture at runtime
 * @returns {string} 'x86_64' or 'arm64'
 */
const detectArchitecture = () => {
    // Method 1: Check process.arch (Node.js built-in)
    // x64 = x86_64, arm64 = ARM64
    if (process.arch === 'arm64') {
        return 'arm64';
    }
    
    // Method 2: Check AWS_EXECUTION_ENV for Graviton indicators
    const executionEnv = process.env.AWS_EXECUTION_ENV;
    if (executionEnv && executionEnv.includes('arm64')) {
        return 'arm64';
    }
    
    // Method 3: Check processor info from /proc/cpuinfo (Linux)
    // This would require fs access which may not be ideal
    
    // Default to x86_64
    return 'x86_64';
};

/**
 * Get a parameter from SSM Parameter Store using the Lambda Extension
 * @param {string} parameterName - The parameter name
 * @param {boolean} withDecryption - Whether to decrypt SecureString parameters
 * @returns {Promise<string>} The parameter value
 */
const getParameter = async (parameterName, withDecryption = true) => {
    const httpPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    
    if (!sessionToken) {
        console.warn('AWS_SESSION_TOKEN not found, SSM Extension may not be available');
        return null;
    }
    
    const queryParams = new URLSearchParams({
        name: parameterName,
        ...(withDecryption && { withDecryption: 'true' })
    });
    
    const url = `http://localhost:${httpPort}/systemsmanager/parameters/get?${queryParams}`;
    const options = {
        headers: {
            'X-Aws-Parameters-Secrets-Token': sessionToken
        },
        method: 'GET'
    };
    
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error(`Failed to get parameter ${parameterName}:`, error);
            return null;
        }
        
        const result = await response.json();
        return result.Parameter?.Value;
    } catch (error) {
        console.error(`Error fetching parameter ${parameterName}:`, error);
        return null;
    }
};

/**
 * Get multiple parameters by path from SSM Parameter Store
 * @param {string} path - The parameter path
 * @param {boolean} recursive - Get parameters recursively
 * @param {boolean} withDecryption - Whether to decrypt SecureString parameters
 * @returns {Promise<Object>} Object with parameter names as keys
 */
const getParametersByPath = async (path, recursive = true, withDecryption = true) => {
    const httpPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
    const sessionToken = process.env.AWS_SESSION_TOKEN;
    
    if (!sessionToken) {
        console.warn('AWS_SESSION_TOKEN not found, SSM Extension may not be available');
        return {};
    }
    
    const queryParams = new URLSearchParams({
        path: path,
        recursive: recursive.toString(),
        ...(withDecryption && { withDecryption: 'true' })
    });
    
    const url = `http://localhost:${httpPort}/systemsmanager/parameters/get-by-path?${queryParams}`;
    const options = {
        headers: {
            'X-Aws-Parameters-Secrets-Token': sessionToken
        },
        method: 'GET'
    };
    
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            console.error(`Failed to get parameters by path ${path}:`, error);
            return {};
        }
        
        const result = await response.json();
        const parameters = {};
        
        if (result.Parameters) {
            result.Parameters.forEach(param => {
                // Extract the parameter name (last part of the path)
                const name = param.Name.split('/').pop();
                parameters[name] = param.Value;
            });
        }
        
        return parameters;
    } catch (error) {
        console.error(`Error fetching parameters by path ${path}:`, error);
        return {};
    }
};

/**
 * Load SSM parameters as environment variables
 * This function is called automatically by createHandler if SSM_PARAMETER_PREFIX is set
 * 
 * @param {string} prefix - The parameter prefix (defaults to SSM_PARAMETER_PREFIX env var)
 * @returns {Promise<number>} Number of parameters loaded
 */
const parametersToEnv = async (prefix = process.env.SSM_PARAMETER_PREFIX) => {
    if (!prefix) {
        return 0;
    }
    
    console.log(`Loading SSM parameters from prefix: ${prefix}`);
    
    try {
        const parameters = await getParametersByPath(prefix, true, true);
        let count = 0;
        
        Object.entries(parameters).forEach(([key, value]) => {
            // Convert parameter name to environment variable format
            // e.g., database-url becomes DATABASE_URL
            const envKey = key.toUpperCase().replace(/[-/]/g, '_');
            process.env[envKey] = value;
            count++;
        });
        
        console.log(`Loaded ${count} SSM parameters as environment variables`);
        return count;
    } catch (error) {
        console.error('Error loading SSM parameters:', error);
        throw error;
    }
};

/**
 * Enhanced secretsToEnv that also loads SSM parameters
 * This maintains backward compatibility while adding SSM support
 */
const enhancedSecretsToEnv = async () => {
    const results = {
        secrets: 0,
        parameters: 0,
        architecture: detectArchitecture()
    };
    
    console.log(`Lambda architecture detected: ${results.architecture}`);
    
    // Load secrets from Secrets Manager (existing functionality)
    if (process.env.SECRET_ARN) {
        try {
            const { secretsToEnv } = require('./secrets-to-env');
            await secretsToEnv();
            results.secrets = 1; // We loaded at least one secret
            console.log('Secrets loaded from Secrets Manager');
        } catch (error) {
            console.error('Error loading secrets:', error);
            // Don't throw - allow handler to continue
        }
    }
    
    // Load parameters from SSM Parameter Store (new functionality)
    if (process.env.SSM_PARAMETER_PREFIX) {
        try {
            results.parameters = await parametersToEnv();
        } catch (error) {
            console.error('Error loading SSM parameters:', error);
            // Don't throw - allow handler to continue
        }
    }
    
    return results;
};

module.exports = {
    detectArchitecture,
    getParameter,
    getParametersByPath,
    parametersToEnv,
    enhancedSecretsToEnv
};