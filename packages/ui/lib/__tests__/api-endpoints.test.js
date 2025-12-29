/**
 * API Endpoint Path Tests
 *
 * These tests verify that the API client uses the correct v2 paths.
 * The Frigg backend now serves v2 endpoints at /api/v2/* and frozen v1
 * endpoints at /api/* (no version prefix).
 *
 * New clients should use v2 paths for all endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import API from '../api/api.js';

describe('API v2 Endpoint Paths', () => {
    let api;
    let fetchSpy;

    beforeEach(() => {
        api = new API('https://api.example.com', 'test-jwt-token');

        // Mock fetch globally
        fetchSpy = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Map(),
            json: () => Promise.resolve({})
        });
        global.fetch = fetchSpy;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Integration Endpoints', () => {
        it('listIntegrations() should call /api/v2/integrations', async () => {
            await api.listIntegrations();

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/integrations',
                expect.any(Object)
            );
        });

        it('listIntegrationOptions() should call /api/v2/integrations/options', async () => {
            await api.listIntegrationOptions();

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/integrations/options',
                expect.any(Object)
            );
        });

        it('createIntegration() should call /api/v2/integrations', async () => {
            await api.createIntegration(['entity1'], { key: 'value' });

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/integrations',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('updateIntegration() should call /api/v2/integrations/:id', async () => {
            await api.updateIntegration('int-123', { key: 'value' });

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/integrations/int-123',
                expect.objectContaining({ method: 'PATCH' })
            );
        });

        it('deleteIntegration() should call /api/v2/integrations/:id', async () => {
            await api.deleteIntegration('int-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/integrations/int-123',
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });

    describe('Entity Endpoints', () => {
        it('listEntities() should call /api/v2/entities', async () => {
            await api.listEntities();

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities',
                expect.any(Object)
            );
        });

        it('getEntity() should call /api/v2/entities/:id', async () => {
            await api.getEntity('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/ent-123',
                expect.any(Object)
            );
        });

        it('deleteEntity() should call /api/v2/entities/:id', async () => {
            await api.deleteEntity('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/ent-123',
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('testEntity() should call /api/v2/entities/:id/test', async () => {
            await api.testEntity('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/ent-123/test',
                expect.any(Object)
            );
        });

        it('getEntityOptions() should call /api/v2/entities/:id/options', async () => {
            await api.getEntityOptions('ent-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/ent-123/options',
                expect.objectContaining({ method: 'POST' })
            );
        });
    });

    describe('Entity Type Endpoints', () => {
        it('listEntityTypes() should call /api/v2/entities/types', async () => {
            await api.listEntityTypes();

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/types',
                expect.any(Object)
            );
        });

        it('getEntityType() should call /api/v2/entities/types/:typeName', async () => {
            await api.getEntityType('hubspot');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/types/hubspot',
                expect.any(Object)
            );
        });

        it('getEntityTypeAuthorizationRequirements() should call /api/v2/entities/types/:typeName/requirements', async () => {
            await api.getEntityTypeAuthorizationRequirements('hubspot', 1);

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/entities/types/hubspot/requirements?step=1',
                expect.any(Object)
            );
        });
    });

    describe('Credential Endpoints', () => {
        it('listCredentials() should call /api/v2/credentials', async () => {
            await api.listCredentials();

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/credentials',
                expect.any(Object)
            );
        });

        it('getCredential() should call /api/v2/credentials/:id', async () => {
            await api.getCredential('cred-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/credentials/cred-123',
                expect.any(Object)
            );
        });

        it('deleteCredential() should call /api/v2/credentials/:id', async () => {
            await api.deleteCredential('cred-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/credentials/cred-123',
                expect.objectContaining({ method: 'DELETE' })
            );
        });

        it('getCredentialOptions() should call /api/v2/credentials/:id/options', async () => {
            await api.getCredentialOptions('cred-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/credentials/cred-123/options',
                expect.any(Object)
            );
        });
    });

    describe('Authorization Endpoints', () => {
        it('authorize() should call /api/v2/authorize', async () => {
            await api.authorize('hubspot', { code: 'abc' });

            expect(fetchSpy).toHaveBeenCalledWith(
                'https://api.example.com/api/v2/authorize',
                expect.objectContaining({ method: 'POST' })
            );
        });

        it('getAuthorizeRequirements() should call /api/v2/authorize', async () => {
            await api.getAuthorizeRequirements('hubspot');

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/api/v2/authorize?'),
                expect.any(Object)
            );
        });
    });
});
