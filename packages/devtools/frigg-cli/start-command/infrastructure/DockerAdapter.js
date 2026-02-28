/**
 * DockerAdapter - Infrastructure adapter for Docker operations
 *
 * Provides methods to interact with Docker and Docker Compose
 * Used by pre-flight checks to verify database infrastructure is ready
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class DockerAdapter {
    /**
     * Check if Docker CLI is installed
     * @returns {Promise<boolean>} True if docker command is available
     */
    async isDockerInstalled() {
        return new Promise((resolve) => {
            exec('docker --version', (error) => {
                resolve(!error);
            });
        });
    }

    /**
     * Check if Docker daemon is running
     * @returns {Promise<boolean>} True if docker daemon is responsive
     */
    async isDockerRunning() {
        return new Promise((resolve) => {
            exec('docker info', (error) => {
                resolve(!error);
            });
        });
    }

    /**
     * Find docker-compose file in project directory or parent
     * @param {string} projectPath - Path to search in
     * @returns {Promise<string|null>} Path to compose file or null if not found
     */
    async findDockerComposeFile(projectPath) {
        const composeFileNames = [
            'docker-compose.yml',
            'docker-compose.yaml',
            'compose.yml',
            'compose.yaml'
        ];

        // Search in project path first
        for (const fileName of composeFileNames) {
            const filePath = path.join(projectPath, fileName);
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        // Search in parent directory (for backend paths)
        const parentPath = path.dirname(projectPath);
        if (parentPath !== projectPath) {
            for (const fileName of composeFileNames) {
                const filePath = path.join(parentPath, fileName);
                if (fs.existsSync(filePath)) {
                    return filePath;
                }
            }
        }

        return null;
    }

    /**
     * Start Docker Compose services
     * @param {string} composePath - Path to docker-compose file
     * @returns {Promise<{success: boolean, error?: string, output?: string}>}
     */
    async startDockerCompose(composePath) {
        return new Promise((resolve) => {
            const cmd = `docker compose -f ${composePath} up -d`;
            const options = { cwd: path.dirname(composePath) };

            exec(cmd, options, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: stderr || error.message
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout
                    });
                }
            });
        });
    }

    /**
     * Stop Docker Compose services
     * @param {string} composePath - Path to docker-compose file
     * @returns {Promise<{success: boolean, error?: string, output?: string}>}
     */
    async stopDockerCompose(composePath) {
        return new Promise((resolve) => {
            const cmd = `docker compose -f ${composePath} down`;
            const options = { cwd: path.dirname(composePath) };

            exec(cmd, options, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: stderr || error.message
                    });
                } else {
                    resolve({
                        success: true,
                        output: stdout
                    });
                }
            });
        });
    }

    /**
     * Start Docker Desktop application
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async startDockerDesktop() {
        return new Promise((resolve) => {
            let cmd;
            const platform = process.platform;

            if (platform === 'darwin') {
                cmd = 'open -a "Docker Desktop"';
            } else if (platform === 'win32') {
                cmd = 'start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"';
            } else {
                // Linux - try systemctl first, fall back to service
                cmd = 'systemctl start docker || service docker start';
            }

            exec(cmd, (error) => {
                if (error) {
                    resolve({
                        success: false,
                        error: error.message
                    });
                } else {
                    resolve({ success: true });
                }
            });
        });
    }

    /**
     * Get list of running Docker Compose services
     * @param {string} composePath - Path to docker-compose file
     * @returns {Promise<string[]>} List of running service names
     */
    async getDockerComposeServices(composePath) {
        return new Promise((resolve) => {
            const cmd = `docker compose -f ${composePath} ps --services --filter "status=running"`;
            const options = { cwd: path.dirname(composePath) };

            exec(cmd, options, (error, stdout) => {
                if (error) {
                    resolve([]);
                } else {
                    const services = stdout
                        .split('\n')
                        .map(s => s.trim())
                        .filter(s => s.length > 0);
                    resolve(services);
                }
            });
        });
    }

    /**
     * Check if a specific service is running
     * @param {string} composePath - Path to docker-compose file
     * @param {string} serviceName - Name of the service to check
     * @returns {Promise<boolean>} True if service is running
     */
    async isServiceRunning(composePath, serviceName) {
        const services = await this.getDockerComposeServices(composePath);
        return services.includes(serviceName);
    }

    /**
     * Wait for Docker to become ready after starting
     * @param {object} options - Wait options
     * @param {number} options.maxAttempts - Maximum number of attempts (default: 30)
     * @param {number} options.intervalMs - Interval between attempts in ms (default: 1000)
     * @returns {Promise<boolean>} True if Docker became ready, false if timed out
     */
    async waitForDockerReady(options = {}) {
        const { maxAttempts = 30, intervalMs = 1000 } = options;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const isRunning = await this.isDockerRunning();
            if (isRunning) {
                return true;
            }
            await this._sleep(intervalMs);
        }

        return false;
    }

    /**
     * Wait for LocalStack to be ready by polling health endpoint
     * @param {object} options - Wait options
     * @param {number} options.maxAttempts - Maximum number of attempts (default: 30)
     * @param {number} options.intervalMs - Interval between attempts in ms (default: 2000)
     * @param {string} options.endpoint - LocalStack endpoint (default: http://localhost:4566)
     * @returns {Promise<{ready: boolean, services?: object, error?: string}>}
     */
    async waitForLocalStack(options = {}) {
        const {
            maxAttempts = 30,
            intervalMs = 2000,
            endpoint = process.env.AWS_ENDPOINT || 'http://localhost:4566'
        } = options;

        const healthUrl = `${endpoint}/_localstack/health`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await this._checkLocalStackHealth(healthUrl);
                if (result.ready) {
                    return result;
                }
                // Not ready yet, wait and retry
                if (attempt < maxAttempts) {
                    await this._sleep(intervalMs);
                }
            } catch (error) {
                // Connection failed, wait and retry
                if (attempt < maxAttempts) {
                    await this._sleep(intervalMs);
                }
            }
        }

        return {
            ready: false,
            error: `LocalStack not ready after ${maxAttempts} attempts`
        };
    }

    /**
     * Check LocalStack health endpoint
     * @param {string} healthUrl - URL to health endpoint
     * @returns {Promise<{ready: boolean, services?: object}>}
     */
    async _checkLocalStackHealth(healthUrl) {
        return new Promise((resolve, reject) => {
            const http = require('http');
            const url = new URL(healthUrl);

            const req = http.get({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const health = JSON.parse(data);
                        // Check if services are running
                        // LocalStack returns: { "services": { "sqs": "running", ... } }
                        const services = health.services || {};
                        const sqsReady = services.sqs === 'running' || services.sqs === 'available';

                        resolve({
                            ready: sqsReady,
                            services: services
                        });
                    } catch (e) {
                        resolve({ ready: false });
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    /**
     * Helper to sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { DockerAdapter };
