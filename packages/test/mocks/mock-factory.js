/**
 * Mock Factory
 *
 * Centralized factory for creating standardized mocks across the test suite.
 * Follows DDD/Hexagonal Architecture patterns by providing mocks for each layer.
 *
 * Usage:
 *   const { MockFactory } = require('@friggframework/test/mocks/mock-factory');
 *   const mockLogger = MockFactory.createLogger();
 */

class MockFactory {
    /**
     * Create a mock logger
     *
     * Provides standard logging interface used throughout the framework
     */
    static createLogger() {
        return {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            trace: jest.fn(),
        };
    }

    /**
     * Create a mock Cryptor for encryption/decryption operations
     *
     * @param {Object} options - Configuration options
     * @param {boolean} options.shouldSucceed - Whether operations should succeed (default: true)
     */
    static createCryptor({ shouldSucceed = true } = {}) {
        if (shouldSucceed) {
            return {
                encrypt: jest.fn().mockImplementation((data) => `encrypted:${data}`),
                decrypt: jest.fn().mockImplementation((data) => data.replace('encrypted:', '')),
                shouldUseAws: false,
            };
        }

        return {
            encrypt: jest.fn().mockRejectedValue(new Error('Encryption failed')),
            decrypt: jest.fn().mockRejectedValue(new Error('Decryption failed')),
            shouldUseAws: false,
        };
    }

    /**
     * Create a mock mongoose connection
     *
     * @param {Object} options - Configuration options
     * @param {number} options.readyState - Connection state (0=disconnected, 1=connected)
     */
    static createMongooseConnection({ readyState = 1 } = {}) {
        const stateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting',
        };

        return {
            readyState,
            db: {
                admin: () => ({
                    ping: jest.fn().mockResolvedValue({ ok: 1 }),
                }),
            },
            states: stateMap,
        };
    }

    /**
     * Create a mock HTTP request object
     *
     * @param {Object} options - Request properties
     */
    static createRequest({
        method = 'GET',
        url = '/',
        headers = {},
        body = {},
        params = {},
        query = {},
    } = {}) {
        return {
            method,
            url,
            headers,
            body,
            params,
            query,
            get: jest.fn((header) => headers[header.toLowerCase()]),
        };
    }

    /**
     * Create a mock HTTP response object
     */
    static createResponse() {
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            sendStatus: jest.fn().mockReturnThis(),
            set: jest.fn().mockReturnThis(),
            setHeader: jest.fn().mockReturnThis(),
        };

        return res;
    }

    /**
     * Create a mock next function for Express middleware
     */
    static createNext() {
        return jest.fn();
    }

    /**
     * Create a complete mock Express middleware environment
     */
    static createMiddlewareEnvironment(options = {}) {
        return {
            req: this.createRequest(options.req),
            res: this.createResponse(),
            next: this.createNext(),
        };
    }

    /**
     * Create a mock AWS KMS client
     *
     * @param {Object} options - Configuration options
     * @param {boolean} options.shouldSucceed - Whether operations should succeed
     */
    static createKMSClient({ shouldSucceed = true } = {}) {
        if (shouldSucceed) {
            return {
                encrypt: jest.fn().mockResolvedValue({
                    CiphertextBlob: Buffer.from('encrypted-data'),
                }),
                decrypt: jest.fn().mockResolvedValue({
                    Plaintext: Buffer.from('decrypted-data'),
                }),
                generateDataKey: jest.fn().mockResolvedValue({
                    Plaintext: Buffer.from('data-key'),
                    CiphertextBlob: Buffer.from('encrypted-data-key'),
                }),
            };
        }

        return {
            encrypt: jest.fn().mockRejectedValue(new Error('KMS encryption failed')),
            decrypt: jest.fn().mockRejectedValue(new Error('KMS decryption failed')),
            generateDataKey: jest.fn().mockRejectedValue(new Error('KMS key generation failed')),
        };
    }

    /**
     * Create a mock SQS client
     */
    static createSQSClient({ shouldSucceed = true } = {}) {
        if (shouldSucceed) {
            return {
                sendMessage: jest.fn().mockResolvedValue({
                    MessageId: 'mock-message-id',
                }),
                receiveMessage: jest.fn().mockResolvedValue({
                    Messages: [],
                }),
                deleteMessage: jest.fn().mockResolvedValue({}),
            };
        }

        return {
            sendMessage: jest.fn().mockRejectedValue(new Error('SQS send failed')),
            receiveMessage: jest.fn().mockRejectedValue(new Error('SQS receive failed')),
            deleteMessage: jest.fn().mockRejectedValue(new Error('SQS delete failed')),
        };
    }

    /**
     * Create a mock repository
     *
     * @param {Object} methods - Methods to include in the repository
     */
    static createRepository(methods = {}) {
        return {
            findById: jest.fn(),
            findAll: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            ...methods,
        };
    }

    /**
     * Create a mock use case
     *
     * @param {Object} options - Configuration options
     * @param {Function} options.execute - Execute function implementation
     */
    static createUseCase({ execute = jest.fn() } = {}) {
        return {
            execute,
        };
    }

    /**
     * Create mock integration configuration
     */
    static createIntegrationConfig({
        name = 'test-integration',
        oauth = {},
        webhooks = [],
    } = {}) {
        return {
            name,
            oauth: {
                authorizationUrl: 'https://example.com/oauth/authorize',
                tokenUrl: 'https://example.com/oauth/token',
                scopes: ['read', 'write'],
                ...oauth,
            },
            webhooks,
        };
    }

    /**
     * Create a complete mock test environment
     *
     * Provides all commonly needed mocks in one object
     */
    static createMockEnvironment({
        logger = true,
        cryptor = true,
        prismaClient = false,
        kmsClient = false,
        sqsClient = false,
    } = {}) {
        const env = {};

        if (logger) {
            env.logger = this.createLogger();
        }

        if (cryptor) {
            env.cryptor = this.createCryptor();
        }

        if (prismaClient) {
            const { createMockPrismaClient } = require('./mock-prisma-client');
            env.prismaClient = createMockPrismaClient();
        }

        if (kmsClient) {
            env.kmsClient = this.createKMSClient();
        }

        if (sqsClient) {
            env.sqsClient = this.createSQSClient();
        }

        return env;
    }
}

module.exports = { MockFactory };
