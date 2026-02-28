/**
 * DatabaseAdapter Tests
 * Infrastructure adapter for database connectivity checks
 *
 * Tests follow TDD pattern - written BEFORE implementation
 */

// Mock net module for TCP connection testing
jest.mock('net', () => ({
    createConnection: jest.fn()
}));

const net = require('net');

// Import after mocks
const { DatabaseAdapter } = require('../../../../start-command/infrastructure/DatabaseAdapter');

describe('DatabaseAdapter', () => {
    let adapter;

    beforeEach(() => {
        jest.clearAllMocks();
        adapter = new DatabaseAdapter();
    });

    describe('parseConnectionString()', () => {
        describe('MongoDB connection strings', () => {
            it('should parse mongodb:// connection string', () => {
                const url = 'mongodb://localhost:27017/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('mongodb');
                expect(result.host).toBe('localhost');
                expect(result.port).toBe(27017);
                expect(result.database).toBe('frigg');
            });

            it('should parse mongodb+srv:// connection string', () => {
                const url = 'mongodb+srv://cluster.mongodb.net/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('mongodb');
                expect(result.host).toBe('cluster.mongodb.net');
                expect(result.port).toBe(27017); // Default MongoDB port
                expect(result.database).toBe('frigg');
            });

            it('should parse mongodb connection with authentication', () => {
                const url = 'mongodb://user:password@localhost:27017/frigg?authSource=admin';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('mongodb');
                expect(result.host).toBe('localhost');
                expect(result.port).toBe(27017);
                expect(result.database).toBe('frigg');
                expect(result.user).toBe('user');
            });

            it('should use default port 27017 for mongodb without port', () => {
                const url = 'mongodb://localhost/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.port).toBe(27017);
            });

            it('should handle replica set connection string', () => {
                const url = 'mongodb://mongo1:27017,mongo2:27017,mongo3:27017/frigg?replicaSet=rs0';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('mongodb');
                expect(result.host).toBe('mongo1'); // First host
                expect(result.port).toBe(27017);
            });
        });

        describe('PostgreSQL connection strings', () => {
            it('should parse postgresql:// connection string', () => {
                const url = 'postgresql://localhost:5432/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('postgresql');
                expect(result.host).toBe('localhost');
                expect(result.port).toBe(5432);
                expect(result.database).toBe('frigg');
            });

            it('should parse postgres:// connection string (alias)', () => {
                const url = 'postgres://localhost:5432/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('postgresql');
                expect(result.host).toBe('localhost');
                expect(result.port).toBe(5432);
            });

            it('should parse postgresql connection with authentication', () => {
                const url = 'postgresql://user:password@localhost:5432/frigg?schema=public';
                const result = adapter.parseConnectionString(url);

                expect(result.type).toBe('postgresql');
                expect(result.host).toBe('localhost');
                expect(result.port).toBe(5432);
                expect(result.user).toBe('user');
            });

            it('should use default port 5432 for postgresql without port', () => {
                const url = 'postgresql://localhost/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.port).toBe(5432);
            });
        });

        describe('Invalid connection strings', () => {
            it('should return error for unknown protocol', () => {
                const url = 'mysql://localhost:3306/frigg';
                const result = adapter.parseConnectionString(url);

                expect(result.error).toBeDefined();
                expect(result.error).toContain('Unsupported database type');
            });

            it('should return error for malformed URL', () => {
                const url = 'not-a-valid-url';
                const result = adapter.parseConnectionString(url);

                expect(result.error).toBeDefined();
            });

            it('should return error for empty string', () => {
                const result = adapter.parseConnectionString('');

                expect(result.error).toBeDefined();
            });

            it('should return error for null', () => {
                const result = adapter.parseConnectionString(null);

                expect(result.error).toBeDefined();
            });
        });
    });

    describe('getDatabaseType()', () => {
        it('should return mongodb for mongodb:// URLs', () => {
            const url = 'mongodb://localhost:27017/frigg';
            const result = adapter.getDatabaseType(url);

            expect(result).toBe('mongodb');
        });

        it('should return mongodb for mongodb+srv:// URLs', () => {
            const url = 'mongodb+srv://cluster.mongodb.net/frigg';
            const result = adapter.getDatabaseType(url);

            expect(result).toBe('mongodb');
        });

        it('should return postgresql for postgresql:// URLs', () => {
            const url = 'postgresql://localhost:5432/frigg';
            const result = adapter.getDatabaseType(url);

            expect(result).toBe('postgresql');
        });

        it('should return postgresql for postgres:// URLs', () => {
            const url = 'postgres://localhost:5432/frigg';
            const result = adapter.getDatabaseType(url);

            expect(result).toBe('postgresql');
        });

        it('should return null for unknown database types', () => {
            const url = 'mysql://localhost:3306/frigg';
            const result = adapter.getDatabaseType(url);

            expect(result).toBeNull();
        });
    });

    describe('isPortReachable()', () => {
        let mockSocket;

        beforeEach(() => {
            mockSocket = {
                on: jest.fn(),
                destroy: jest.fn(),
                setTimeout: jest.fn()
            };
            net.createConnection.mockReturnValue(mockSocket);
        });

        it('should return true when port is reachable', async () => {
            // Simulate successful connection
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'connect') {
                    setTimeout(() => callback(), 10);
                }
                return mockSocket;
            });

            const result = await adapter.isPortReachable('localhost', 27017);

            expect(result).toBe(true);
            expect(mockSocket.destroy).toHaveBeenCalled();
        });

        it('should return false when connection is refused', async () => {
            // Simulate connection refused
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setTimeout(() => callback(new Error('ECONNREFUSED')), 10);
                }
                return mockSocket;
            });

            const result = await adapter.isPortReachable('localhost', 27017);

            expect(result).toBe(false);
        });

        it('should return false when connection times out', async () => {
            // Simulate timeout
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'timeout') {
                    setTimeout(() => callback(), 10);
                }
                return mockSocket;
            });

            const result = await adapter.isPortReachable('localhost', 27017, 100);

            expect(result).toBe(false);
        });

        it('should use custom timeout value', async () => {
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'connect') {
                    setTimeout(() => callback(), 10);
                }
                return mockSocket;
            });

            await adapter.isPortReachable('localhost', 27017, 5000);

            expect(mockSocket.setTimeout).toHaveBeenCalledWith(5000);
        });

        it('should use default timeout of 3000ms', async () => {
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'connect') {
                    setTimeout(() => callback(), 10);
                }
                return mockSocket;
            });

            await adapter.isPortReachable('localhost', 27017);

            expect(mockSocket.setTimeout).toHaveBeenCalledWith(3000);
        });
    });

    describe('isDatabaseReachable()', () => {
        let mockSocket;

        beforeEach(() => {
            mockSocket = {
                on: jest.fn(),
                destroy: jest.fn(),
                setTimeout: jest.fn()
            };
            net.createConnection.mockReturnValue(mockSocket);
        });

        it('should return reachable: true when database port is open', async () => {
            // Simulate successful connection
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'connect') {
                    setTimeout(() => callback(), 10);
                }
                return mockSocket;
            });

            const result = await adapter.isDatabaseReachable('mongodb://localhost:27017/frigg');

            expect(result.reachable).toBe(true);
            expect(result.host).toBe('localhost');
            expect(result.port).toBe(27017);
        });

        it('should return reachable: false when database port is closed', async () => {
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'error') {
                    setTimeout(() => callback(new Error('ECONNREFUSED')), 10);
                }
                return mockSocket;
            });

            const result = await adapter.isDatabaseReachable('mongodb://localhost:27017/frigg');

            expect(result.reachable).toBe(false);
            expect(result.error).toContain('ECONNREFUSED');
        });

        it('should return error for invalid connection string', async () => {
            const result = await adapter.isDatabaseReachable('not-valid');

            expect(result.reachable).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should include database type in result', async () => {
            mockSocket.on.mockImplementation((event, callback) => {
                if (event === 'connect') {
                    setTimeout(() => callback(), 10);
                }
                return mockSocket;
            });

            const result = await adapter.isDatabaseReachable('postgresql://localhost:5432/frigg');

            expect(result.type).toBe('postgresql');
        });
    });

    describe('getConnectionDetails()', () => {
        it('should extract all connection details from MongoDB URL', () => {
            const url = 'mongodb://user:pass@localhost:27017/frigg?replicaSet=rs0';
            const result = adapter.getConnectionDetails(url);

            expect(result).toEqual({
                type: 'mongodb',
                host: 'localhost',
                port: 27017,
                database: 'frigg',
                user: 'user',
                hasCredentials: true
            });
        });

        it('should extract all connection details from PostgreSQL URL', () => {
            const url = 'postgresql://user:pass@localhost:5432/frigg?schema=public';
            const result = adapter.getConnectionDetails(url);

            expect(result).toEqual({
                type: 'postgresql',
                host: 'localhost',
                port: 5432,
                database: 'frigg',
                user: 'user',
                hasCredentials: true
            });
        });

        it('should indicate no credentials when not provided', () => {
            const url = 'mongodb://localhost:27017/frigg';
            const result = adapter.getConnectionDetails(url);

            expect(result.hasCredentials).toBe(false);
            expect(result.user).toBeUndefined();
        });

        it('should return error object for invalid URL', () => {
            const result = adapter.getConnectionDetails('invalid');

            expect(result.error).toBeDefined();
        });
    });

    describe('suggestDockerService()', () => {
        it('should suggest mongodb service for MongoDB database', () => {
            const result = adapter.suggestDockerService('mongodb');

            expect(result).toEqual({
                serviceName: 'mongodb',
                image: 'mongo:7',
                port: 27017,
                envVars: expect.objectContaining({
                    MONGO_INITDB_DATABASE: 'frigg'
                })
            });
        });

        it('should suggest postgres service for PostgreSQL database', () => {
            const result = adapter.suggestDockerService('postgresql');

            expect(result).toEqual({
                serviceName: 'postgres',
                image: 'postgres:16',
                port: 5432,
                envVars: expect.objectContaining({
                    POSTGRES_DB: 'frigg',
                    POSTGRES_USER: expect.any(String),
                    POSTGRES_PASSWORD: expect.any(String)
                })
            });
        });

        it('should return null for unknown database type', () => {
            const result = adapter.suggestDockerService('mysql');

            expect(result).toBeNull();
        });
    });
});
