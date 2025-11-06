jest.mock('../logs', () => ({
    initDebugLog: jest.fn(),
    flushDebugLog: jest.fn(),
}));

jest.mock('./secrets-to-env', () => ({
    secretsToEnv: jest.fn().mockResolvedValue(undefined),
}));

describe('createHandler', () => {
    let createHandler;
    let mockMethod;
    let mockEvent;
    let mockContext;
    let mockDatabaseInitializer;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules();
        
        // Fresh import to reset module state
        ({ createHandler } = require('./create-handler'));
        
        mockDatabaseInitializer = jest.fn().mockResolvedValue(undefined);
        mockMethod = jest.fn().mockResolvedValue({ statusCode: 200, body: 'OK' });
        mockEvent = {
            httpMethod: 'GET',
            path: '/test',
        };
        mockContext = {
            callbackWaitsForEmptyEventLoop: true,
        };
    });

    describe('Database initialization', () => {
        it('should initialize database via injected adapter', async () => {
            const handler = createHandler({
                eventName: 'TestEvent',
                method: mockMethod,
                shouldUseDatabase: true,
                databaseInitializer: mockDatabaseInitializer,
            });

            await handler(mockEvent, mockContext);

            expect(mockDatabaseInitializer).toHaveBeenCalledTimes(1);
            expect(mockMethod).toHaveBeenCalled();
        });

        it('should NOT initialize database when shouldUseDatabase=false', async () => {
            const handler = createHandler({
                eventName: 'TestEvent',
                method: mockMethod,
                shouldUseDatabase: false,
                databaseInitializer: mockDatabaseInitializer,
            });

            await handler(mockEvent, mockContext);

            expect(mockDatabaseInitializer).not.toHaveBeenCalled();
            expect(mockMethod).toHaveBeenCalled();
        });

        it('should default to shouldUseDatabase=true for backwards compatibility', async () => {
            const handler = createHandler({
                eventName: 'TestEvent',
                method: mockMethod,
                databaseInitializer: mockDatabaseInitializer,
                // shouldUseDatabase not specified
            });

            await handler(mockEvent, mockContext);

            expect(mockDatabaseInitializer).toHaveBeenCalled();
        });

        it('should only initialize once across multiple invocations', async () => {
            const handler = createHandler({
                eventName: 'TestEvent',
                method: mockMethod,
                shouldUseDatabase: true,
                databaseInitializer: mockDatabaseInitializer,
            });

            await handler(mockEvent, mockContext);
            await handler(mockEvent, mockContext);
            await handler(mockEvent, mockContext);

            expect(mockDatabaseInitializer).toHaveBeenCalledTimes(1);
        });

        it('should retry initialization on failure', async () => {
            mockDatabaseInitializer
                .mockRejectedValueOnce(new Error('Connection failed'))
                .mockResolvedValueOnce(undefined);

            const handler = createHandler({
                eventName: 'TestEvent',
                method: mockMethod,
                shouldUseDatabase: true,
                databaseInitializer: mockDatabaseInitializer,
            });

            await expect(handler(mockEvent, mockContext)).rejects.toThrow('Connection failed');
            await handler(mockEvent, mockContext);

            expect(mockDatabaseInitializer).toHaveBeenCalledTimes(2);
            expect(mockMethod).toHaveBeenCalledTimes(1);
        });

        it('should initialize before calling handler method', async () => {
            const callOrder = [];

            mockDatabaseInitializer.mockImplementation(async () => {
                callOrder.push('db');
            });

            mockMethod.mockImplementation(async () => {
                callOrder.push('handler');
                return { statusCode: 200 };
            });

            const handler = createHandler({
                eventName: 'TestEvent',
                method: mockMethod,
                shouldUseDatabase: true,
                databaseInitializer: mockDatabaseInitializer,
            });

            await handler(mockEvent, mockContext);

            expect(callOrder).toEqual(['db', 'handler']);
        });
    });

    describe('Error handling', () => {
        it('should return 500 for user-facing errors', async () => {
            mockDatabaseInitializer.mockRejectedValueOnce(new Error('DB failed'));

            const handler = createHandler({
                method: mockMethod,
                isUserFacingResponse: true,
                databaseInitializer: mockDatabaseInitializer,
            });

            const response = await handler(mockEvent, mockContext);

            expect(response).toEqual({
                statusCode: 500,
                body: JSON.stringify({ error: 'An Internal Error Occurred' }),
            });
            expect(mockMethod).not.toHaveBeenCalled();
        });

        it('should throw for server-to-server errors', async () => {
            mockDatabaseInitializer.mockRejectedValueOnce(new Error('DB failed'));

            const handler = createHandler({
                method: mockMethod,
                isUserFacingResponse: false,
                databaseInitializer: mockDatabaseInitializer,
            });

            await expect(handler(mockEvent, mockContext)).rejects.toThrow('DB failed');
            expect(mockMethod).not.toHaveBeenCalled();
        });
    });

    describe('Integration', () => {
        it('should call secretsToEnv before database init', async () => {
            const { secretsToEnv } = require('./secrets-to-env');
            const callOrder = [];

            secretsToEnv.mockImplementation(async () => {
                callOrder.push('secrets');
            });

            mockDatabaseInitializer.mockImplementation(async () => {
                callOrder.push('db');
            });

            const handler = createHandler({
                method: mockMethod,
                databaseInitializer: mockDatabaseInitializer,
            });

            await handler(mockEvent, mockContext);

            expect(callOrder).toEqual(['secrets', 'db']);
        });

        it('should set callbackWaitsForEmptyEventLoop=false', async () => {
            const handler = createHandler({
                method: mockMethod,
                databaseInitializer: mockDatabaseInitializer,
            });

            await handler(mockEvent, mockContext);

            expect(mockContext.callbackWaitsForEmptyEventLoop).toBe(false);
        });
    });

    describe('Validation', () => {
        it('should require method parameter', () => {
            expect(() => {
                createHandler({ eventName: 'Test' });
            }).toThrow('Method is required for handler.');
        });
    });
});

