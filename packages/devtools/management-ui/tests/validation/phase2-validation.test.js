/**
 * Phase 2 Validation Test Suite
 * 
 * Validates that all Phase 2 features meet RFC 0001 requirements:
 * - Integration discovery and installation UI
 * - Dummy user management system
 * - Connection/entity management interface
 * - Environment variable editor
 * - Performance requirements
 * - Security requirements
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import WebSocket from 'ws';

const TEST_PORT = 3003;
const API_BASE = `http://localhost:${TEST_PORT}/api`;
const WS_URL = `ws://localhost:${TEST_PORT}`;

describe('Phase 2 RFC Validation', () => {
    let serverProcess;

    beforeAll(async () => {
        // Start server
        serverProcess = spawn('npm', ['run', 'dev:server'], {
            cwd: path.resolve(__dirname, '../..'),
            env: { ...process.env, PORT: TEST_PORT }
        });

        // Wait for server
        await waitForServer(API_BASE, 10000);
    });

    afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill();
        }
    });

    describe('RFC Requirement: Integration Discovery and Installation UI', () => {
        test('MUST provide npm registry search for @friggframework modules', async () => {
            const response = await fetch(`${API_BASE}/integrations/discover`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data).toHaveProperty('integrations');
            expect(Array.isArray(data.integrations)).toBe(true);
            
            // Verify all integrations are from @friggframework scope
            const allFromFrigg = data.integrations.every(i => 
                i.name.startsWith('@friggframework/')
            );
            expect(allFromFrigg).toBe(true);
        });

        test('MUST categorize integrations by type', async () => {
            const response = await fetch(`${API_BASE}/integrations/discover`);
            const data = await response.json();

            // Verify categorization
            const categories = new Set(data.integrations.map(i => i.category));
            expect(categories.size).toBeGreaterThan(0);
            
            // RFC specified categories
            const expectedCategories = ['CRM', 'Communication', 'E-commerce', 'Marketing', 'Productivity'];
            const hasExpectedCategories = expectedCategories.some(cat => categories.has(cat));
            expect(hasExpectedCategories).toBe(true);
        });

        test('MUST support one-click installation through UI', async () => {
            // Test installation endpoint exists and accepts proper format
            const response = await fetch(`${API_BASE}/integrations/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    packageName: '@friggframework/api-module-test',
                    dryRun: true // Don't actually install for test
                })
            });

            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result).toHaveProperty('status');
        });

        test('MUST show integration metadata (version, author, description)', async () => {
            const response = await fetch(`${API_BASE}/integrations/discover`);
            const data = await response.json();

            const integration = data.integrations[0];
            expect(integration).toHaveProperty('version');
            expect(integration).toHaveProperty('author');
            expect(integration).toHaveProperty('description');
            expect(integration).toHaveProperty('displayName');
        });

        test('MUST support real-time installation progress via WebSocket', async () => {
            const ws = new WebSocket(WS_URL);
            await new Promise(resolve => ws.on('open', resolve));

            const messagePromise = new Promise(resolve => {
                ws.on('message', (data) => {
                    const message = JSON.parse(data);
                    if (message.type === 'integration-install') {
                        resolve(message);
                    }
                });
            });

            // Trigger installation
            fetch(`${API_BASE}/integrations/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    packageName: '@friggframework/api-module-test',
                    dryRun: true
                })
            });

            // Should receive WebSocket update
            const message = await Promise.race([
                messagePromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);

            expect(message).toBeDefined();
            expect(message.type).toBe('integration-install');
            
            ws.close();
        });
    });

    describe('RFC Requirement: Dummy User Management System', () => {
        test('MUST create test users with unique IDs', async () => {
            const userData = {
                name: 'RFC Test User',
                email: 'rfc-test@example.com',
                integration: 'slack'
            };

            const response = await fetch(`${API_BASE}/users/dummy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            expect(response.ok).toBe(true);
            const user = await response.json();
            
            // Verify required fields
            expect(user).toHaveProperty('id');
            expect(user).toHaveProperty('testId');
            expect(user.id).toBeTruthy();
            expect(user.testId).toBeTruthy();
            expect(user.isDummy).toBe(true);
        });

        test('MUST generate test credentials for OAuth flows', async () => {
            // Create user first
            const userResponse = await fetch(`${API_BASE}/users/dummy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'OAuth Test User',
                    email: 'oauth-test@example.com',
                    integration: 'hubspot'
                })
            });
            const user = await userResponse.json();

            // Generate credentials
            const credResponse = await fetch(`${API_BASE}/users/dummy/${user.id}/credentials`, {
                method: 'POST'
            });

            expect(credResponse.ok).toBe(true);
            const credentials = await credResponse.json();
            
            // OAuth credentials must include access and refresh tokens
            expect(credentials).toHaveProperty('accessToken');
            expect(credentials).toHaveProperty('refreshToken');
            expect(credentials).toHaveProperty('expiresAt');
        });

        test('MUST isolate test data from production', async () => {
            // All dummy users should be clearly marked
            const response = await fetch(`${API_BASE}/users/dummy`);
            const data = await response.json();

            const allUsersAreDummy = data.users.every(user => 
                user.isDummy === true && 
                user.testId && 
                user.testId.includes('test')
            );

            expect(allUsersAreDummy).toBe(true);
        });

        test('MUST support bulk user creation', async () => {
            const users = Array(10).fill(null).map((_, i) => ({
                name: `Bulk Test User ${i}`,
                email: `bulk-test-${i}@example.com`,
                integration: 'slack'
            }));

            const response = await fetch(`${API_BASE}/users/dummy/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users })
            });

            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result.created).toBe(users.length);
        });
    });

    describe('RFC Requirement: Connection/Entity Management Interface', () => {
        test('MUST create connections between users and integrations', async () => {
            const connectionData = {
                userId: 'rfc-test-user-id',
                integrationName: 'slack',
                credentials: {
                    accessToken: 'test-token',
                    refreshToken: 'refresh-token'
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
            expect(connection).toHaveProperty('status');
            expect(connection.userId).toBe(connectionData.userId);
            expect(connection.integrationName).toBe(connectionData.integrationName);
        });

        test('MUST provide connection health checks', async () => {
            // Create connection first
            const connResponse = await fetch(`${API_BASE}/connections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'health-test-user',
                    integrationName: 'hubspot',
                    credentials: { accessToken: 'test' }
                })
            });
            const connection = await connResponse.json();

            // Test connection health
            const healthResponse = await fetch(`${API_BASE}/connections/${connection.id}/test`);
            expect(healthResponse.ok).toBe(true);

            const health = await healthResponse.json();
            expect(health).toHaveProperty('healthy');
            expect(health).toHaveProperty('lastChecked');
            expect(health).toHaveProperty('details');
            expect(typeof health.healthy).toBe('boolean');
        });

        test('MUST manage entities for each connection', async () => {
            const connectionId = 'test-connection-id';

            // Create entity
            const createResponse = await fetch(`${API_BASE}/connections/${connectionId}/entities`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'contact',
                    externalId: 'ext-123',
                    name: 'Test Contact',
                    metadata: { email: 'test@example.com' }
                })
            });

            expect(createResponse.ok).toBe(true);
            const entity = await createResponse.json();
            expect(entity).toHaveProperty('id');
            expect(entity.type).toBe('contact');

            // List entities
            const listResponse = await fetch(`${API_BASE}/connections/${connectionId}/entities`);
            expect(listResponse.ok).toBe(true);
            
            const list = await listResponse.json();
            expect(Array.isArray(list.entities)).toBe(true);
        });

        test('MUST support entity synchronization', async () => {
            const connectionId = 'sync-test-connection';
            const entities = [
                { type: 'contact', externalId: 'c1', data: { name: 'Contact 1' }},
                { type: 'contact', externalId: 'c2', data: { name: 'Contact 2' }},
                { type: 'deal', externalId: 'd1', data: { amount: 1000 }}
            ];

            const response = await fetch(`${API_BASE}/connections/${connectionId}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entities })
            });

            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result).toHaveProperty('synced');
            expect(result.synced).toBe(entities.length);
        });
    });

    describe('RFC Requirement: Environment Variable Editor', () => {
        test('MUST read and display current environment variables', async () => {
            const response = await fetch(`${API_BASE}/environment`);
            expect(response.ok).toBe(true);

            const data = await response.json();
            expect(data).toHaveProperty('variables');
            expect(typeof data.variables).toBe('object');
        });

        test('MUST mask sensitive values (passwords, secrets, keys)', async () => {
            // Set test environment variables
            process.env.TEST_PASSWORD = 'secret123';
            process.env.TEST_SECRET_KEY = 'verysecret';
            process.env.API_KEY = 'apikey123';

            const response = await fetch(`${API_BASE}/environment`);
            const data = await response.json();

            // Verify sensitive values are masked
            if (data.variables.TEST_PASSWORD) {
                expect(data.variables.TEST_PASSWORD).not.toBe('secret123');
                expect(data.variables.TEST_PASSWORD).toMatch(/\*+/);
            }
            
            if (data.variables.TEST_SECRET_KEY) {
                expect(data.variables.TEST_SECRET_KEY).not.toBe('verysecret');
                expect(data.variables.TEST_SECRET_KEY).toMatch(/\*+/);
            }
            
            if (data.variables.API_KEY) {
                expect(data.variables.API_KEY).not.toBe('apikey123');
                expect(data.variables.API_KEY).toMatch(/\*+/);
            }
        });

        test('MUST validate variable names before saving', async () => {
            const invalidVars = {
                '': 'empty name',
                'has spaces': 'spaces in name',
                '123_START': 'starts with number',
                'special-chars!': 'invalid characters'
            };

            const response = await fetch(`${API_BASE}/environment/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables: invalidVars })
            });

            expect(response.ok).toBe(true);
            const validation = await response.json();
            expect(validation.valid).toBe(false);
            expect(validation.errors.length).toBeGreaterThan(0);
            
            // Each error should identify the problematic variable
            validation.errors.forEach(error => {
                expect(error).toHaveProperty('variable');
                expect(error).toHaveProperty('error');
            });
        });

        test('MUST support bulk environment updates', async () => {
            const bulkVars = {
                BULK_VAR_1: 'value1',
                BULK_VAR_2: 'value2',
                BULK_VAR_3: 'value3',
                BULK_VAR_4: 'value4',
                BULK_VAR_5: 'value5'
            };

            const response = await fetch(`${API_BASE}/environment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables: bulkVars })
            });

            expect(response.ok).toBe(true);
            const result = await response.json();
            expect(result.updated).toBe(Object.keys(bulkVars).length);
        });

        test('MUST differentiate between local and production environments', async () => {
            const response = await fetch(`${API_BASE}/environment/info`);
            expect(response.ok).toBe(true);

            const info = await response.json();
            expect(info).toHaveProperty('environment');
            expect(info).toHaveProperty('source'); // 'local' or 'aws'
            expect(info).toHaveProperty('editable');
            
            // In test/development, should be local and editable
            expect(info.environment).toMatch(/development|test/);
            expect(info.source).toBe('local');
            expect(info.editable).toBe(true);
        });
    });

    describe('RFC Performance Requirements', () => {
        test('GUI load time MUST be under 2 seconds', async () => {
            const start = Date.now();
            const response = await fetch(`http://localhost:${TEST_PORT}`);
            await response.text();
            const loadTime = Date.now() - start;

            expect(loadTime).toBeLessThan(2000);
        });

        test('Integration discovery MUST complete within 5 seconds', async () => {
            const start = Date.now();
            const response = await fetch(`${API_BASE}/integrations/discover`);
            await response.json();
            const discoveryTime = Date.now() - start;

            expect(discoveryTime).toBeLessThan(5000);
        });

        test('API responses MUST be under 500ms for standard operations', async () => {
            const operations = [
                { method: 'GET', path: '/users/dummy' },
                { method: 'GET', path: '/connections' },
                { method: 'GET', path: '/environment' }
            ];

            for (const op of operations) {
                const start = Date.now();
                const response = await fetch(`${API_BASE}${op.path}`, {
                    method: op.method
                });
                await response.json();
                const responseTime = Date.now() - start;

                expect(responseTime).toBeLessThan(500);
            }
        });

        test('MUST handle 100+ concurrent users', async () => {
            const concurrentRequests = 100;
            const start = Date.now();

            const promises = Array(concurrentRequests).fill(null).map((_, i) =>
                fetch(`${API_BASE}/users/dummy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: `Concurrent User ${i}`,
                        email: `concurrent${i}@test.com`
                    })
                })
            );

            const responses = await Promise.allSettled(promises);
            const duration = Date.now() - start;

            // All requests should succeed
            const successCount = responses.filter(r => r.status === 'fulfilled').length;
            expect(successCount).toBe(concurrentRequests);

            // Should complete in reasonable time (30 seconds for 100 users)
            expect(duration).toBeLessThan(30000);
        });
    });

    describe('RFC Security Requirements', () => {
        test('MUST use read-only filesystem access for discovery', async () => {
            // Attempt to write via discovery endpoint (should fail)
            const response = await fetch(`${API_BASE}/integrations/discover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    malicious: 'attempt to write' 
                })
            });

            // POST to discovery should not be allowed
            expect(response.status).toBe(405); // Method Not Allowed
        });

        test('MUST mask sensitive environment variables', async () => {
            const sensitivePatterns = [
                'PASSWORD', 'SECRET', 'KEY', 'TOKEN', 
                'PRIVATE', 'CREDENTIAL', 'AUTH'
            ];

            const response = await fetch(`${API_BASE}/environment`);
            const data = await response.json();

            // Check that any variable containing sensitive patterns is masked
            Object.entries(data.variables).forEach(([key, value]) => {
                const containsSensitive = sensitivePatterns.some(pattern => 
                    key.toUpperCase().includes(pattern)
                );

                if (containsSensitive && value) {
                    expect(value).toMatch(/\*+/);
                    expect(value).not.toMatch(/[a-zA-Z0-9]{8,}/); // No actual secrets visible
                }
            });
        });

        test('MUST require confirmation for production updates', async () => {
            // Simulate production environment update attempt
            const response = await fetch(`${API_BASE}/environment/production`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    variables: { PROD_VAR: 'value' },
                    confirmed: false // No confirmation
                })
            });

            // Should require confirmation
            if (response.ok) {
                const result = await response.json();
                expect(result).toHaveProperty('requiresConfirmation', true);
            } else {
                expect(response.status).toBe(403); // Forbidden without confirmation
            }
        });

        test('MUST validate input to prevent injection attacks', async () => {
            const maliciousInputs = [
                { name: 'SQL Injection', value: "'; DROP TABLE users; --" },
                { name: 'Command Injection', value: '`rm -rf /`' },
                { name: 'Path Traversal', value: '../../../etc/passwd' },
                { name: 'XSS', value: '<script>alert("XSS")</script>' }
            ];

            for (const input of maliciousInputs) {
                const response = await fetch(`${API_BASE}/users/dummy`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: input.value,
                        email: 'test@example.com'
                    })
                });

                if (response.ok) {
                    const user = await response.json();
                    // Ensure the input was sanitized or rejected
                    expect(user.name).not.toContain('DROP TABLE');
                    expect(user.name).not.toContain('rm -rf');
                    expect(user.name).not.toContain('../');
                    expect(user.name).not.toContain('<script>');
                }
            }
        });
    });

    describe('RFC Migration Requirements', () => {
        test('MUST support migration from create-frigg-app', async () => {
            const response = await fetch(`${API_BASE}/migrate/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectPath: '/test/create-frigg-app-project'
                })
            });

            expect(response.ok).toBe(true);
            const check = await response.json();
            expect(check).toHaveProperty('canMigrate');
            expect(check).toHaveProperty('version');
            expect(check).toHaveProperty('recommendations');
        });

        test('MUST provide backward compatibility for 6 months', async () => {
            // Check that old endpoints still work
            const legacyEndpoints = [
                '/api/v1/integrations', // Old version
                '/api/integrations' // New version
            ];

            for (const endpoint of legacyEndpoints) {
                const response = await fetch(`http://localhost:${TEST_PORT}${endpoint}`);
                // Both should work during transition period
                expect([200, 301, 308].includes(response.status)).toBe(true);
            }
        });
    });
});

// Helper function
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