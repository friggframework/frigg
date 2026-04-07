/**
 * Admin Auth Middleware Tests
 *
 * Shared middleware for all admin endpoints (db-migrate, scripts, etc.)
 */

describe('Admin Auth Middleware', () => {
    let validateAdminApiKey;
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        jest.resetModules();
        process.env.ADMIN_API_KEY = 'test-admin-key-12345';

        validateAdminApiKey = require('../admin-auth').validateAdminApiKey;

        mockReq = {
            headers: {}
        };
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
        mockNext = jest.fn();
    });

    afterEach(() => {
        delete process.env.ADMIN_API_KEY;
    });

    describe('validateAdminApiKey', () => {
        it('should call next() when valid API key is provided', () => {
            mockReq.headers['x-frigg-admin-api-key'] = 'test-admin-key-12345';

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        it('should return 401 when API key header is missing', () => {
            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'x-frigg-admin-api-key header required'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when API key is invalid', () => {
            mockReq.headers['x-frigg-admin-api-key'] = 'wrong-key';

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Invalid admin API key'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when ADMIN_API_KEY env var is not set', () => {
            delete process.env.ADMIN_API_KEY;
            mockReq.headers['x-frigg-admin-api-key'] = 'any-key';

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Admin API key not configured'
            });
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should return 401 when API key is empty string', () => {
            mockReq.headers['x-frigg-admin-api-key'] = '';

            validateAdminApiKey(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
});
