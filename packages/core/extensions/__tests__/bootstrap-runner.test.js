const { runExtensionBootstraps } = require('../bootstrap-runner');

describe('Bootstrap Runner', () => {
    it('should do nothing with no extensions', async () => {
        await expect(runExtensionBootstraps([])).resolves.toBeUndefined();
        await expect(runExtensionBootstraps(null)).resolves.toBeUndefined();
        await expect(runExtensionBootstraps(undefined)).resolves.toBeUndefined();
    });

    it('should skip extensions without bootstrap', async () => {
        const extensions = [
            { name: 'no-bootstrap', bootstrap: null },
            { name: 'also-no-bootstrap' },
        ];
        await expect(runExtensionBootstraps(extensions)).resolves.toBeUndefined();
    });

    it('should call bootstrap with prisma and appDefinition', async () => {
        const bootstrapFn = jest.fn();
        const mockPrisma = { $connect: jest.fn() };
        const mockAppDef = { name: 'test-app' };

        await runExtensionBootstraps(
            [{ name: 'test-ext', bootstrap: bootstrapFn }],
            { prisma: mockPrisma, appDefinition: mockAppDef }
        );

        expect(bootstrapFn).toHaveBeenCalledTimes(1);
        expect(bootstrapFn).toHaveBeenCalledWith(mockPrisma, mockAppDef);
    });

    it('should run multiple bootstraps in sequence', async () => {
        const order = [];
        const ext1 = {
            name: 'ext-1',
            bootstrap: jest.fn(async () => {
                order.push('ext-1');
            }),
        };
        const ext2 = {
            name: 'ext-2',
            bootstrap: jest.fn(async () => {
                order.push('ext-2');
            }),
        };

        await runExtensionBootstraps([ext1, ext2], {});
        expect(order).toEqual(['ext-1', 'ext-2']);
    });

    it('should fail fast on bootstrap error with extension name', async () => {
        const failingExt = {
            name: 'broken-ext',
            bootstrap: jest.fn(async () => {
                throw new Error('DB connection failed');
            }),
        };
        const neverCalled = {
            name: 'skipped',
            bootstrap: jest.fn(),
        };

        await expect(
            runExtensionBootstraps([failingExt, neverCalled], {})
        ).rejects.toThrow('Extension "broken-ext" bootstrap failed');

        expect(neverCalled.bootstrap).not.toHaveBeenCalled();
    });
});
