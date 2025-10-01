/**
 * @file Select Entities Use Case Tests
 */

import { SelectEntitiesUseCase } from '../../application/use-cases/SelectEntitiesUseCase.js';
import { IntegrationOption } from '../../domain/IntegrationOption.js';
import { Entity } from '../../domain/Entity.js';

describe('SelectEntitiesUseCase', () => {
    let useCase;
    let mockIntegrationService;
    let mockEntityService;

    beforeEach(() => {
        mockIntegrationService = {
            getAvailableIntegrations: jest.fn()
        };

        mockEntityService = {
            getEntitiesByType: jest.fn()
        };

        useCase = new SelectEntitiesUseCase(
            mockIntegrationService,
            mockEntityService
        );
    });

    describe('getSelectionRequirements', () => {
        it('should return selection requirements with entities', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test-integration',
                displayName: 'Test Integration',
                description: 'Test description',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false },
                    hubspot: { type: 'hubspot', required: false, global: false }
                }
            });

            const entitiesByType = {
                salesforce: [
                    new Entity({ id: 'sf-1', type: 'salesforce', name: 'SF 1', status: 'CONNECTED' }),
                    new Entity({ id: 'sf-2', type: 'salesforce', name: 'SF 2', status: 'CONNECTED' })
                ],
                hubspot: [
                    new Entity({ id: 'hs-1', type: 'hubspot', name: 'HS 1', status: 'CONNECTED' })
                ]
            };

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue(entitiesByType);

            const result = await useCase.getSelectionRequirements('test-integration');

            expect(result.integration.type).toBe('test-integration');
            expect(result.required).toHaveLength(1);
            expect(result.required[0].type).toBe('salesforce');
            expect(result.required[0].entities).toHaveLength(2);
            expect(result.required[0].hasEntities).toBe(true);
            expect(result.optional).toHaveLength(1);
            expect(result.optional[0].type).toBe('hubspot');
        });

        it('should throw error if integration not found', async () => {
            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([]);

            await expect(
                useCase.getSelectionRequirements('unknown')
            ).rejects.toThrow('not found');
        });
    });

    describe('getDefaultSelections', () => {
        it('should select most recent entity for each required type', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            const entitiesByType = {
                salesforce: [
                    new Entity({
                        id: 'sf-1',
                        type: 'salesforce',
                        name: 'Old',
                        status: 'CONNECTED',
                        createdAt: '2024-01-01'
                    }),
                    new Entity({
                        id: 'sf-2',
                        type: 'salesforce',
                        name: 'New',
                        status: 'CONNECTED',
                        createdAt: '2024-01-02'
                    })
                ]
            };

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue(entitiesByType);

            const selections = await useCase.getDefaultSelections('test');

            expect(selections.salesforce).toBe('sf-2'); // Most recent
        });

        it('should return null for missing entity types', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue({});

            const selections = await useCase.getDefaultSelections('test');

            expect(selections.salesforce).toBeNull();
        });
    });

    describe('validateSelections', () => {
        it('should return valid when all required types selected', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            const entitiesByType = {
                salesforce: [
                    new Entity({ id: 'sf-1', type: 'salesforce', name: 'SF', status: 'CONNECTED' })
                ]
            };

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue(entitiesByType);

            const result = await useCase.validateSelections('test', { salesforce: 'sf-1' });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return invalid when required type not selected', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue({});

            const result = await useCase.validateSelections('test', {});

            expect(result.valid).toBe(false);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].type).toBe('salesforce');
        });

        it('should return invalid when selected entity not found', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false }
                }
            });

            const entitiesByType = {
                salesforce: [
                    new Entity({ id: 'sf-1', type: 'salesforce', name: 'SF', status: 'CONNECTED' })
                ]
            };

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue(entitiesByType);

            const result = await useCase.validateSelections('test', { salesforce: 'sf-999' });

            expect(result.valid).toBe(false);
            expect(result.errors[0].message).toContain('not found');
        });

        it('should warn when same entity selected multiple times', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false },
                    hubspot: { type: 'hubspot', required: true, global: false }
                }
            });

            const entitiesByType = {
                salesforce: [
                    new Entity({ id: 'sf-1', type: 'salesforce', name: 'SF', status: 'CONNECTED' })
                ],
                hubspot: []
            };

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue(entitiesByType);

            const result = await useCase.validateSelections('test', {
                salesforce: 'sf-1',
                hubspot: 'sf-1' // Same entity
            });

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].message).toContain('Same entity');
        });
    });

    describe('getMissingEntityTypes', () => {
        it('should return types with no entities', async () => {
            const integrationOption = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', required: true, global: false, label: 'Salesforce' },
                    hubspot: { type: 'hubspot', required: true, global: false, label: 'HubSpot' }
                }
            });

            const entitiesByType = {
                salesforce: [
                    new Entity({ id: 'sf-1', type: 'salesforce', name: 'SF', status: 'CONNECTED' })
                ]
                // hubspot missing
            };

            mockIntegrationService.getAvailableIntegrations.mockResolvedValue([integrationOption]);
            mockEntityService.getEntitiesByType.mockResolvedValue(entitiesByType);

            const missing = await useCase.getMissingEntityTypes('test');

            expect(missing).toHaveLength(1);
            expect(missing[0].type).toBe('hubspot');
            expect(missing[0].label).toBe('HubSpot');
        });
    });
});
