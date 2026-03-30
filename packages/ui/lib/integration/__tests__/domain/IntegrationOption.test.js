/**
 * @file Integration Option Domain Model Tests
 */

import { IntegrationOption } from '../../domain/IntegrationOption.js';

describe('IntegrationOption Domain Model', () => {
    describe('constructor', () => {
        it('should create integration option with required fields', () => {
            const option = new IntegrationOption({
                type: 'salesforce-to-hubspot',
                displayName: 'Salesforce to HubSpot'
            });

            expect(option.type).toBe('salesforce-to-hubspot');
            expect(option.displayName).toBe('Salesforce to HubSpot');
        });

        it('should set default values', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test'
            });

            expect(option.description).toBe('');
            expect(option.logo).toBe('');
            expect(option.category).toBe('');
            expect(option.detailsUrl).toBe('');
            expect(option.version).toBe('1.0.0');
            expect(option.modules).toEqual({});
            expect(option.requiredEntities).toEqual([]);
            expect(option.entities).toEqual({});
        });

        it('should accept all optional fields', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test Integration',
                description: 'Test description',
                logo: 'test-logo.png',
                category: 'CRM',
                detailsUrl: 'https://example.com',
                version: '2.0.0',
                modules: { salesforce: { name: 'Salesforce' } },
                requiredEntities: ['salesforce', 'hubspot'],
                entities: {
                    salesforce: { type: 'salesforce', global: false, required: true },
                    stripe: { type: 'stripe', global: true, required: true }
                }
            });

            expect(option.description).toBe('Test description');
            expect(option.logo).toBe('test-logo.png');
            expect(option.category).toBe('CRM');
            expect(option.version).toBe('2.0.0');
            expect(option.requiredEntities).toHaveLength(2);
        });
    });

    describe('getRequiredUserEntityTypes', () => {
        it('should return required non-global entity types', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', global: false, required: true },
                    stripe: { type: 'stripe', global: true, required: true },
                    hubspot: { type: 'hubspot', global: false, required: true }
                }
            });

            const userEntityTypes = option.getRequiredUserEntityTypes();
            expect(userEntityTypes).toEqual(['salesforce', 'hubspot']);
            expect(userEntityTypes).not.toContain('stripe'); // global entity excluded
        });

        it('should exclude entities with required: false', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', global: false, required: true },
                    hubspot: { type: 'hubspot', global: false, required: false }
                }
            });

            const userEntityTypes = option.getRequiredUserEntityTypes();
            expect(userEntityTypes).toEqual(['salesforce']);
        });

        it('should fall back to requiredEntities when no entities config', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                requiredEntities: ['salesforce', 'hubspot']
            });

            expect(option.getRequiredUserEntityTypes()).toEqual(['salesforce', 'hubspot']);
        });

        it('should return empty array when no requirements', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test'
            });

            expect(option.getRequiredUserEntityTypes()).toEqual([]);
        });
    });

    describe('getOptionalUserEntityTypes', () => {
        it('should return optional non-global entity types', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', global: false, required: true },
                    hubspot: { type: 'hubspot', global: false, required: false },
                    stripe: { type: 'stripe', global: true, required: false }
                }
            });

            const optionalTypes = option.getOptionalUserEntityTypes();
            expect(optionalTypes).toEqual(['hubspot']);
            expect(optionalTypes).not.toContain('stripe'); // global excluded
            expect(optionalTypes).not.toContain('salesforce'); // required excluded
        });

        it('should return empty array when no optional entities', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                entities: {
                    salesforce: { type: 'salesforce', global: false, required: true }
                }
            });

            expect(option.getOptionalUserEntityTypes()).toEqual([]);
        });
    });

    describe('isModuleRequired', () => {
        it('should return true when module is in requiredEntities', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                requiredEntities: ['salesforce', 'hubspot']
            });

            expect(option.isModuleRequired('salesforce')).toBe(true);
            expect(option.isModuleRequired('hubspot')).toBe(true);
        });

        it('should return false when module is not required', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                requiredEntities: ['salesforce']
            });

            expect(option.isModuleRequired('stripe')).toBe(false);
        });
    });

    describe('getModuleCount', () => {
        it('should return number of modules', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                modules: {
                    salesforce: { name: 'Salesforce' },
                    hubspot: { name: 'HubSpot' },
                    stripe: { name: 'Stripe' }
                }
            });

            expect(option.getModuleCount()).toBe(3);
        });

        it('should return 0 when no modules', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test'
            });

            expect(option.getModuleCount()).toBe(0);
        });
    });

    describe('getModuleTypes', () => {
        it('should return array of module keys', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                modules: {
                    salesforce: { name: 'Salesforce' },
                    hubspot: { name: 'HubSpot' }
                }
            });

            expect(option.getModuleTypes()).toEqual(['salesforce', 'hubspot']);
        });
    });

    describe('hasCategory', () => {
        it('should return true when category matches', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                category: 'CRM'
            });

            expect(option.hasCategory('CRM')).toBe(true);
        });

        it('should return false when category does not match', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test',
                category: 'CRM'
            });

            expect(option.hasCategory('Marketing')).toBe(false);
        });
    });

    describe('toJSON', () => {
        it('should serialize to plain object', () => {
            const option = new IntegrationOption({
                type: 'test',
                displayName: 'Test Integration',
                description: 'Test description',
                category: 'CRM'
            });

            const json = option.toJSON();

            expect(json.type).toBe('test');
            expect(json.displayName).toBe('Test Integration');
            expect(json.description).toBe('Test description');
            expect(json.category).toBe('CRM');
        });
    });

    describe('fromApiResponse', () => {
        it('should create IntegrationOption from API response', () => {
            const apiData = {
                type: 'salesforce-to-hubspot',
                displayName: 'Salesforce to HubSpot',
                category: 'CRM'
            };

            const option = IntegrationOption.fromApiResponse(apiData);

            expect(option).toBeInstanceOf(IntegrationOption);
            expect(option.type).toBe('salesforce-to-hubspot');
            expect(option.displayName).toBe('Salesforce to HubSpot');
        });
    });
});
