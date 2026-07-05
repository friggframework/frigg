const { validateAdminApiKey } = require('../admin-auth-middleware');

describe('validateAdminApiKey', () => {
    let mockReq;
    let mockRes;
    let mockNext;
    let originalEnv;

    beforeEach(() => {
        originalEnv = process.env.ADMIN_API_KEY;
        process.env.ADMIN_API_KEY = 'test-admin-key-123';

        mockReq = {
            headers: {},
        };

        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        mockNext = jest.fn();
    });

    afterEach(() => {
        if (originalEnv) {
            process.env.ADMIN_API_KEY = originalEnv;
        } else {
            delete process.env.ADMIN_API_KEY;
        }
        jest.clearAllMocks();
    });

    describe('Environment configuration', () => {
        it('should reject when ADMIN_API_KEY not configured', () => {
            delete process.env.ADMIN_API_KEY;

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Admin API key not configured',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('Header validation', () => {
        it('should reject request without x-frigg-admin-api-key header', () => {
            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'x-frigg-admin-api-key header required',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('API key validation', () => {
        it('should reject request with invalid API key', () => {
            mockReq.headers['x-frigg-admin-api-key'] = 'invalid-key';

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Invalid admin API key',
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should accept request with valid API key', () => {
            mockReq.headers['x-frigg-admin-api-key'] = 'test-admin-key-123';

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });
    });
});
