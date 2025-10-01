/**
 * @file OAuth State Storage Tests
 */

import { OAuthStateStorage } from '../../infrastructure/storage/OAuthStateStorage.js';

describe('OAuthStateStorage', () => {
    let storage;
    let mockSessionStorage;

    beforeEach(() => {
        // Create mock with stable reference to data object
        const data = {};
        mockSessionStorage = {
            data,
            getItem: jest.fn().mockImplementation((key) => data[key] || null),
            setItem: jest.fn().mockImplementation((key, value) => { data[key] = value; }),
            removeItem: jest.fn().mockImplementation((key) => { delete data[key]; })
        };

        // Mock window.sessionStorage
        global.window = { sessionStorage: mockSessionStorage };

        // Create storage instance
        storage = new OAuthStateStorage();
    });

    afterEach(() => {
        delete global.window;
    });

    describe('saveState', () => {
        it('should save state with context', async () => {
            const state = 'test-state-123';
            const context = {
                entityType: 'salesforce',
                integrationType: 'salesforce-to-hubspot'
            };

            await storage.saveState(state, context);

            // Verify state can be retrieved (which proves it was saved)
            const retrieved = await storage.getState(state);
            expect(retrieved).toBeDefined();
            expect(retrieved.entityType).toBe('salesforce');
            expect(retrieved.integrationType).toBe('salesforce-to-hubspot');
            expect(retrieved.timestamp).toBeDefined();
            expect(retrieved.expiresAt).toBeDefined();
        });

        it('should set expiration 30 minutes in future', async () => {
            const state = 'test-state';
            const now = Date.now();

            await storage.saveState(state, { entityType: 'test' });

            const savedData = JSON.parse(mockSessionStorage.data['frigg_oauth_states']);
            const expiresAt = savedData[state].expiresAt;

            expect(expiresAt).toBeGreaterThan(now);
            expect(expiresAt).toBeLessThanOrEqual(now + (30 * 60 * 1000) + 1000); // +1s tolerance
        });
    });

    describe('getState', () => {
        it('should retrieve saved state', async () => {
            const state = 'test-state';
            const context = { entityType: 'salesforce' };

            await storage.saveState(state, context);
            const retrieved = await storage.getState(state);

            expect(retrieved).toBeDefined();
            expect(retrieved.entityType).toBe('salesforce');
        });

        it('should return null for non-existent state', async () => {
            const retrieved = await storage.getState('non-existent');
            expect(retrieved).toBeNull();
        });

        it('should return null for expired state', async () => {
            const state = 'expired-state';

            // Manually create expired state
            const expiredData = {
                [state]: {
                    entityType: 'test',
                    timestamp: Date.now() - (40 * 60 * 1000), // 40 minutes ago
                    expiresAt: Date.now() - (10 * 60 * 1000) // Expired 10 minutes ago
                }
            };
            mockSessionStorage.data['frigg_oauth_states'] = JSON.stringify(expiredData);

            const retrieved = await storage.getState(state);

            expect(retrieved).toBeNull();
        });

        it('should remove expired state when accessed', async () => {
            const state = 'expired-state';
            const expiredData = {
                [state]: {
                    entityType: 'test',
                    expiresAt: Date.now() - 1000
                }
            };
            mockSessionStorage.data['frigg_oauth_states'] = JSON.stringify(expiredData);

            await storage.getState(state);

            const remaining = JSON.parse(mockSessionStorage.data['frigg_oauth_states']);
            expect(remaining[state]).toBeUndefined();
        });
    });

    describe('removeState', () => {
        it('should remove specific state', async () => {
            await storage.saveState('state-1', { entityType: 'test1' });
            await storage.saveState('state-2', { entityType: 'test2' });

            await storage.removeState('state-1');

            const remaining = JSON.parse(mockSessionStorage.data['frigg_oauth_states']);
            expect(remaining['state-1']).toBeUndefined();
            expect(remaining['state-2']).toBeDefined();
        });
    });

    describe('cleanupExpiredStates', () => {
        it('should remove all expired states', async () => {
            const now = Date.now();

            // Mix of valid and expired states
            const states = {
                'valid-1': { entityType: 'test', expiresAt: now + 10000 },
                'expired-1': { entityType: 'test', expiresAt: now - 1000 },
                'valid-2': { entityType: 'test', expiresAt: now + 20000 },
                'expired-2': { entityType: 'test', expiresAt: now - 5000 }
            };

            mockSessionStorage.data['frigg_oauth_states'] = JSON.stringify(states);

            await storage.cleanupExpiredStates();

            const remaining = JSON.parse(mockSessionStorage.data['frigg_oauth_states']);
            expect(remaining['valid-1']).toBeDefined();
            expect(remaining['valid-2']).toBeDefined();
            expect(remaining['expired-1']).toBeUndefined();
            expect(remaining['expired-2']).toBeUndefined();
        });
    });

    describe('clearAll', () => {
        it('should remove all states', async () => {
            await storage.saveState('state-1', { entityType: 'test1' });
            await storage.saveState('state-2', { entityType: 'test2' });

            await storage.clearAll();

            expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('frigg_oauth_states');
        });
    });

    describe('saveInstallationContext', () => {
        it('should save installation context', async () => {
            await storage.saveInstallationContext('salesforce-to-hubspot', {
                returnUrl: '/integrations'
            });

            const saved = JSON.parse(mockSessionStorage.data['frigg_oauth_states_install_context']);
            expect(saved.integrationType).toBe('salesforce-to-hubspot');
            expect(saved.returnUrl).toBe('/integrations');
            expect(saved.timestamp).toBeDefined();
        });
    });

    describe('getInstallationContext', () => {
        it('should retrieve and clear installation context', async () => {
            await storage.saveInstallationContext('test-integration', { foo: 'bar' });

            const context = await storage.getInstallationContext();

            expect(context.integrationType).toBe('test-integration');
            expect(context.foo).toBe('bar');

            // Should be cleared after retrieval
            const contextAgain = await storage.getInstallationContext();
            expect(contextAgain).toBeNull();
        });
    });
});
