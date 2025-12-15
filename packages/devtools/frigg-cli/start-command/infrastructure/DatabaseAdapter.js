/**
 * DatabaseAdapter - Infrastructure adapter for database connectivity checks
 *
 * Provides methods to parse connection strings and test database reachability
 * Used by pre-flight checks to verify database infrastructure is ready
 */

const net = require('net');

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
}

module.exports = { DatabaseAdapter };
