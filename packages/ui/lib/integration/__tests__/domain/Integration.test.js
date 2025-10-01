/**
 * @file Integration Domain Model Tests
 */

import { Integration } from '../../domain/Integration.js';

describe('Integration Domain Model', () => {
    describe('constructor', () => {
        it('should create integration with required fields', () => {
            const integration = new Integration({
                id: 'int-123',
                type: 'salesforce-to-hubspot',
                displayName: 'Salesforce to HubSpot'
            });

            expect(integration.id).toBe('int-123');
            expect(integration.type).toBe('salesforce-to-hubspot');
            expect(integration.displayName).toBe('Salesforce to HubSpot');
        });

        it('should set default values', () => {
            const integration = new Integration({
                id: 'int-123',
                type: 'test',
                displayName: 'Test'
            });

            expect(integration.description).toBe('');
            expect(integration.status).toBe('active');
            expect(integration.config).toEqual({});
            expect(integration.entities).toEqual([]);
            expect(integration.modules).toEqual({});
            expect(integration.userActions).toEqual([]);
            expect(integration.version).toBe('0.0.0');
            expect(integration.messages).toEqual({ errors: [], warnings: [], info: [] });
        });

        it('should accept all optional fields', () => {
            const integration = new Integration({
                id: 'int-123',
                type: 'test',
                displayName: 'Test Integration',
                description: 'Test description',
                status: 'ENABLED',
                config: { setting: 'value' },
                entities: [{ id: 'entity-1' }],
                modules: { salesforce: { name: 'Salesforce' } },
                userActions: ['sync'],
                version: '1.0.0',
                messages: { errors: ['error1'], warnings: ['warn1'], info: ['info1'] },
                createdAt: '2024-01-01',
                updatedAt: '2024-01-02'
            });

            expect(integration.description).toBe('Test description');
            expect(integration.status).toBe('ENABLED');
            expect(integration.config.setting).toBe('value');
            expect(integration.entities).toHaveLength(1);
            expect(integration.modules.salesforce.name).toBe('Salesforce');
            expect(integration.userActions).toContain('sync');
            expect(integration.version).toBe('1.0.0');
            expect(integration.messages.errors).toHaveLength(1);
        });
    });

    describe('isActive', () => {
        it('should return true when status is active', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                status: 'active'
            });

            expect(integration.isActive()).toBe(true);
        });

        it('should return false when status is not active', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                status: 'DISABLED'
            });

            expect(integration.isActive()).toBe(false);
        });
    });

    describe('hasErrors', () => {
        it('should return true when errors exist', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                messages: { errors: ['error1', 'error2'], warnings: [], info: [] }
            });

            expect(integration.hasErrors()).toBe(true);
        });

        it('should return false when no errors', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                messages: { errors: [], warnings: [], info: [] }
            });

            expect(integration.hasErrors()).toBe(false);
        });

        it('should return false when messages.errors is undefined', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                messages: {}
            });

            expect(integration.hasErrors()).toBe(false);
        });
    });

    describe('getEntityByType', () => {
        it('should return entity with matching type', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                entities: [
                    { id: 'e1', type: 'salesforce' },
                    { id: 'e2', type: 'hubspot' }
                ]
            });

            const entity = integration.getEntityByType('hubspot');
            expect(entity).toEqual({ id: 'e2', type: 'hubspot' });
        });

        it('should return undefined when no matching entity', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                entities: [{ id: 'e1', type: 'salesforce' }]
            });

            expect(integration.getEntityByType('stripe')).toBeUndefined();
        });
    });

    describe('getEntityIds', () => {
        it('should return array of entity IDs', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                entities: [
                    { id: 'e1', type: 'salesforce' },
                    { id: 'e2', type: 'hubspot' }
                ]
            });

            expect(integration.getEntityIds()).toEqual(['e1', 'e2']);
        });

        it('should return empty array when no entities', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                entities: []
            });

            expect(integration.getEntityIds()).toEqual([]);
        });
    });

    describe('hasModule', () => {
        it('should return true when module exists', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                modules: { salesforce: { name: 'Salesforce' } }
            });

            expect(integration.hasModule('salesforce')).toBe(true);
        });

        it('should return false when module does not exist', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                modules: { salesforce: { name: 'Salesforce' } }
            });

            expect(integration.hasModule('stripe')).toBe(false);
        });
    });

    describe('getModule', () => {
        it('should return module when it exists', () => {
            const module = { name: 'Salesforce', type: 'crm' };
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                modules: { salesforce: module }
            });

            expect(integration.getModule('salesforce')).toEqual(module);
        });

        it('should return null when module does not exist', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                modules: {}
            });

            expect(integration.getModule('salesforce')).toBeNull();
        });
    });

    describe('getModuleTypes', () => {
        it('should return array of module keys', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test',
                modules: {
                    salesforce: { name: 'Salesforce' },
                    hubspot: { name: 'HubSpot' }
                }
            });

            expect(integration.getModuleTypes()).toEqual(['salesforce', 'hubspot']);
        });

        it('should return empty array when no modules', () => {
            const integration = new Integration({
                id: '1',
                type: 'test',
                displayName: 'Test'
            });

            expect(integration.getModuleTypes()).toEqual([]);
        });
    });

    describe('toJSON', () => {
        it('should serialize to plain object', () => {
            const integration = new Integration({
                id: 'int-123',
                type: 'test',
                displayName: 'Test Integration',
                status: 'active',
                entities: [{ id: 'e1' }]
            });

            const json = integration.toJSON();

            expect(json.id).toBe('int-123');
            expect(json.type).toBe('test');
            expect(json.displayName).toBe('Test Integration');
            expect(json.entities).toHaveLength(1);
        });
    });

    describe('fromApiResponse', () => {
        it('should create Integration from API response', () => {
            const apiData = {
                id: 'int-123',
                type: 'salesforce-to-hubspot',
                displayName: 'Salesforce to HubSpot',
                status: 'ENABLED'
            };

            const integration = Integration.fromApiResponse(apiData);

            expect(integration).toBeInstanceOf(Integration);
            expect(integration.id).toBe('int-123');
            expect(integration.type).toBe('salesforce-to-hubspot');
        });
    });
});
