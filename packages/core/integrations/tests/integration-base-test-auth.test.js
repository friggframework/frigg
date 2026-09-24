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

    it('returns true when every module authenticates', async () => {
        await expect(integration.testAuth()).resolves.toBe(true);
    });

    it('returns false when a module throws', async () => {
        integration.testmodule.testAuth.mockRejectedValue(
            new Error('bad creds')
        );

        await expect(integration.testAuth()).resolves.toBe(false);
    });

    it('returns false when a module resolves false (the real Module.testAuth contract on bad credentials)', async () => {
        // Module.testAuth() catches its own request failures and resolves
        // false rather than rejecting — this is how real modules (Attio,
        // AxisCare, HouseCallPro) report a 401.
        integration.testmodule.testAuth.mockResolvedValue(false);

        await expect(integration.testAuth()).resolves.toBe(false);
    });

    it('records the failing module name in an error message without crashing', async () => {
        // Regression: the message builder used to read
        // this[module].constructor.getName(), which does not exist on a real
        // Module instance (getName() is an instance method).
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

    it('does not change integration status on success', async () => {
        integration.status = 'ERROR';

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('ERROR');
    });

    it('does not change integration status on failure', async () => {
        integration.testmodule.testAuth.mockResolvedValue(false);

        await integration.testAuth();

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('ENABLED');
    });
});
