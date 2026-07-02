jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

class TestAuthIntegration extends IntegrationBase {
    static Definition = {
        ...IntegrationBase.Definition,
        modules: { testmodule: {} },
    };
}

describe('IntegrationBase.testAuth', () => {
    let integration;
    let mockUpdateIntegrationStatus;
    let mockUpdateIntegrationMessages;

    beforeEach(() => {
        integration = new TestAuthIntegration();
        integration.id = 'int-1';
        integration.status = 'ENABLED';

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        mockUpdateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;
        integration.updateIntegrationMessages = mockUpdateIntegrationMessages;

        // Shaped like a real Module instance: getName() is defined on the
        // instance itself (Module.prototype.getName() returns this.name),
        // not on the constructor.
        integration.testmodule = {
            testAuth: jest.fn().mockResolvedValue(true),
            getName: () => 'testmodule',
        };
    });

    it("flips ERROR to ENABLED when every module's auth check passes", async () => {
        integration.status = 'ERROR';

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it('does not touch status when auth passes and the integration is already ENABLED', async () => {
        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('ENABLED');
    });

    it.each(['NEEDS_CONFIG', 'DISABLED', 'PROCESSING'])(
        'does not heal %s when auth passes',
        async (status) => {
            integration.status = status;

            await integration.testAuth();

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe(status);
        }
    );

    it('sets ERROR when a module auth check throws', async () => {
        integration.testmodule.testAuth.mockRejectedValue(
            new Error('bad creds')
        );

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(integration.status).toBe('ERROR');
    });

    it('keeps ERROR when a currently-ERROR integration still throws on auth', async () => {
        integration.status = 'ERROR';
        integration.testmodule.testAuth.mockRejectedValue(
            new Error('bad creds')
        );

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(integration.status).toBe('ERROR');
    });

    it('sets ERROR when a module resolves false (the real Module.testAuth contract on bad credentials)', async () => {
        // Module.testAuth() catches its own request failures and resolves
        // false rather than rejecting — this is how real modules (Attio,
        // AxisCare, HouseCallPro) report a 401. A resolved false must be
        // treated the same as a thrown error.
        integration.testmodule.testAuth.mockResolvedValue(false);

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(integration.status).toBe('ERROR');
    });

    it('records the failing module name in the error message without crashing', async () => {
        // Regression: the error-message builder used to read
        // this[module].constructor.getName(), which does not exist on a real
        // Module instance (getName() is an instance method) — every genuine
        // auth failure crashed here instead of recording the error.
        integration.testmodule.testAuth.mockResolvedValue(false);

        await integration.testAuth();

        expect(mockUpdateIntegrationMessages.execute).toHaveBeenCalledWith(
            'int-1',
            'errors',
            'Authentication Error',
            expect.stringContaining('testmodule'),
            expect.any(Number)
        );
    });

    it('does not heal ERROR to ENABLED when a module resolves false', async () => {
        integration.status = 'ERROR';
        integration.testmodule.testAuth.mockResolvedValue(false);

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ERROR');
    });
});
