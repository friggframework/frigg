const http = require('http');
const https = require('https');

/**
 * Utility for retrieving parameters from AWS SSM Parameter Store
 * using the AWS Parameters and Secrets Lambda Extension
 * 
 * This utility uses the Lambda Extension's local HTTP endpoint for optimal performance
 * and caching, falling back to AWS SDK if the extension is not available
 */
class SSMParameterStore {
    constructor() {
        // Extension configuration
        this.extensionPort = process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT || 2773;
        this.extensionHost = 'localhost';
        this.sessionToken = process.env.AWS_SESSION_TOKEN;
        this.parameterPrefix = process.env.SSM_PARAMETER_PREFIX || '';
        
        // Check if extension is available
        this.extensionAvailable = !!this.sessionToken;
        
        // Cache settings
        this.ttl = process.env.SSM_PARAMETER_STORE_TTL ? 
            parseInt(process.env.SSM_PARAMETER_STORE_TTL) : 300; // Default 5 minutes
    }
    
    /**
     * Get a parameter value from SSM Parameter Store
     * @param {string} parameterName - Name of the parameter (without prefix)
     * @param {Object} options - Options for parameter retrieval
     * @param {boolean} options.withDecryption - Decrypt SecureString parameters
     * @param {boolean} options.useFullName - Use the parameter name as-is without prefix
     * @returns {Promise<string>} The parameter value
     */
    async getParameter(parameterName, options = {}) {
        const { withDecryption = true, useFullName = false } = options;
        
        // Construct full parameter name
        const fullParameterName = useFullName ? 
            parameterName : 
            `${this.parameterPrefix}/${parameterName}`.replace(/\/+/g, '/');
        
        if (this.extensionAvailable) {
            return this.getParameterViaExtension(fullParameterName, withDecryption);
        } else {
            return this.getParameterViaSDK(fullParameterName, withDecryption);
        }
    }
    
    /**
     * Get multiple parameters by path from SSM Parameter Store
     * @param {string} path - Parameter path (without prefix)
     * @param {Object} options - Options for parameter retrieval
     * @param {boolean} options.recursive - Get parameters recursively
     * @param {boolean} options.withDecryption - Decrypt SecureString parameters
     * @returns {Promise<Object>} Object with parameter names as keys and values as values
     */
    async getParametersByPath(path, options = {}) {
        const { recursive = true, withDecryption = true } = options;
        
        // Construct full path
        const fullPath = `${this.parameterPrefix}/${path}`.replace(/\/+/g, '/');
        
        if (this.extensionAvailable) {
            return this.getParametersByPathViaExtension(fullPath, recursive, withDecryption);
        } else {
            return this.getParametersByPathViaSDK(fullPath, recursive, withDecryption);
        }
    }
    
    /**
     * Get parameter via Lambda Extension
     * @private
     */
    async getParameterViaExtension(parameterName, withDecryption) {
        return new Promise((resolve, reject) => {
            const queryParams = new URLSearchParams({
                name: parameterName,
                ...(withDecryption && { withDecryption: 'true' })
            });
            
            const options = {
                hostname: this.extensionHost,
                port: this.extensionPort,
                path: `/systemsmanager/parameters/get?${queryParams}`,
                method: 'GET',
                headers: {
                    'X-Aws-Parameters-Secrets-Token': this.sessionToken
                }
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            resolve(response.Parameter.Value);
                        } else {
                            reject(new Error(`Failed to get parameter: ${response.message || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Extension request failed: ${error.message}`));
            });
            
            req.end();
        });
    }
    
    /**
     * Get parameters by path via Lambda Extension
     * @private
     */
    async getParametersByPathViaExtension(path, recursive, withDecryption) {
        return new Promise((resolve, reject) => {
            const queryParams = new URLSearchParams({
                path: path,
                recursive: recursive.toString(),
                ...(withDecryption && { withDecryption: 'true' })
            });
            
            const options = {
                hostname: this.extensionHost,
                port: this.extensionPort,
                path: `/systemsmanager/parameters/get-by-path?${queryParams}`,
                method: 'GET',
                headers: {
                    'X-Aws-Parameters-Secrets-Token': this.sessionToken
                }
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            const parameters = {};
                            response.Parameters.forEach(param => {
                                // Extract the parameter name without the prefix
                                const name = param.Name.replace(this.parameterPrefix + '/', '');
                                parameters[name] = param.Value;
                            });
                            resolve(parameters);
                        } else {
                            reject(new Error(`Failed to get parameters: ${response.message || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Extension request failed: ${error.message}`));
            });
            
            req.end();
        });
    }
    
    /**
     * Get parameter via AWS SDK (fallback)
     * @private
     */
    async getParameterViaSDK(parameterName, withDecryption) {
        try {
            const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
            const client = new SSMClient({ region: process.env.AWS_REGION });
            
            const command = new GetParameterCommand({
                Name: parameterName,
                WithDecryption: withDecryption
            });
            
            const response = await client.send(command);
            return response.Parameter.Value;
        } catch (error) {
            if (error.name === 'ParameterNotFound') {
                throw new Error(`Parameter not found: ${parameterName}`);
            }
            throw error;
        }
    }
    
    /**
     * Get parameters by path via AWS SDK (fallback)
     * @private
     */
    async getParametersByPathViaSDK(path, recursive, withDecryption) {
        try {
            const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');
            const client = new SSMClient({ region: process.env.AWS_REGION });
            
            const parameters = {};
            let nextToken;
            
            do {
                const command = new GetParametersByPathCommand({
                    Path: path,
                    Recursive: recursive,
                    WithDecryption: withDecryption,
                    NextToken: nextToken
                });
                
                const response = await client.send(command);
                
                response.Parameters.forEach(param => {
                    // Extract the parameter name without the prefix
                    const name = param.Name.replace(this.parameterPrefix + '/', '');
                    parameters[name] = param.Value;
                });
                
                nextToken = response.NextToken;
            } while (nextToken);
            
            return parameters;
        } catch (error) {
            throw new Error(`Failed to get parameters by path: ${error.message}`);
        }
    }
    
    /**
     * Load all parameters as environment variables
     * @param {string} path - Parameter path (without prefix)
     * @param {Object} options - Options for parameter retrieval
     * @returns {Promise<number>} Number of environment variables loaded
     */
    async loadAsEnvironmentVariables(path = '', options = {}) {
        const parameters = await this.getParametersByPath(path, options);
        let count = 0;
        
        for (const [key, value] of Object.entries(parameters)) {
            // Convert parameter name to environment variable format
            // e.g., database/url becomes DATABASE_URL
            const envKey = key.toUpperCase().replace(/[/-]/g, '_');
            process.env[envKey] = value;
            count++;
        }
        
        console.log(`Loaded ${count} parameters as environment variables`);
        return count;
    }
    
    /**
     * Get secrets from AWS Secrets Manager (if needed)
     * @param {string} secretId - The secret ID or ARN
     * @returns {Promise<Object>} The secret value
     */
    async getSecret(secretId) {
        if (this.extensionAvailable) {
            return this.getSecretViaExtension(secretId);
        } else {
            return this.getSecretViaSDK(secretId);
        }
    }
    
    /**
     * Get secret via Lambda Extension
     * @private
     */
    async getSecretViaExtension(secretId) {
        return new Promise((resolve, reject) => {
            const queryParams = new URLSearchParams({
                secretId: secretId
            });
            
            const options = {
                hostname: this.extensionHost,
                port: this.extensionPort,
                path: `/secretsmanager/get?${queryParams}`,
                method: 'GET',
                headers: {
                    'X-Aws-Parameters-Secrets-Token': this.sessionToken
                }
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            const secretString = response.SecretString;
                            try {
                                resolve(JSON.parse(secretString));
                            } catch {
                                resolve(secretString);
                            }
                        } else {
                            reject(new Error(`Failed to get secret: ${response.message || 'Unknown error'}`));
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse response: ${error.message}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(new Error(`Extension request failed: ${error.message}`));
            });
            
            req.end();
        });
    }
    
    /**
     * Get secret via AWS SDK (fallback)
     * @private
     */
    async getSecretViaSDK(secretId) {
        try {
            const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
            const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
            
            const command = new GetSecretValueCommand({
                SecretId: secretId
            });
            
            const response = await client.send(command);
            const secretString = response.SecretString;
            
            try {
                return JSON.parse(secretString);
            } catch {
                return secretString;
            }
        } catch (error) {
            throw new Error(`Failed to get secret: ${error.message}`);
        }
    }
}

// Export singleton instance
module.exports = new SSMParameterStore();