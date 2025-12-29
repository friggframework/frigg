/**
 * FriggApiAdapter Endpoint Path Tests
 *
 * These tests verify that the FriggApiAdapter uses the correct v2 paths.
 * The Frigg backend now serves v2 endpoints at /api/v2/* and frozen v1
 * endpoints at /api/* (no version prefix).
 *
 * New clients should use v2 paths for all endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FriggApiAdapter } from '../integration/infrastructure/adapters/FriggApiAdapter.js';

describe('FriggApiAdapter v2 Endpoint Paths', () => {
    let adapter;
    let fetchSpy;

    beforeEach(() => {
        adapter = new FriggApiAdapter({
            baseUrl: '/api/v2',  // Should be /api/v2 for v2 API
            authToken: 'test-token'
        });

        // Mock fetch globally
        fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({})
        });
        global.fetch = fetchSpy;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Default baseUrl', () => {
        it('should default to /api/v2 for new instances', () => {
            const defaultAdapter = new FriggApiAdapter();
            // The baseUrl should be /api/v2 by default
            expect(defaultAdapter.baseUrl).toBe('/api/v2');
        });
    });

    describe('Entity Type Endpoints', () => {
        it('listEntityTypes() should call /api/v2/entities/types', async () => {
            await adapter.listEntityTypes();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/types',
                expect.any(Object)
            );
        });

        it('getEntityType() should call /api/v2/entities/types/:typeName', async () => {
            await adapter.getEntityType('hubspot');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/types/hubspot',
                expect.any(Object)
            );
        });

        it('getEntityTypeRequirements() should call /api/v2/entities/types/:typeName/requirements', async () => {
            await adapter.getEntityTypeRequirements('hubspot', 1);

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/types/hubspot/requirements?step=1',
                expect.any(Object)
            );
        });
    });

    describe('Credential Endpoints', () => {
        it('listCredentials() should call /api/v2/credentials', async () => {
            await adapter.listCredentials();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/credentials',
                expect.any(Object)
            );
        });

        it('getCredential() should call /api/v2/credentials/:id', async () => {
            await adapter.getCredential('cred-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/credentials/cred-123',
                expect.any(Object)
            );
        });

        it('deleteCredential() should call /api/v2/credentials/:id', async () => {
            await adapter.deleteCredential('cred-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/credentials/cred-123',
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('getCredentialReauthorizeRequirements() should call /api/v2/credentials/:id/reauthorize', async () => {
            await adapter.getCredentialReauthorizeRequirements('cred-123', 1);

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/credentials/cred-123/reauthorize?step=1',
                expect.any(Object)
            );
        });

        it('reauthorizeCredential() should call /api/v2/credentials/:id/reauthorize', async () => {
            await adapter.reauthorizeCredential('cred-123', { code: 'abc' });

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/credentials/cred-123/reauthorize',
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    describe('Entity Endpoints', () => {
        it('getEntities() should call /api/v2/entities', async () => {
            await adapter.getEntities();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities',
                expect.any(Object)
            );
        });

        it('getEntity() should call /api/v2/entities/:id', async () => {
            await adapter.getEntity('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/ent-123',
                expect.any(Object)
            );
        });

        it('deleteEntity() should call /api/v2/entities/:id', async () => {
            await adapter.deleteEntity('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/ent-123',
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('testEntityAuth() should call /api/v2/entities/:id/test-auth', async () => {
            await adapter.testEntityAuth('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/ent-123/test-auth',
                expect.any(Object)
            );
        });

        it('getEntityOptions() should call /api/v2/entities/:id/options', async () => {
            await adapter.getEntityOptions('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/ent-123/options',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('refreshEntityOptions() should call /api/v2/entities/:id/options/refresh', async () => {
            await adapter.refreshEntityOptions('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/ent-123/options/refresh',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('proxyEntityRequest() should call /api/v2/entities/:id/proxy', async () => {
            await adapter.proxyEntityRequest('ent-123', { method: 'GET', path: '/test' });

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/entities/ent-123/proxy',
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    describe('Integration Endpoints', () => {
        it('getIntegrationOptions() should call /api/v2/integrations/options', async () => {
            await adapter.getIntegrationOptions();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations/options',
                expect.any(Object)
            );
        });

        it('getIntegrations() should call /api/v2/integrations', async () => {
            await adapter.getIntegrations();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations',
                expect.any(Object)
            );
        });

        it('getIntegration() should call /api/v2/integrations/:id', async () => {
            await adapter.getIntegration('int-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations/int-123',
                expect.any(Object)
            );
        });

        it('createIntegration() should call /api/v2/integrations', async () => {
            await adapter.createIntegration({ entities: ['ent-1'] });

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('updateIntegration() should call /api/v2/integrations/:id', async () => {
            await adapter.updateIntegration('int-123', { config: {} });

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations/int-123',
                expect.objectContaining({ method: 'PATCH' })
            );
        });

        it('deleteIntegration() should call /api/v2/integrations/:id', async () => {
            await adapter.deleteIntegration('int-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations/int-123',
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('testIntegration() should call /api/v2/integrations/:id/test', async () => {
            await adapter.testIntegration('int-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/integrations/int-123/test',
                expect.any(Object)
            );
        });
    });

    describe('Authorization Endpoints', () => {
        it('getAuthorizationRequirements() should call /api/v2/authorize', async () => {
            await adapter.getAuthorizationRequirements('hubspot');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/authorize?entityType=hubspot',
                expect.any(Object)
            );
        });

        it('authorizeEntity() should call /api/v2/authorize', async () => {
            await adapter.authorizeEntity('hubspot', { data: { code: 'abc' } });

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/v2/authorize',
                expect.objectContaining({ method: 'POST' })
            );
        });
    });
});
