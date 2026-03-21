const { initializeApp, resetInitialization } = require('../initialize-app');

// Mock the dependencies
jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: jest.fn(),
}));

jest.mock('../../database/prisma', () => ({
    prisma: { $connect: jest.fn() },
}));

const { loadAppDefinition } = require('../../handlers/app-definition-loader');
const { prisma } = require('../../database/prisma');

describe('initializeApp', () => {
    beforeEach(() => {
        resetInitialization();
        jest.clearAllMocks();
    });

    it('should return empty extensions when no app definition', async () => {
        loadAppDefinition.mockImplementation(() => {
            throw new Error('Not found');
        });

        const result = await initializeApp();
        expect(result.extensions).toEqual([]);
    });

    it('should return empty extensions when app definition has no extensions', async () => {
        loadAppDefinition.mockReturnValue({
            appDefinition: { name: 'test-app' },
        });

        const result = await initializeApp();
        expect(result.extensions).toEqual([]);
    });

    it('should load and run bootstrap hooks', async () => {
        const bootstrapFn = jest.fn();

        loadAppDefinition.mockReturnValue({
            appDefinition: {
                name: 'test-app',
                extensions: [
                    {
                        name: 'test-ext',
                        bootstrap: bootstrapFn,
                    },
                ],
            },
        });

        const result = await initializeApp();

        expect(result.extensions).toHaveLength(1);
        expect(result.extensions[0].name).toBe('test-ext');
        expect(bootstrapFn).toHaveBeenCalledWith(prisma, expect.objectContaining({
            name: 'test-app',
        }));
    });

    it('should only initialize once (idempotent)', async () => {
        const bootstrapFn = jest.fn();

        loadAppDefinition.mockReturnValue({
            appDefinition: {
                name: 'test-app',
                extensions: [{ name: 'ext', bootstrap: bootstrapFn }],
            },
        });

        await initializeApp();
        await initializeApp();

        expect(bootstrapFn).toHaveBeenCalledTimes(1);
    });

    it('should re-initialize when force=true', async () => {
        const bootstrapFn = jest.fn();

        loadAppDefinition.mockReturnValue({
            appDefinition: {
                name: 'test-app',
                extensions: [{ name: 'ext', bootstrap: bootstrapFn }],
            },
        });

        await initializeApp();
        await initializeApp({ force: true });

        expect(bootstrapFn).toHaveBeenCalledTimes(2);
    });

    it('should accept overridden appDefinition and prisma', async () => {
        const bootstrapFn = jest.fn();
        const customPrisma = { custom: true };
        const customAppDef = {
            name: 'custom',
            extensions: [{ name: 'ext', bootstrap: bootstrapFn }],
        };

        const result = await initializeApp({
            appDefinition: customAppDef,
            prisma: customPrisma,
        });

        expect(bootstrapFn).toHaveBeenCalledWith(customPrisma, customAppDef);
        expect(result.extensions).toHaveLength(1);
        // loadAppDefinition should NOT have been called
        expect(loadAppDefinition).not.toHaveBeenCalled();
    });

    it('should propagate bootstrap errors', async () => {
        loadAppDefinition.mockReturnValue({
            appDefinition: {
                name: 'test-app',
                extensions: [
                    {
                        name: 'failing-ext',
                        bootstrap: async () => {
                            throw new Error('Bootstrap failed');
                        },
                    },
                ],
            },
        });

        await expect(initializeApp()).rejects.toThrow('failing-ext');
    });

    it('should allow re-initialization after error', async () => {
        let callCount = 0;
        const bootstrapFn = jest.fn(async () => {
            callCount++;
            if (callCount === 1) throw new Error('First call fails');
        });

        loadAppDefinition.mockReturnValue({
            appDefinition: {
                extensions: [{ name: 'retry-ext', bootstrap: bootstrapFn }],
            },
        });

        await expect(initializeApp()).rejects.toThrow();

        // Second call should work
        await initializeApp();
        expect(bootstrapFn).toHaveBeenCalledTimes(2);
    });
});
