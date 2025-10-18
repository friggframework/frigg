/**
 * Tests for CheckIntegrationsHealthUseCase
 * 
 * Tests integration and module factory health checking
 */

const { CheckIntegrationsHealthUseCase } = require('./check-integrations-health-use-case');

describe('CheckIntegrationsHealthUseCase', () => {
    describe('execute()', () => {
        it('should return healthy status with module and integration counts', () => {
            const mockModuleFactory = {
                moduleTypes: ['HubSpot', 'Salesforce', 'Slack'],
            };

            const mockIntegrationFactory = {
                integrationTypes: ['HubSpot-to-Salesforce', 'Slack-Notifications'],
            };

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationFactory: mockIntegrationFactory,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(3);
            expect(result.modules.available).toEqual(['HubSpot', 'Salesforce', 'Slack']);
            expect(result.integrations.count).toBe(2);
            expect(result.integrations.available).toEqual(['HubSpot-to-Salesforce', 'Slack-Notifications']);
        });

        it('should handle undefined moduleFactory gracefully', () => {
            const mockIntegrationFactory = {
                integrationTypes: ['Integration1'],
            };

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: undefined,
                integrationFactory: mockIntegrationFactory,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
            expect(result.integrations.count).toBe(1);
        });

        it('should handle undefined integrationFactory gracefully', () => {
            const mockModuleFactory = {
                moduleTypes: ['Module1'],
            };

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationFactory: undefined,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(1);
            expect(result.integrations.count).toBe(0);
            expect(result.integrations.available).toEqual([]);
        });

        it('should handle both factories being undefined', () => {
            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: undefined,
                integrationFactory: undefined,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
            expect(result.integrations.count).toBe(0);
            expect(result.integrations.available).toEqual([]);
        });

        it('should handle non-array moduleTypes', () => {
            const mockModuleFactory = {
                moduleTypes: 'not-an-array',
            };

            const mockIntegrationFactory = {
                integrationTypes: [],
            };

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationFactory: mockIntegrationFactory,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
        });

        it('should handle factories with missing moduleTypes/integrationTypes properties', () => {
            const mockModuleFactory = {}; // No moduleTypes property
            const mockIntegrationFactory = {}; // No integrationTypes property

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationFactory: mockIntegrationFactory,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
            expect(result.integrations.count).toBe(0);
            expect(result.integrations.available).toEqual([]);
        });
    });
});

