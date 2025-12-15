/**
 * RunPreflightChecksUseCase - Orchestrates pre-flight checks before starting Frigg
 *
 * Application Layer - Use Case that coordinates multiple infrastructure adapters
 * to verify the environment is ready for Frigg to start.
 *
 * Checks performed:
 * 1. DATABASE_URL environment variable exists
 * 2. Docker is installed
 * 3. Docker daemon is running
 * 4. Database is reachable
 */

class RunPreflightChecksUseCase {
    constructor({ dockerAdapter, databaseAdapter }) {
        this.dockerAdapter = dockerAdapter;
        this.databaseAdapter = databaseAdapter;
    }

    /**
     * Execute all pre-flight checks
     * @param {object} options - Options
     * @param {string} options.projectPath - Path to the Frigg project
     * @returns {Promise<{allPassed: boolean, checks: Array}>}
     */
    async execute({ projectPath }) {
        const checks = [];

        // Check 1: DATABASE_URL exists
        const dbUrlCheck = this._checkDatabaseUrl();
        checks.push(dbUrlCheck);

        // Short-circuit if DATABASE_URL is missing
        if (dbUrlCheck.status === 'failed') {
            return { allPassed: false, checks };
        }

        // Check 2: Docker is installed
        const dockerInstalledCheck = await this._checkDockerInstalled();
        checks.push(dockerInstalledCheck);

        // Short-circuit if Docker is not installed
        if (dockerInstalledCheck.status === 'failed') {
            return { allPassed: false, checks };
        }

        // Check 3: Docker is running
        const dockerRunningCheck = await this._checkDockerRunning();
        checks.push(dockerRunningCheck);

        // Short-circuit if Docker is not running
        if (dockerRunningCheck.status === 'failed') {
            return { allPassed: false, checks };
        }

        // Check 4: Database is reachable
        const dbReachableCheck = await this._checkDatabaseReachable(projectPath);
        checks.push(dbReachableCheck);

        // Check 5: LocalStack is reachable (only if AWS_ENDPOINT is configured for local)
        const localstackCheck = await this._checkLocalStackReachable(projectPath);
        if (localstackCheck) {
            checks.push(localstackCheck);
        }

        const allPassed = checks.every(check => check.status === 'passed');
        return { allPassed, checks };
    }

    /**
     * Check if DATABASE_URL environment variable is set
     * @returns {object} Check result
     */
    _checkDatabaseUrl() {
        const databaseUrl = process.env.DATABASE_URL;

        if (!databaseUrl || databaseUrl.trim() === '') {
            return {
                name: 'database_url',
                status: 'failed',
                message: 'DATABASE_URL environment variable is not set',
                canResolve: true,
                resolution: {
                    type: 'create_env',
                    prompt: 'Would you like to create a .env file from the template?',
                    action: 'copy_env_template'
                }
            };
        }

        const dbType = this.databaseAdapter.getDatabaseType(databaseUrl);

        return {
            name: 'database_url',
            status: 'passed',
            message: `DATABASE_URL is configured (${dbType || 'unknown'} database)`,
            canResolve: false,
            resolution: null
        };
    }

    /**
     * Check if Docker is installed
     * @returns {Promise<object>} Check result
     */
    async _checkDockerInstalled() {
        const isInstalled = await this.dockerAdapter.isDockerInstalled();

        if (!isInstalled) {
            return {
                name: 'docker_installed',
                status: 'failed',
                message: 'Docker is not installed',
                canResolve: false,
                resolution: {
                    type: 'manual',
                    instructions: 'Please install Docker Desktop from https://www.docker.com/products/docker-desktop'
                }
            };
        }

        return {
            name: 'docker_installed',
            status: 'passed',
            message: 'Docker is installed',
            canResolve: false,
            resolution: null
        };
    }

    /**
     * Check if Docker daemon is running
     * @returns {Promise<object>} Check result
     */
    async _checkDockerRunning() {
        const isRunning = await this.dockerAdapter.isDockerRunning();

        if (!isRunning) {
            return {
                name: 'docker_running',
                status: 'failed',
                message: 'Docker is not running. Please start Docker Desktop.',
                canResolve: true,
                resolution: {
                    type: 'start_docker',
                    prompt: 'Would you like to start Docker Desktop?',
                    action: 'start_docker_desktop'
                }
            };
        }

        return {
            name: 'docker_running',
            status: 'passed',
            message: 'Docker daemon is running',
            canResolve: false,
            resolution: null
        };
    }

    /**
     * Check if database is reachable
     * @param {string} projectPath - Path to project
     * @returns {Promise<object>} Check result
     */
    async _checkDatabaseReachable(projectPath) {
        const databaseUrl = process.env.DATABASE_URL;
        const result = await this.databaseAdapter.isDatabaseReachable(databaseUrl);

        if (!result.reachable) {
            // Check for docker-compose file
            const composePath = await this.dockerAdapter.findDockerComposeFile(projectPath);

            if (composePath) {
                return {
                    name: 'database_reachable',
                    status: 'failed',
                    message: `Database is not reachable: ${result.error || 'Connection failed'}`,
                    canResolve: true,
                    resolution: {
                        type: 'start_docker_compose',
                        prompt: 'Would you like to start the database using docker-compose?',
                        composePath,
                        action: 'docker_compose_up'
                    }
                };
            }

            return {
                name: 'database_reachable',
                status: 'failed',
                message: `Database is not reachable: ${result.error || 'Connection failed'}`,
                canResolve: false,
                resolution: {
                    type: 'manual',
                    instructions: 'Please ensure your database server is running and accessible at the configured DATABASE_URL.'
                }
            };
        }

        return {
            name: 'database_reachable',
            status: 'passed',
            message: `Database is reachable at ${result.host}:${result.port}`,
            canResolve: false,
            resolution: null
        };
    }

    /**
     * Check if LocalStack is reachable (for local development)
     *
     * The serverless plugin defaults to http://localhost:4566 for LocalStack
     * even if AWS_ENDPOINT isn't set. So we check LocalStack in local dev
     * mode by default.
     *
     * @param {string} projectPath - Path to project
     * @returns {Promise<object|null>} Check result, or null if LocalStack check is not applicable
     */
    async _checkLocalStackReachable(projectPath) {
        // Default LocalStack endpoint - same as serverless plugin default
        const defaultEndpoint = 'http://localhost:4566';
        const awsEndpoint = process.env.AWS_ENDPOINT;

        // If AWS_ENDPOINT is set to a non-local address, skip LocalStack check
        if (awsEndpoint) {
            const isLocalEndpoint = awsEndpoint.includes('localhost') ||
                                    awsEndpoint.includes('127.0.0.1') ||
                                    awsEndpoint.includes('localstack');

            if (!isLocalEndpoint) {
                // Using real AWS, not LocalStack
                return null;
            }
        }

        // Use configured endpoint or default LocalStack endpoint
        const endpoint = awsEndpoint || defaultEndpoint;

        // Try to reach LocalStack health endpoint
        const result = await this.dockerAdapter.waitForLocalStack({
            maxAttempts: 1,  // Just one check, not waiting
            intervalMs: 0,
            endpoint: endpoint
        });

        if (!result.ready) {
            // Check for docker-compose file
            const composePath = await this.dockerAdapter.findDockerComposeFile(projectPath);

            if (composePath) {
                return {
                    name: 'localstack_reachable',
                    status: 'failed',
                    message: `LocalStack is not reachable at ${endpoint}`,
                    canResolve: true,
                    resolution: {
                        type: 'start_docker_compose',
                        prompt: 'Would you like to start LocalStack using docker-compose?',
                        composePath,
                        action: 'docker_compose_up'
                    }
                };
            }

            return {
                name: 'localstack_reachable',
                status: 'failed',
                message: `LocalStack is not reachable at ${endpoint}`,
                canResolve: false,
                resolution: {
                    type: 'manual',
                    instructions: `Please ensure LocalStack is running at ${endpoint}. You can start it with: docker-compose up -d`
                }
            };
        }

        return {
            name: 'localstack_reachable',
            status: 'passed',
            message: `LocalStack is reachable at ${endpoint}`,
            canResolve: false,
            resolution: null
        };
    }

    /**
     * Get only the failed checks from a result
     * @param {object} result - Result from execute()
     * @returns {Array} Failed checks
     */
    getFailedChecks(result) {
        return result.checks.filter(check => check.status === 'failed');
    }

    /**
     * Get only the checks that can be auto-resolved
     * @param {object} result - Result from execute()
     * @returns {Array} Resolvable failed checks
     */
    getResolvableChecks(result) {
        return result.checks.filter(check => check.status === 'failed' && check.canResolve);
    }
}

module.exports = { RunPreflightChecksUseCase };
