/**
 * Phase 2 Integration Test Suite
 * 
 * This comprehensive test suite validates all Phase 2 features working together:
 * - Integration discovery and installation
 * - Dummy user management
 * - Connection/entity management
 * - Environment variable editor
 * - End-to-end user flows
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import WebSocket from 'ws';

// Test configuration
const TEST_PORT = 3001;
const API_BASE = `http://localhost:${TEST_PORT}/api`;
const WS_URL = `ws://localhost:${TEST_PORT}`;
const TEST_TIMEOUT = 30000; // 30 seconds

let serverProcess;
let wsClient;

describe('Phase 2 Integration Tests', () => {
    beforeAll(async () => {
        // Start the management UI server
        console.log('Starting management UI server...');
        serverProcess = spawn('npm', ['run', 'dev:server'], {
            cwd: path.resolve(__dirname, '../..'),
            env: { ...process.env, PORT: TEST_PORT }
        });

        // Wait for server to be ready
        await waitForServer(API_BASE, 10000);
        
        // Connect WebSocket
        wsClient = new WebSocket(WS_URL);
        await new Promise((resolve, reject) => {
            wsClient.on('open', resolve);
            wsClient.on('error', reject);
        });
    }, TEST_TIMEOUT);

    afterAll(async () => {
        // Cleanup
        if (wsClient) wsClient.close();
        if (serverProcess) {
            serverProcess.kill();
            await new Promise(resolve => serverProcess.on('close', resolve));
        }
    });

    describe('Integration Discovery and Installation', () => {
        test('should discover available integrations from npm registry', async () => {
            const response = await fetch(`${API_BASE}/integrations/discover`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data).toHaveProperty('integrations');
            expect(Array.isArray(data.integrations)).toBe(true);
            expect(data.integrations.length).toBeGreaterThan(0);

            // Verify integration structure
            const integration = data.integrations[0];
            expect(integration).toHaveProperty('name');
            expect(integration).toHaveProperty('displayName');
            expect(integration).toHaveProperty('description');
            expect(integration).toHaveProperty('category');
            expect(integration).toHaveProperty('version');
        });

        test('should install integration and update project dependencies', async () => {
            const integrationName = '@friggframework/api-module-slack';
            
            // Subscribe to WebSocket updates
            const wsUpdates = [];
            wsClient.on('message', (data) => {
                const message = JSON.parse(data);
                if (message.type === 'integration-install') {
                    wsUpdates.push(message);
                }
            });

            // Install integration
            const response = await fetch(`${API_BASE}/integrations/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageName: integrationName })
            });

            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result.status).toBe('success');

            // Verify WebSocket updates were sent
            expect(wsUpdates.length).toBeGreaterThan(0);
            expect(wsUpdates.some(u => u.data.status === 'installing')).toBe(true);
            expect(wsUpdates.some(u => u.data.status === 'installed')).toBe(true);

            // Verify installation in package.json
            const packageJsonPath = path.resolve(__dirname, '../../../../backend/package.json');
            const packageJson = await fs.readJson(packageJsonPath);
            expect(packageJson.dependencies).toHaveProperty(integrationName);
        }, TEST_TIMEOUT);

        test('should handle integration configuration', async () => {
            const integrationName = 'slack';
            const config = {
                clientId: 'test-client-id',
                clientSecret: 'test-client-secret',
                webhookUrl: 'https://test.webhook.url'
            };

            // Save configuration
            const response = await fetch(`${API_BASE}/integrations/${integrationName}/configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            });

            expect(response.ok).toBe(true);

            // Retrieve configuration
            const getResponse = await fetch(`${API_BASE}/integrations/${integrationName}/config`);
            expect(getResponse.ok).toBe(true);

            const retrievedConfig = await getResponse.json();
            expect(retrievedConfig.config).toEqual(config);
        });
    });

    describe('Dummy User Management', () => {
        test('should create dummy users with test IDs', async () => {
            const userData = {
                name: 'Test User',
                email: 'test@example.com',
                integration: 'slack'
            };

            const response = await fetch(`${API_BASE}/users/dummy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            expect(response.ok).toBe(true);
            const user = await response.json();
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('testId');
            expect(user.name).toBe(userData.name);
            expect(user.email).toBe(userData.email);
            expect(user.isDummy).toBe(true);
        });

        test('should list all dummy users', async () => {
            const response = await fetch(`${API_BASE}/users/dummy`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(Array.isArray(data.users)).toBe(true);
            expect(data.users.every(u => u.isDummy)).toBe(true);
        });

        test('should generate test credentials for dummy user', async () => {
            const userId = 'test-user-id';
            const response = await fetch(`${API_BASE}/users/dummy/${userId}/credentials`, {
                method: 'POST'
            });

            expect(response.ok).toBe(true);
            const credentials = await response.json();
            expect(credentials).toHaveProperty('accessToken');
            expect(credentials).toHaveProperty('refreshToken');
            expect(credentials).toHaveProperty('expiresAt');
        });
    });

    describe('Connection Management', () => {
        test('should create connection between user and integration', async () => {
            const connectionData = {
                userId: 'test-user-id',
                integrationName: 'slack',
                credentials: {
                    accessToken: 'test-access-token',
                    refreshToken: 'test-refresh-token'
                }
            };

            const response = await fetch(`${API_BASE}/connections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(connectionData)
            });

            expect(response.ok).toBe(true);
            const connection = await response.json();
            expect(connection).toHaveProperty('id');
            expect(connection.userId).toBe(connectionData.userId);
            expect(connection.integrationName).toBe(connectionData.integrationName);
            expect(connection.status).toBe('active');
        });

        test('should test connection health', async () => {
            const connectionId = 'test-connection-id';
            const response = await fetch(`${API_BASE}/connections/${connectionId}/test`);
            
            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result).toHaveProperty('healthy');
            expect(result).toHaveProperty('lastChecked');
            expect(result).toHaveProperty('details');
        });

        test('should manage entities for connection', async () => {
            const connectionId = 'test-connection-id';
            
            // List entities
            const listResponse = await fetch(`${API_BASE}/connections/${connectionId}/entities`);
            expect(listResponse.ok).toBe(true);
            
            const entities = await listResponse.json();
            expect(Array.isArray(entities.entities)).toBe(true);
            
            // Create entity
            const entityData = {
                type: 'channel',
                externalId: 'C1234567890',
                name: 'general',
                metadata: { topic: 'General discussion' }
            };

            const createResponse = await fetch(`${API_BASE}/connections/${connectionId}/entities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entityData)
            });

            expect(createResponse.ok).toBe(true);
            const entity = await createResponse.json();
            expect(entity.type).toBe(entityData.type);
            expect(entity.name).toBe(entityData.name);
        });
    });

    describe('Environment Variable Management', () => {
        const envBackupPath = path.resolve(__dirname, '../../../../.env.backup');
        const envPath = path.resolve(__dirname, '../../../../.env');

        beforeEach(async () => {
            // Backup existing .env file
            if (await fs.pathExists(envPath)) {
                await fs.copy(envPath, envBackupPath);
            }
        });

        afterEach(async () => {
            // Restore .env file
            if (await fs.pathExists(envBackupPath)) {
                await fs.copy(envBackupPath, envPath);
                await fs.remove(envBackupPath);
            }
        });

        test('should read environment variables', async () => {
            // Create test .env file
            const testEnv = `
NODE_ENV=test
API_KEY=test-api-key
SECRET_VALUE=should-be-masked
DATABASE_URL=postgres://localhost:5432/test
`;
            await fs.writeFile(envPath, testEnv);

            const response = await fetch(`${API_BASE}/environment`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data.variables).toHaveProperty('NODE_ENV', 'test');
            expect(data.variables).toHaveProperty('API_KEY', 'test-api-key');
            expect(data.variables).toHaveProperty('SECRET_VALUE');
            expect(data.variables.SECRET_VALUE).toMatch(/\*+/); // Should be masked
        });

        test('should update environment variables', async () => {
            const updates = {
                NEW_VAR: 'new-value',
                UPDATED_VAR: 'updated-value'
            };

            const response = await fetch(`${API_BASE}/environment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables: updates })
            });

            expect(response.ok).toBe(true);

            // Verify file was updated
            const envContent = await fs.readFile(envPath, 'utf-8');
            expect(envContent).toContain('NEW_VAR=new-value');
            expect(envContent).toContain('UPDATED_VAR=updated-value');
        });

        test('should validate environment variables', async () => {
            const variables = {
                VALID_VAR: 'valid-value',
                'INVALID VAR': 'has spaces',
                '123_INVALID': 'starts with number'
            };

            const response = await fetch(`${API_BASE}/environment/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables })
            });

            expect(response.ok).toBe(true);
            const validation = await response.json();
            expect(validation.valid).toBe(false);
            expect(validation.errors).toHaveLength(2);
            expect(validation.errors[0]).toHaveProperty('variable');
            expect(validation.errors[0]).toHaveProperty('error');
        });
    });

    describe('End-to-End User Flows', () => {
        test('complete integration setup flow', async () => {
            // 1. Discover integrations
            const discoverResponse = await fetch(`${API_BASE}/integrations/discover?query=hubspot`);
            const { integrations } = await discoverResponse.json();
            expect(integrations.length).toBeGreaterThan(0);

            const hubspotIntegration = integrations[0];

            // 2. Install integration
            const installResponse = await fetch(`${API_BASE}/integrations/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageName: hubspotIntegration.name })
            });
            expect(installResponse.ok).toBe(true);

            // 3. Configure integration
            const config = {
                clientId: process.env.HUBSPOT_CLIENT_ID || 'test-client-id',
                clientSecret: process.env.HUBSPOT_CLIENT_SECRET || 'test-secret',
                scopes: ['contacts', 'deals']
            };

            const configResponse = await fetch(`${API_BASE}/integrations/hubspot/configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config })
            });
            expect(configResponse.ok).toBe(true);

            // 4. Create dummy user
            const userResponse = await fetch(`${API_BASE}/users/dummy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'HubSpot Test User',
                    email: 'hubspot@test.com',
                    integration: 'hubspot'
                })
            });
            const user = await userResponse.json();

            // 5. Generate test credentials
            const credResponse = await fetch(`${API_BASE}/users/dummy/${user.id}/credentials`, {
                method: 'POST'
            });
            const credentials = await credResponse.json();

            // 6. Create connection
            const connectionResponse = await fetch(`${API_BASE}/connections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    integrationName: 'hubspot',
                    credentials
                })
            });
            const connection = await connectionResponse.json();

            // 7. Test connection
            const testResponse = await fetch(`${API_BASE}/connections/${connection.id}/test`);
            const testResult = await testResponse.json();
            expect(testResult.healthy).toBe(true);

            // 8. Update environment variables
            const envResponse = await fetch(`${API_BASE}/environment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variables: {
                        HUBSPOT_API_KEY: credentials.accessToken,
                        HUBSPOT_PORTAL_ID: '12345678'
                    }
                })
            });
            expect(envResponse.ok).toBe(true);
        }, TEST_TIMEOUT);
    });

    describe('Performance and Load Testing', () => {
        test('should handle concurrent integration discoveries', async () => {
            const concurrentRequests = 10;
            const startTime = Date.now();

            const promises = Array(concurrentRequests).fill(null).map(() =>
                fetch(`${API_BASE}/integrations/discover`)
            );

            const responses = await Promise.all(promises);
            const endTime = Date.now();
            const duration = endTime - startTime;

            // All requests should succeed
            expect(responses.every(r => r.ok)).toBe(true);

            // Should complete within reasonable time (5 seconds for 10 requests)
            expect(duration).toBeLessThan(5000);

            // Verify caching is working (subsequent requests should be faster)
            const cachedStart = Date.now();
            const cachedResponse = await fetch(`${API_BASE}/integrations/discover`);
            const cachedDuration = Date.now() - cachedStart;

            expect(cachedResponse.ok).toBe(true);
            expect(cachedDuration).toBeLessThan(100); // Should be very fast due to caching
        });

        test('should handle large number of dummy users', async () => {
            const userCount = 100;
            const users = [];

            // Create users in batches to avoid overwhelming the server
            const batchSize = 10;
            for (let i = 0; i < userCount; i += batchSize) {
                const batch = Array(Math.min(batchSize, userCount - i)).fill(null).map((_, j) => ({
                    name: `Test User ${i + j}`,
                    email: `user${i + j}@test.com`,
                    integration: 'slack'
                }));

                const promises = batch.map(userData =>
                    fetch(`${API_BASE}/users/dummy`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(userData)
                    }).then(r => r.json())
                );

                const batchUsers = await Promise.all(promises);
                users.push(...batchUsers);
            }

            expect(users).toHaveLength(userCount);

            // List all users and verify pagination
            const listResponse = await fetch(`${API_BASE}/users/dummy?limit=50`);
            const firstPage = await listResponse.json();
            expect(firstPage.users).toHaveLength(50);
            expect(firstPage.hasMore).toBe(true);
            expect(firstPage.total).toBe(userCount);
        });
    });

    describe('Error Handling and Recovery', () => {
        test('should handle invalid integration names gracefully', async () => {
            const response = await fetch(`${API_BASE}/integrations/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ packageName: '@invalid/package-name' })
            });

            expect(response.status).toBe(400);
            const error = await response.json();
            expect(error).toHaveProperty('error');
            expect(error).toHaveProperty('code', 'INVALID_INTEGRATION');
        });

        test('should recover from WebSocket disconnections', async () => {
            // Close WebSocket
            wsClient.close();

            // Wait a moment
            await new Promise(resolve => setTimeout(resolve, 100));

            // Reconnect
            wsClient = new WebSocket(WS_URL);
            await new Promise((resolve, reject) => {
                wsClient.on('open', resolve);
                wsClient.on('error', reject);
            });

            // Verify we can still receive messages
            const messagePromise = new Promise(resolve => {
                wsClient.once('message', resolve);
            });

            // Trigger an event
            await fetch(`${API_BASE}/integrations`);

            // Should receive a message
            await expect(messagePromise).resolves.toBeTruthy();
        });

        test('should validate environment variable names', async () => {
            const invalidVars = {
                '': 'empty-name',
                'has spaces': 'invalid',
                '123starts-with-number': 'invalid',
                'valid_VAR': 'valid',
                'ALSO_VALID': 'valid'
            };

            const response = await fetch(`${API_BASE}/environment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables: invalidVars })
            });

            expect(response.status).toBe(400);
            const error = await response.json();
            expect(error.validationErrors).toBeDefined();
            expect(error.validationErrors.length).toBeGreaterThan(0);
        });
    });
});

// Helper function to wait for server to be ready
async function waitForServer(url, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            const response = await fetch(`${url}/health`);
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // Server not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    throw new Error(`Server failed to start within ${timeout}ms`);
}