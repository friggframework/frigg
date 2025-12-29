const { adminAuthMiddleware } = require('../admin-auth-middleware');

// Mock the admin script commands
jest.mock('@friggframework/core/application/commands/admin-script-commands', () => ({
    createAdminScriptCommands: jest.fn(),
}));

const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');

describe('adminAuthMiddleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;
    let mockCommands;

    beforeEach(() => {
        mockReq = {
            headers: {},
            ip: '127.0.0.1',
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        mockNext = jest.fn();

        mockCommands = {
            validateAdminApiKey: jest.fn(),
        };

        createAdminScriptCommands.mockReturnValue(mockCommands);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Authorization header validation', () => {
        it('should reject request without Authorization header', async () => {
            await adminAuthMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Missing or invalid Authorization header',
                code: 'MISSING_AUTH',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request with invalid Authorization format', async () => {
            mockReq.headers.authorization = 'InvalidFormat key123';

            await adminAuthMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Missing or invalid Authorization header',
                code: 'MISSING_AUTH',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('API key validation', () => {
        it('should reject request with invalid API key', async () => {
            mockReq.headers.authorization = 'Bearer invalid-key';
            mockCommands.validateAdminApiKey.mockResolvedValue({
                error: 401,
                reason: 'Invalid API key',
                code: 'INVALID_API_KEY',
            });

            await adminAuthMiddleware(mockReq, mockRes, mockNext);

            expect(mockCommands.validateAdminApiKey).toHaveBeenCalledWith('invalid-key');
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Invalid API key',
                code: 'INVALID_API_KEY',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request with expired API key', async () => {
            mockReq.headers.authorization = 'Bearer expired-key';
            mockCommands.validateAdminApiKey.mockResolvedValue({
                error: 401,
                reason: 'API key has expired',
                code: 'EXPIRED_API_KEY',
            });

            await adminAuthMiddleware(mockReq, mockRes, mockNext);

            expect(mockCommands.validateAdminApiKey).toHaveBeenCalledWith('expired-key');
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'API key has expired',
                code: 'EXPIRED_API_KEY',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should accept request with valid API key', async () => {
            const validKey = 'valid-api-key-123';
            mockReq.headers.authorization = `Bearer ${validKey}`;
            mockCommands.validateAdminApiKey.mockResolvedValue({
                valid: true,
                apiKey: {
                    id: 'key-id-1',
                    name: 'test-key',
                    keyLast4: 'e123',
                },
            });

            await adminAuthMiddleware(mockReq, mockRes, mockNext);

            expect(mockCommands.validateAdminApiKey).toHaveBeenCalledWith(validKey);
            expect(mockReq.adminApiKey).toBeDefined();
            expect(mockReq.adminApiKey.name).toBe('test-key');
            expect(mockReq.adminAudit).toBeDefined();
            expect(mockReq.adminAudit.apiKeyName).toBe('test-key');
            expect(mockReq.adminAudit.apiKeyLast4).toBe('e123');
            expect(mockReq.adminAudit.ipAddress).toBe('127.0.0.1');
            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });
    });

    describe('Error handling', () => {
        it('should handle validation errors gracefully', async () => {
            mockReq.headers.authorization = 'Bearer some-key';
            mockCommands.validateAdminApiKey.mockRejectedValue(
                new Error('Database error')
            );

            await adminAuthMiddleware(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Authentication failed',
                code: 'AUTH_ERROR',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
