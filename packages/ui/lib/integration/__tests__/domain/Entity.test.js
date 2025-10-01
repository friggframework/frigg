/**
 * @file Entity Domain Model Tests
 */

import { Entity } from '../../domain/Entity.js';

describe('Entity Domain Model', () => {
    describe('constructor', () => {
        it('should create entity with required fields', () => {
            const entity = new Entity({
                id: 'entity-123',
                type: 'salesforce',
                name: 'My Salesforce Account'
            });

            expect(entity.id).toBe('entity-123');
            expect(entity.type).toBe('salesforce');
            expect(entity.name).toBe('My Salesforce Account');
            expect(entity.status).toBe('CONNECTED'); // default
        });

        it('should set default status to CONNECTED', () => {
            const entity = new Entity({
                id: 'entity-123',
                type: 'salesforce',
                name: 'Test'
            });

            expect(entity.status).toBe('CONNECTED');
        });

        it('should accept custom status', () => {
            const entity = new Entity({
                id: 'entity-123',
                type: 'salesforce',
                name: 'Test',
                status: 'ERROR'
            });

            expect(entity.status).toBe('ERROR');
        });

        it('should handle optional fields', () => {
            const entity = new Entity({
                id: 'entity-123',
                type: 'salesforce',
                name: 'Test',
                subType: 'production',
                externalId: 'ext-456',
                credential: { id: 'cred-789', type: 'salesforce' },
                compatibleIntegrations: [{ integrationType: 'salesforce-to-hubspot' }],
                metadata: { foo: 'bar' }
            });

            expect(entity.subType).toBe('production');
            expect(entity.externalId).toBe('ext-456');
            expect(entity.credential.id).toBe('cred-789');
            expect(entity.compatibleIntegrations).toHaveLength(1);
            expect(entity.metadata.foo).toBe('bar');
        });
    });

    describe('isConnected', () => {
        it('should return true when status is CONNECTED', () => {
            const entity = new Entity({
                id: '1',
                type: 'test',
                name: 'Test',
                status: 'CONNECTED'
            });

            expect(entity.isConnected()).toBe(true);
        });

        it('should return false when status is not CONNECTED', () => {
            const disconnected = new Entity({
                id: '1',
                type: 'test',
                name: 'Test',
                status: 'DISCONNECTED'
            });
            const error = new Entity({
                id: '2',
                type: 'test',
                name: 'Test',
                status: 'ERROR'
            });

            expect(disconnected.isConnected()).toBe(false);
            expect(error.isConnected()).toBe(false);
        });
    });

    describe('hasError', () => {
        it('should return true when status is ERROR', () => {
            const entity = new Entity({
                id: '1',
                type: 'test',
                name: 'Test',
                status: 'ERROR'
            });

            expect(entity.hasError()).toBe(true);
        });

        it('should return false when status is not ERROR', () => {
            const entity = new Entity({
                id: '1',
                type: 'test',
                name: 'Test',
                status: 'CONNECTED'
            });

            expect(entity.hasError()).toBe(false);
        });
    });

    describe('isDisconnected', () => {
        it('should return true when status is DISCONNECTED', () => {
            const entity = new Entity({
                id: '1',
                type: 'test',
                name: 'Test',
                status: 'DISCONNECTED'
            });

            expect(entity.isDisconnected()).toBe(true);
        });

        it('should return false when status is not DISCONNECTED', () => {
            const entity = new Entity({
                id: '1',
                type: 'test',
                name: 'Test',
                status: 'CONNECTED'
            });

            expect(entity.isDisconnected()).toBe(false);
        });
    });

    describe('isCompatibleWith', () => {
        it('should return true when entity is compatible with integration', () => {
            const entity = new Entity({
                id: '1',
                type: 'salesforce',
                name: 'Test',
                compatibleIntegrations: [
                    { integrationType: 'salesforce-to-hubspot', displayName: 'SF to HubSpot' },
                    { integrationType: 'salesforce-to-slack', displayName: 'SF to Slack' }
                ]
            });

            expect(entity.isCompatibleWith('salesforce-to-hubspot')).toBe(true);
            expect(entity.isCompatibleWith('salesforce-to-slack')).toBe(true);
        });

        it('should return false when entity is not compatible', () => {
            const entity = new Entity({
                id: '1',
                type: 'salesforce',
                name: 'Test',
                compatibleIntegrations: [
                    { integrationType: 'salesforce-to-hubspot' }
                ]
            });

            expect(entity.isCompatibleWith('stripe-to-xero')).toBe(false);
        });

        it('should return false when no compatible integrations', () => {
            const entity = new Entity({
                id: '1',
                type: 'salesforce',
                name: 'Test',
                compatibleIntegrations: []
            });

            expect(entity.isCompatibleWith('salesforce-to-hubspot')).toBe(false);
        });
    });

    describe('getDisplayName', () => {
        it('should return name when provided', () => {
            const entity = new Entity({
                id: '1',
                type: 'salesforce',
                name: 'Production Salesforce'
            });

            expect(entity.getDisplayName()).toBe('Production Salesforce');
        });

        it('should generate name from type when name not provided', () => {
            const entity = new Entity({
                id: '1',
                type: 'salesforce',
                name: null
            });

            expect(entity.getDisplayName()).toBe('salesforce Account');
        });
    });

    describe('toJSON', () => {
        it('should serialize to plain object', () => {
            const entity = new Entity({
                id: 'entity-123',
                type: 'salesforce',
                subType: 'production',
                name: 'Test',
                status: 'CONNECTED',
                externalId: 'ext-456',
                credential: { id: 'cred-789' },
                compatibleIntegrations: [{ integrationType: 'test' }],
                metadata: { foo: 'bar' },
                createdAt: '2024-01-01',
                updatedAt: '2024-01-02'
            });

            const json = entity.toJSON();

            expect(json).toEqual({
                id: 'entity-123',
                type: 'salesforce',
                subType: 'production',
                name: 'Test',
                status: 'CONNECTED',
                externalId: 'ext-456',
                credential: { id: 'cred-789' },
                compatibleIntegrations: [{ integrationType: 'test' }],
                metadata: { foo: 'bar' },
                createdAt: '2024-01-01',
                updatedAt: '2024-01-02'
            });
        });
    });

    describe('fromApiResponse', () => {
        it('should create Entity from API response', () => {
            const apiData = {
                id: 'entity-123',
                type: 'salesforce',
                name: 'My Account',
                status: 'CONNECTED'
            };

            const entity = Entity.fromApiResponse(apiData);

            expect(entity).toBeInstanceOf(Entity);
            expect(entity.id).toBe('entity-123');
            expect(entity.type).toBe('salesforce');
            expect(entity.name).toBe('My Account');
            expect(entity.status).toBe('CONNECTED');
        });
    });
});
