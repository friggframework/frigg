/**
 * DatabaseAdapter - Infrastructure adapter for database connectivity checks
 *
 * Provides methods to parse connection strings and test database reachability
 * Used by pre-flight checks to verify database infrastructure is ready
 */

const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

class DatabaseAdapter {
    /**
     * Parse a database connection string
     * @param {string} connectionString - Database URL
     * @returns {object} Parsed connection details or error
     */
    parseConnectionString(connectionString) {
        if (!connectionString || typeof connectionString !== 'string') {
            return { error: 'Invalid connection string: must be a non-empty string' };
        }

        try {
            // Handle mongodb+srv:// protocol separately (URL doesn't parse it well)
            if (connectionString.startsWith('mongodb+srv://')) {
                return this._parseMongoSrv(connectionString);
            }

            // Handle MongoDB replica set connection strings with multiple hosts
            // mongodb://host1:port1,host2:port2,host3:port3/database
            if (connectionString.startsWith('mongodb://') && connectionString.includes(',')) {
                return this._parseMongoReplicaSet(connectionString);
            }

            const url = new URL(connectionString);
            const protocol = url.protocol.replace(':', '');

            // Determine database type
            let type;
            let defaultPort;
            if (protocol === 'mongodb') {
                type = 'mongodb';
                defaultPort = 27017;
            } else if (protocol === 'postgresql' || protocol === 'postgres') {
                type = 'postgresql';
                defaultPort = 5432;
            } else {
                return { error: `Unsupported database type: ${protocol}` };
            }

            // Extract first host from potential replica set
            const host = url.hostname.split(',')[0];
            const port = url.port ? parseInt(url.port, 10) : defaultPort;

            // Extract database name from pathname
            const database = url.pathname.replace('/', '') || undefined;

            // Extract user if present
            const user = url.username || undefined;

            return {
                type,
                host,
                port,
                database,
                user
            };
        } catch (error) {
            return { error: `Failed to parse connection string: ${error.message}` };
        }
    }

    /**
     * Parse MongoDB replica set connection string with multiple hosts
     * @param {string} connectionString - MongoDB replica set connection string
     * @returns {object} Parsed connection details
     */
    _parseMongoReplicaSet(connectionString) {
        try {
            // mongodb://user:pass@host1:port1,host2:port2/database?options
            const withoutProtocol = connectionString.replace('mongodb://', '');

            // Extract user:pass if present
            let hostsPart = withoutProtocol;
            let user;
            if (withoutProtocol.includes('@')) {
                const atIndex = withoutProtocol.indexOf('@');
                const credentials = withoutProtocol.substring(0, atIndex);
                hostsPart = withoutProtocol.substring(atIndex + 1);
                user = credentials.split(':')[0];
            }

            // Extract database and options
            let database;
            const slashIndex = hostsPart.indexOf('/');
            if (slashIndex !== -1) {
                const pathPart = hostsPart.substring(slashIndex + 1);
                hostsPart = hostsPart.substring(0, slashIndex);
                database = pathPart.split('?')[0] || undefined;
            }

            // Get first host:port pair
            const firstHost = hostsPart.split(',')[0];
            const [host, portStr] = firstHost.split(':');
            const port = portStr ? parseInt(portStr, 10) : 27017;

            return {
                type: 'mongodb',
                host,
                port,
                database,
                user
            };
        } catch (error) {
            return { error: `Failed to parse MongoDB replica set connection string: ${error.message}` };
        }
    }

    /**
     * Parse mongodb+srv:// connection string
     * @param {string} connectionString - MongoDB SRV connection string
     * @returns {object} Parsed connection details
     */
    _parseMongoSrv(connectionString) {
        try {
            // Replace mongodb+srv with https for URL parsing
            const url = new URL(connectionString.replace('mongodb+srv://', 'https://'));

            const host = url.hostname;
            const database = url.pathname.replace('/', '') || undefined;
            const user = url.username || undefined;

            return {
                type: 'mongodb',
                host,
                port: 27017, // SRV uses standard port
                database,
                user
            };
        } catch (error) {
            return { error: `Failed to parse MongoDB SRV connection string: ${error.message}` };
        }
    }

    /**
     * Get database type from connection string
     * @param {string} connectionString - Database URL
     * @returns {string|null} 'mongodb' | 'postgresql' | null
     */
    getDatabaseType(connectionString) {
        if (!connectionString) return null;

        if (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://')) {
            return 'mongodb';
        }
        if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
            return 'postgresql';
        }
        return null;
    }

    /**
     * Check if a TCP port is reachable
     * @param {string} host - Host to connect to
     * @param {number} port - Port to connect to
     * @param {number} timeout - Timeout in milliseconds (default: 3000)
     * @returns {Promise<boolean>} True if port is reachable
     */
    async isPortReachable(host, port, timeout = 3000) {
        return new Promise((resolve) => {
            const socket = net.createConnection(port, host);

            socket.setTimeout(timeout);

            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    /**
     * Check if database is reachable at the connection string
     * @param {string} connectionString - Database URL
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<{reachable: boolean, host?: string, port?: number, type?: string, error?: string}>}
     */
    async isDatabaseReachable(connectionString, timeout = 3000) {
        const parsed = this.parseConnectionString(connectionString);

        if (parsed.error) {
            return {
                reachable: false,
                error: parsed.error
            };
        }

        const { type, host, port } = parsed;

        try {
            const reachable = await this.isPortReachable(host, port, timeout);

            if (reachable) {
                return {
                    reachable: true,
                    type,
                    host,
                    port
                };
            } else {
                return {
                    reachable: false,
                    type,
                    host,
                    port,
                    error: `ECONNREFUSED - Unable to connect to ${host}:${port}`
                };
            }
        } catch (error) {
            return {
                reachable: false,
                type,
                host,
                port,
                error: error.message
            };
        }
    }

    /**
     * Get connection details summary
     * @param {string} connectionString - Database URL
     * @returns {object} Connection details or error
     */
    getConnectionDetails(connectionString) {
        const parsed = this.parseConnectionString(connectionString);

        if (parsed.error) {
            return { error: parsed.error };
        }

        return {
            type: parsed.type,
            host: parsed.host,
            port: parsed.port,
            database: parsed.database,
            user: parsed.user,
            hasCredentials: !!parsed.user
        };
    }

    /**
     * Suggest Docker service configuration for a database type
     * @param {string} dbType - 'mongodb' | 'postgresql'
     * @returns {object|null} Docker service suggestion or null
     */
    suggestDockerService(dbType) {
        if (dbType === 'mongodb') {
            return {
                serviceName: 'mongodb',
                image: 'mongo:7',
                port: 27017,
                envVars: {
                    MONGO_INITDB_DATABASE: 'frigg'
                }
            };
        }

        if (dbType === 'postgresql') {
            return {
                serviceName: 'postgres',
                image: 'postgres:16',
                port: 5432,
                envVars: {
                    POSTGRES_DB: 'frigg',
                    POSTGRES_USER: 'postgres',
                    POSTGRES_PASSWORD: 'postgres'
                }
            };
        }

        return null;
    }

    /**
     * Check PostgreSQL migration status using Prisma
     * @param {string} projectPath - Path to the project
     * @returns {Promise<{migrated: boolean, pendingMigrations?: string[], error?: string}>}
     */
    async checkMigrationStatus(projectPath) {
        return new Promise((resolve) => {
            // Look for prisma schema in common locations
            // Frigg apps use the schema from @friggframework/core
            const possibleSchemaPaths = [
                // Project-local prisma schemas
                path.join(projectPath, 'prisma', 'postgresql', 'schema.prisma'),
                path.join(projectPath, 'prisma', 'schema.prisma'),
                // Frigg core schemas (in node_modules)
                path.join(projectPath, 'node_modules', '@friggframework', 'core', 'prisma-postgresql', 'schema.prisma'),
                path.join(projectPath, 'node_modules', '@friggframework', 'core', 'generated', 'prisma-postgresql', 'schema.prisma')
            ];

            // Find the first existing schema path
            const fs = require('fs');
            let schemaPath = null;
            for (const p of possibleSchemaPaths) {
                if (fs.existsSync(p)) {
                    schemaPath = p;
                    break;
                }
            }

            if (!schemaPath) {
                // No schema found - might be MongoDB project
                resolve({ migrated: true, note: 'No Prisma PostgreSQL schema found' });
                return;
            }

            // Find prisma binary - check local node_modules first
            const possiblePrismaPaths = [
                path.join(projectPath, 'node_modules', '.bin', 'prisma'),
                path.join(projectPath, 'node_modules', 'prisma', 'build', 'index.js')
            ];

            let prismaBin = 'npx';
            let args = ['prisma', 'migrate', 'status', '--schema', schemaPath];

            // Try to find local prisma binary for pnpm/yarn workspaces
            for (const p of possiblePrismaPaths) {
                if (fs.existsSync(p)) {
                    if (p.endsWith('.js')) {
                        prismaBin = 'node';
                        args = [p, 'migrate', 'status', '--schema', schemaPath];
                    } else {
                        prismaBin = p;
                        args = ['migrate', 'status', '--schema', schemaPath];
                    }
                    break;
                }
            }

            const child = spawn(prismaBin, args, {
                cwd: projectPath,
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: prismaBin === 'npx'  // Use shell for npx to help with path resolution
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                resolve({
                    migrated: false,
                    error: `Failed to run prisma migrate status: ${error.message}`
                });
            });

            child.on('close', (code) => {
                // Parse the output to determine migration status
                const output = stdout + stderr;

                // Check for Prisma not found / not installed error
                if (output.includes('Cannot find module') && output.includes('prisma')) {
                    resolve({
                        migrated: false,
                        error: 'Prisma CLI not properly installed. Run "npm install" or "pnpm install" to fix.',
                        needsInstall: true
                    });
                    return;
                }

                // Check for common error patterns
                if (output.includes('P1001') || output.includes('Can\'t reach database server')) {
                    resolve({
                        migrated: false,
                        error: 'Cannot connect to database to check migrations'
                    });
                    return;
                }

                if (output.includes('P1003') || output.includes('does not exist')) {
                    resolve({
                        migrated: false,
                        error: 'Database does not exist',
                        needsSetup: true
                    });
                    return;
                }

                // Check for "Database schema is not empty" - tables exist but no migrations
                if (output.includes('Database schema is not empty')) {
                    resolve({
                        migrated: false,
                        error: 'Database has tables but no migration history. Run prisma migrate to baseline.',
                        needsBaseline: true
                    });
                    return;
                }

                // Check for pending migrations
                if (output.includes('Following migration') && output.includes('have not yet been applied')) {
                    const pendingMatch = output.match(/Following migration[s]? have not yet been applied:\s*([\s\S]*?)(?:To apply|$)/);
                    const pendingMigrations = pendingMatch
                        ? pendingMatch[1].trim().split('\n').map(m => m.trim()).filter(Boolean)
                        : [];

                    resolve({
                        migrated: false,
                        pendingMigrations,
                        error: 'Database has pending migrations'
                    });
                    return;
                }

                // Check for "no migration found" - empty migrations folder
                if (output.includes('No migration found') || output.includes('Database schema is up to date')) {
                    resolve({ migrated: true });
                    return;
                }

                // Check for table not found errors (P2021)
                if (output.includes('P2021') || output.includes('does not exist in the current database')) {
                    resolve({
                        migrated: false,
                        error: 'Required database tables do not exist. Run migrations first.',
                        needsSetup: true
                    });
                    return;
                }

                // If exit code is 0 and no error patterns, assume migrated
                if (code === 0) {
                    resolve({ migrated: true });
                    return;
                }

                // Unknown error
                resolve({
                    migrated: false,
                    error: output.trim() || `prisma migrate status exited with code ${code}`
                });
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                child.kill();
                resolve({
                    migrated: false,
                    error: 'Timeout checking migration status'
                });
            }, 30000);
        });
    }

    /**
     * Run Prisma migrations
     * @param {string} projectPath - Path to the project
     * @param {object} options - Options
     * @param {boolean} options.dev - Use dev mode (interactive, can create migrations)
     * @returns {Promise<{success: boolean, output?: string, error?: string}>}
     */
    async runMigrations(projectPath, options = {}) {
        return new Promise((resolve) => {
            const fs = require('fs');

            // Look for prisma schema
            // Frigg apps use the schema from @friggframework/core
            const possibleSchemaPaths = [
                // Project-local prisma schemas
                path.join(projectPath, 'prisma', 'postgresql', 'schema.prisma'),
                path.join(projectPath, 'prisma', 'schema.prisma'),
                // Frigg core schemas (in node_modules)
                path.join(projectPath, 'node_modules', '@friggframework', 'core', 'prisma-postgresql', 'schema.prisma'),
                path.join(projectPath, 'node_modules', '@friggframework', 'core', 'generated', 'prisma-postgresql', 'schema.prisma')
            ];

            let schemaPath = null;
            for (const p of possibleSchemaPaths) {
                if (fs.existsSync(p)) {
                    schemaPath = p;
                    break;
                }
            }

            if (!schemaPath) {
                resolve({ success: false, error: 'No Prisma schema found' });
                return;
            }

            // Find prisma binary - check local node_modules first
            const possiblePrismaPaths = [
                path.join(projectPath, 'node_modules', '.bin', 'prisma'),
                path.join(projectPath, 'node_modules', 'prisma', 'build', 'index.js')
            ];

            let prismaBin = 'npx';
            // Default to 'deploy' mode - non-interactive, just applies existing migrations
            // Use 'dev' only if explicitly requested (which requires interactive terminal)
            const migrateCommand = options.dev ? 'dev' : 'deploy';
            let args = ['prisma', 'migrate', migrateCommand, '--schema', schemaPath];

            // Try to find local prisma binary for pnpm/yarn workspaces
            for (const p of possiblePrismaPaths) {
                if (fs.existsSync(p)) {
                    if (p.endsWith('.js')) {
                        prismaBin = 'node';
                        args = [p, 'migrate', migrateCommand, '--schema', schemaPath];
                    } else {
                        prismaBin = p;
                        args = ['migrate', migrateCommand, '--schema', schemaPath];
                    }
                    break;
                }
            }

            console.log(`   Executing: ${prismaBin} ${args.join(' ')}`);

            const child = spawn(prismaBin, args, {
                cwd: projectPath,
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: prismaBin === 'npx'
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                // Log progress in real-time
                process.stdout.write(text);
            });

            child.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                // Log errors in real-time
                process.stderr.write(text);
            });

            child.on('error', (error) => {
                resolve({
                    success: false,
                    error: `Failed to run migrations: ${error.message}`
                });
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output: stdout });
                } else {
                    resolve({
                        success: false,
                        error: stderr || stdout || `Migration failed with exit code ${code}`
                    });
                }
            });

            // Timeout after 60 seconds for migrations (deploy mode is fast)
            setTimeout(() => {
                child.kill();
                resolve({
                    success: false,
                    error: 'Timeout running migrations (60s)'
                });
            }, 60000);
        });
    }
}

module.exports = { DatabaseAdapter };
