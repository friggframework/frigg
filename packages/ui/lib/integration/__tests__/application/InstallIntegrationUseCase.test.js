/**
 * @file Install Integration Use Case Tests
 */

import { InstallIntegrationUseCase } from '../../application/use-cases/InstallIntegrationUseCase.js';
import { Integration } from '../../domain/Integration.js';
import { IntegrationOption } from '../../domain/IntegrationOption.js';
import { Entity } from '../../domain/Entity.js';

describe('InstallIntegrationUseCase', () => {
    let useCase;
    let mockIntegrationService;
    let mockEntityService;

    beforeEach(() => {
        // Mock IntegrationService
        mockIntegrationService = {
            isIntegrationInstalled: jest.fn(),
            getAvailableIntegrations: jest.fn(),
            createIntegration: jest.fn()
        };

        // Mock EntityService
        mockEntityService = {
            getUserEntities: jest.fn()
        };

        useCase = new InstallIntegrationUseCase(
            mockIntegrationService,
            mockEntityService
        );
    });

    describe('execute', () => {
        it('should install integration successfully', async () => {
            const integrationType = 'salesforce-to-hubspot';
            const entityIds = ['entity-1', 'entity-2'];

            // Mock: Not already installed
            mockIntegrationService.isIntegrationInstalled.mockResolvedValue(false);

            // Mock: Get integration option
            const integrationOption = new IntegrationOption({
                type: integrationType,
                displayName: 'SF to HubSpot',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false },
                    hubspot: { type: 'hubspot', required: true, global: false }
                }
            });
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);

            // Mock: Get user entities
            const entities = [
                new Entity({ id: 'entity-1', type: 'salesforce', name: 'SF', status: 'CONNECTED' }),
                new Entity({ id: 'entity-2', type: 'hubspot', name: 'HS', status: 'CONNECTED' })
            ];
            mockEntityService.getUserEntities.mockResolvedValue(entities);

            // Mock: Create integration
            const createdIntegration = new Integration({
                id: 'int-123',
                type: integrationType,
                displayName: 'SF to HubSpot',
                status: 'active'
            });
            mockIntegrationService.createIntegration.mockResolvedValue(createdIntegration);

            // Execute
            const result = await useCase.execute(integrationType, entityIds);

            expect(result).toEqual(createdIntegration);
            expect(mockIntegrationService.createIntegration).toHaveBeenCalledWith(
                integrationType,
                entityIds,
                {}
            );
        });

        it('should throw error if integration already installed', async () => {
            mockIntegrationService.isIntegrationInstalled.mockResolvedValue(true);

            await expect(
                useCase.execute('salesforce-to-hubspot', [])
            ).rejects.toThrow('already installed');
        });

        it('should throw error if integration type not found', async () => {
            mockIntegrationService.isIntegrationInstalled.mockResolvedValue(false);
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([]);

            await expect(
                useCase.execute('unknown-integration', [])
            ).rejects.toThrow('not found');
        });

        it('should throw error if entity not found', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            mockIntegrationService.isIntegrationInstalled.mockResolvedValue(false);
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getUserEntities.mockResolvedValue([]);

            await expect(
                useCase.execute('test', ['non-existent-entity'])
            ).rejects.toThrow('not found');
        });

        it('should throw error if entity is not connected', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            const disconnectedEntity = new Entity({
                id: 'entity-1',
                type: 'salesforce',
                name: 'SF',
                status: 'DISCONNECTED'
            });

            mockIntegrationService.isIntegrationInstalled.mockResolvedValue(false);
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getUserEntities.mockResolvedValue([disconnectedEntity]);

            await expect(
                useCase.execute('test', ['entity-1'])
            ).rejects.toThrow('CONNECTED status');
        });

        it('should throw error if required entity types missing', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false },
                    hubspot: { type: 'hubspot', required: true, global: false }
                }
            });

            const entity = new Entity({
                id: 'entity-1',
                type: 'salesforce',
                name: 'SF',
                status: 'CONNECTED'
            });

            mockIntegrationService.isIntegrationInstalled.mockResolvedValue(false);
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getUserEntities.mockResolvedValue([entity]);

            await expect(
                useCase.execute('test', ['entity-1'])
            ).rejects.toThrow('Missing required entity types');
        });
    });

    describe('canInstall', () => {
        it('should return true when all requirements met', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            const entity = new Entity({
                id: 'entity-1',
                type: 'salesforce',
                name: 'SF',
                status: 'CONNECTED'
            });

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getUserEntities.mockResolvedValue([entity]);

            const result = await useCase.canInstall('test');

            expect(result.canInstall).toBe(true);
        });

        it('should return false when integration type not found', async () => {
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([]);

            const result = await useCase.canInstall('unknown');

            expect(result.canInstall).toBe(false);
            expect(result.reason).toBe('Integration type not found');
        });

        it('should return false when required entities missing', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false },
                    hubspot: { type: 'hubspot', required: true, global: false }
                }
            });

            const entity = new Entity({
                id: 'entity-1',
                type: 'salesforce',
                name: 'SF',
                status: 'CONNECTED'
            });

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getUserEntities.mockResolvedValue([entity]);

            const result = await useCase.canInstall('test');

            expect(result.canInstall).toBe(false);
            expect(result.reason).toBe('Missing required entities');
            expect(result.missingTypes).toContain('hubspot');
        });
    });
});
