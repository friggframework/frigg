/**
 * Tests for CheckIntegrationsHealthUseCase
 *
 * Tests integration and module factory health checking
 */

import { CheckIntegrationsHealthUseCase } from './check-integrations-health-use-case';

describe('CheckIntegrationsHealthUseCase', () => {
    describe('execute()', () => {
        it('should return healthy status with module and integration counts', () => {
            const mockModuleFactory: any = {
                moduleDefinitions: [
                    { moduleName: 'HubSpot' },
                    { moduleName: 'Salesforce' },
                    { moduleName: 'Slack' },
                ],
            };

            const mockIntegrationClasses: any = [
                { Definition: { name: 'HubSpot-to-Salesforce' } },
                { Definition: { name: 'Slack-Notifications' } },
            ];

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationClasses: mockIntegrationClasses,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(3);
            expect(result.modules.available).toEqual(['HubSpot', 'Salesforce', 'Slack']);
            expect(result.integrations.count).toBe(2);
            expect(result.integrations.available).toEqual(['HubSpot-to-Salesforce', 'Slack-Notifications']);
        });

        it('should handle undefined moduleFactory gracefully', () => {
            const mockIntegrationClasses: any = [
                { Definition: { name: 'Integration1' } },
            ];

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: undefined,
                integrationClasses: mockIntegrationClasses,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
            expect(result.integrations.count).toBe(1);
        });

        it('should handle undefined integrationClasses gracefully', () => {
            const mockModuleFactory: any = {
                moduleDefinitions: [{ moduleName: 'Module1' }],
            };

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationClasses: undefined,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(1);
            expect(result.integrations.count).toBe(0);
            expect(result.integrations.available).toEqual([]);
        });

        it('should handle both moduleFactory and integrationClasses being undefined', () => {
            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: undefined,
                integrationClasses: undefined,
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
            expect(result.integrations.count).toBe(0);
            expect(result.integrations.available).toEqual([]);
        });

        it('should handle non-array moduleDefinitions', () => {
            const mockModuleFactory: any = {
                moduleDefinitions: 'not-an-array',
            };

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationClasses: [],
            });

            const result = useCase.execute();

            expect(result.status).toBe('healthy');
            expect(result.modules.count).toBe(0);
            expect(result.modules.available).toEqual([]);
        });

        it('should handle moduleFactory with missing moduleDefinitions property', () => {
            const mockModuleFactory: any = {};

            const useCase = new CheckIntegrationsHealthUseCase({
                moduleFactory: mockModuleFactory,
                integrationClasses: [],
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
