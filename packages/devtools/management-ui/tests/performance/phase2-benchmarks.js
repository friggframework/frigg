/**
 * Phase 2 Performance Benchmarks
 * 
 * This suite measures performance metrics for all Phase 2 features:
 * - Integration discovery speed
 * - Installation throughput
 * - UI responsiveness
 * - API response times
 * - WebSocket latency
 * - Memory usage
 */

import { performance } from 'perf_hooks';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const BENCHMARK_PORT = 3002;
const API_BASE = `http://localhost:${BENCHMARK_PORT}/api`;
const WS_URL = `ws://localhost:${BENCHMARK_PORT}`;

class Phase2PerformanceBenchmarks {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            system: {
                platform: os.platform(),
                arch: os.arch(),
                cpus: os.cpus().length,
                totalMemory: os.totalmem(),
                nodeVersion: process.version
            },
            benchmarks: {}
        };
    }

    async run() {
        console.log('Starting Phase 2 Performance Benchmarks...\n');
        
        // Start server
        const serverProcess = await this.startServer();
        
        try {
            // Run all benchmarks
            await this.benchmarkIntegrationDiscovery();
            await this.benchmarkInstallationPerformance();
            await this.benchmarkUserManagement();
            await this.benchmarkConnectionOperations();
            await this.benchmarkEnvironmentVariables();
            await this.benchmarkWebSocketLatency();
            await this.benchmarkUILoadTime();
            await this.benchmarkMemoryUsage();
            await this.benchmarkConcurrentOperations();
            
            // Generate report
            this.generateReport();
            
        } finally {
            // Cleanup
            serverProcess.kill();
        }
    }

    async startServer() {
        console.log('Starting management UI server...');
        const serverProcess = spawn('npm', ['run', 'dev:server'], {
            cwd: path.resolve(__dirname, '../..'),
            env: { ...process.env, PORT: BENCHMARK_PORT }
        });

        // Wait for server to be ready
        await this.waitForServer(API_BASE, 10000);
        return serverProcess;
    }

    async waitForServer(url, timeout = 5000) {
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

    async benchmarkIntegrationDiscovery() {
        console.log('Benchmarking Integration Discovery...');
        const results = {
            coldStart: 0,
            cached: 0,
            searchQueries: {},
            memoryUsage: {}
        };

        // Cold start (no cache)
        const coldStartTime = performance.now();
        const coldResponse = await fetch(`${API_BASE}/integrations/discover`);
        const coldData = await coldResponse.json();
        results.coldStart = performance.now() - coldStartTime;

        // Cached request
        const cachedStartTime = performance.now();
        const cachedResponse = await fetch(`${API_BASE}/integrations/discover`);
        await cachedResponse.json();
        results.cached = performance.now() - cachedStartTime;

        // Search query performance
        const searchQueries = ['slack', 'sales', 'hub', 'api'];
        for (const query of searchQueries) {
            const queryStart = performance.now();
            const response = await fetch(`${API_BASE}/integrations/discover?query=${query}`);
            await response.json();
            results.searchQueries[query] = performance.now() - queryStart;
        }

        // Memory usage
        if (global.gc) {
            global.gc();
            results.memoryUsage.before = process.memoryUsage();
            
            // Load many integrations
            for (let i = 0; i < 100; i++) {
                await fetch(`${API_BASE}/integrations/discover?offset=${i * 20}`);
            }
            
            results.memoryUsage.after = process.memoryUsage();
            results.memoryUsage.delta = {
                heapUsed: results.memoryUsage.after.heapUsed - results.memoryUsage.before.heapUsed,
                external: results.memoryUsage.after.external - results.memoryUsage.before.external
            };
        }

        this.results.benchmarks.integrationDiscovery = results;
        console.log(`  Cold start: ${results.coldStart.toFixed(2)}ms`);
        console.log(`  Cached: ${results.cached.toFixed(2)}ms`);
        console.log(`  Cache speedup: ${(results.coldStart / results.cached).toFixed(2)}x\n`);
    }

    async benchmarkInstallationPerformance() {
        console.log('Benchmarking Installation Performance...');
        const results = {
            singleInstall: 0,
            parallelInstalls: {},
            throughput: 0
        };

        // Single installation
        const singleStart = performance.now();
        await fetch(`${API_BASE}/integrations/install`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packageName: '@friggframework/api-module-test', dryRun: true })
        });
        results.singleInstall = performance.now() - singleStart;

        // Parallel installations
        const parallelCounts = [2, 5, 10];
        for (const count of parallelCounts) {
            const parallelStart = performance.now();
            const promises = Array(count).fill(null).map((_, i) =>
                fetch(`${API_BASE}/integrations/install`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        packageName: `@friggframework/api-module-test-${i}`, 
                        dryRun: true 
                    })
                })
            );
            await Promise.all(promises);
            results.parallelInstalls[count] = performance.now() - parallelStart;
        }

        // Calculate throughput
        results.throughput = 1000 / results.singleInstall; // installs per second

        this.results.benchmarks.installation = results;
        console.log(`  Single install: ${results.singleInstall.toFixed(2)}ms`);
        console.log(`  Throughput: ${results.throughput.toFixed(2)} installs/sec\n`);
    }

    async benchmarkUserManagement() {
        console.log('Benchmarking User Management...');
        const results = {
            createUser: 0,
            listUsers: {},
            generateCredentials: 0,
            bulkOperations: {}
        };

        // Create user
        const createStart = performance.now();
        const createResponse = await fetch(`${API_BASE}/users/dummy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Benchmark User',
                email: 'benchmark@test.com',
                integration: 'test'
            })
        });
        const user = await createResponse.json();
        results.createUser = performance.now() - createStart;

        // List users with different page sizes
        const pageSizes = [10, 50, 100, 500];
        for (const size of pageSizes) {
            const listStart = performance.now();
            await fetch(`${API_BASE}/users/dummy?limit=${size}`);
            results.listUsers[size] = performance.now() - listStart;
        }

        // Generate credentials
        const credStart = performance.now();
        await fetch(`${API_BASE}/users/dummy/${user.id}/credentials`, {
            method: 'POST'
        });
        results.generateCredentials = performance.now() - credStart;

        // Bulk user creation
        const bulkSizes = [10, 50, 100];
        for (const size of bulkSizes) {
            const bulkStart = performance.now();
            const users = Array(size).fill(null).map((_, i) => ({
                name: `Bulk User ${i}`,
                email: `bulk${i}@test.com`,
                integration: 'test'
            }));
            
            await fetch(`${API_BASE}/users/dummy/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users })
            });
            
            results.bulkOperations[size] = performance.now() - bulkStart;
        }

        this.results.benchmarks.userManagement = results;
        console.log(`  Create user: ${results.createUser.toFixed(2)}ms`);
        console.log(`  Generate credentials: ${results.generateCredentials.toFixed(2)}ms\n`);
    }

    async benchmarkConnectionOperations() {
        console.log('Benchmarking Connection Operations...');
        const results = {
            createConnection: 0,
            testConnection: 0,
            listEntities: 0,
            syncOperations: {}
        };

        // Create connection
        const createStart = performance.now();
        const connectionResponse = await fetch(`${API_BASE}/connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: 'benchmark-user',
                integrationName: 'test',
                credentials: { accessToken: 'test-token' }
            })
        });
        const connection = await connectionResponse.json();
        results.createConnection = performance.now() - createStart;

        // Test connection
        const testStart = performance.now();
        await fetch(`${API_BASE}/connections/${connection.id}/test`);
        results.testConnection = performance.now() - testStart;

        // List entities
        const listStart = performance.now();
        await fetch(`${API_BASE}/connections/${connection.id}/entities`);
        results.listEntities = performance.now() - listStart;

        // Sync operations with different data sizes
        const dataSizes = [10, 100, 1000];
        for (const size of dataSizes) {
            const syncStart = performance.now();
            const entities = Array(size).fill(null).map((_, i) => ({
                type: 'contact',
                externalId: `contact-${i}`,
                data: { name: `Contact ${i}`, email: `contact${i}@test.com` }
            }));

            await fetch(`${API_BASE}/connections/${connection.id}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entities })
            });

            results.syncOperations[size] = performance.now() - syncStart;
        }

        this.results.benchmarks.connections = results;
        console.log(`  Create connection: ${results.createConnection.toFixed(2)}ms`);
        console.log(`  Test connection: ${results.testConnection.toFixed(2)}ms\n`);
    }

    async benchmarkEnvironmentVariables() {
        console.log('Benchmarking Environment Variables...');
        const results = {
            readVariables: 0,
            updateSingle: 0,
            updateBulk: {},
            validation: 0
        };

        // Read variables
        const readStart = performance.now();
        await fetch(`${API_BASE}/environment`);
        results.readVariables = performance.now() - readStart;

        // Update single variable
        const updateStart = performance.now();
        await fetch(`${API_BASE}/environment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variables: { BENCHMARK_VAR: 'test-value' }
            })
        });
        results.updateSingle = performance.now() - updateStart;

        // Bulk updates
        const bulkSizes = [5, 20, 50];
        for (const size of bulkSizes) {
            const variables = {};
            for (let i = 0; i < size; i++) {
                variables[`BULK_VAR_${i}`] = `value-${i}`;
            }

            const bulkStart = performance.now();
            await fetch(`${API_BASE}/environment`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ variables })
            });
            results.updateBulk[size] = performance.now() - bulkStart;
        }

        // Validation
        const validationStart = performance.now();
        await fetch(`${API_BASE}/environment/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variables: {
                    VALID_VAR: 'value',
                    'INVALID VAR': 'value',
                    ANOTHER_VALID: 'value'
                }
            })
        });
        results.validation = performance.now() - validationStart;

        this.results.benchmarks.environment = results;
        console.log(`  Read variables: ${results.readVariables.toFixed(2)}ms`);
        console.log(`  Update single: ${results.updateSingle.toFixed(2)}ms\n`);
    }

    async benchmarkWebSocketLatency() {
        console.log('Benchmarking WebSocket Latency...');
        const results = {
            connectionTime: 0,
            messageLatency: [],
            throughput: 0,
            reconnectionTime: 0
        };

        // Connection time
        const connectStart = performance.now();
        const ws = new WebSocket(WS_URL);
        await new Promise((resolve) => ws.on('open', resolve));
        results.connectionTime = performance.now() - connectStart;

        // Message latency (round trip)
        const messageCount = 100;
        for (let i = 0; i < messageCount; i++) {
            const messageStart = performance.now();
            
            const responsePromise = new Promise((resolve) => {
                ws.once('message', resolve);
            });

            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            await responsePromise;
            
            results.messageLatency.push(performance.now() - messageStart);
        }

        // Calculate statistics
        results.avgLatency = results.messageLatency.reduce((a, b) => a + b, 0) / messageCount;
        results.minLatency = Math.min(...results.messageLatency);
        results.maxLatency = Math.max(...results.messageLatency);
        results.throughput = 1000 / results.avgLatency; // messages per second

        // Reconnection time
        ws.close();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const reconnectStart = performance.now();
        const ws2 = new WebSocket(WS_URL);
        await new Promise((resolve) => ws2.on('open', resolve));
        results.reconnectionTime = performance.now() - reconnectStart;
        ws2.close();

        this.results.benchmarks.websocket = results;
        console.log(`  Connection time: ${results.connectionTime.toFixed(2)}ms`);
        console.log(`  Avg latency: ${results.avgLatency.toFixed(2)}ms`);
        console.log(`  Throughput: ${results.throughput.toFixed(2)} msg/sec\n`);
    }

    async benchmarkUILoadTime() {
        console.log('Benchmarking UI Load Time...');
        const results = {
            initialLoad: 0,
            cachedLoad: 0,
            routeTransitions: {},
            componentRenderTimes: {}
        };

        // Initial load
        const initialStart = performance.now();
        const initialResponse = await fetch(`http://localhost:${BENCHMARK_PORT}`);
        await initialResponse.text();
        results.initialLoad = performance.now() - initialStart;

        // Cached load
        const cachedStart = performance.now();
        const cachedResponse = await fetch(`http://localhost:${BENCHMARK_PORT}`);
        await cachedResponse.text();
        results.cachedLoad = performance.now() - cachedStart;

        // API route response times
        const routes = [
            '/integrations',
            '/users',
            '/connections',
            '/environment'
        ];

        for (const route of routes) {
            const routeStart = performance.now();
            await fetch(`${API_BASE}${route}`);
            results.routeTransitions[route] = performance.now() - routeStart;
        }

        this.results.benchmarks.uiPerformance = results;
        console.log(`  Initial load: ${results.initialLoad.toFixed(2)}ms`);
        console.log(`  Cached load: ${results.cachedLoad.toFixed(2)}ms\n`);
    }

    async benchmarkMemoryUsage() {
        console.log('Benchmarking Memory Usage...');
        const results = {
            baseline: process.memoryUsage(),
            afterLoad: {},
            peakUsage: {}
        };

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        // Simulate heavy load
        const operations = [
            { name: 'integrations', fn: () => this.loadIntegrations(1000) },
            { name: 'users', fn: () => this.createUsers(1000) },
            { name: 'connections', fn: () => this.createConnections(100) }
        ];

        for (const op of operations) {
            if (global.gc) global.gc();
            const before = process.memoryUsage();
            
            await op.fn();
            
            const after = process.memoryUsage();
            results.afterLoad[op.name] = {
                heapUsed: after.heapUsed - before.heapUsed,
                external: after.external - before.external,
                rss: after.rss - before.rss
            };
        }

        this.results.benchmarks.memory = results;
        console.log(`  Baseline heap: ${(results.baseline.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`  Peak RSS: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB\n`);
    }

    async benchmarkConcurrentOperations() {
        console.log('Benchmarking Concurrent Operations...');
        const results = {
            mixedWorkload: 0,
            apiConcurrency: {},
            maxConcurrentUsers: 0
        };

        // Mixed workload simulation
        const mixedStart = performance.now();
        const workload = [
            ...Array(10).fill(() => fetch(`${API_BASE}/integrations/discover`)),
            ...Array(5).fill(() => fetch(`${API_BASE}/users/dummy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Test', email: 'test@test.com' })
            })),
            ...Array(5).fill(() => fetch(`${API_BASE}/environment`)),
            ...Array(3).fill(() => fetch(`${API_BASE}/connections`))
        ];

        await Promise.all(workload.map(fn => fn()));
        results.mixedWorkload = performance.now() - mixedStart;

        // API concurrency limits
        const concurrencyLevels = [10, 50, 100, 200];
        for (const level of concurrencyLevels) {
            const concurrentStart = performance.now();
            try {
                await Promise.all(
                    Array(level).fill(null).map(() => 
                        fetch(`${API_BASE}/integrations/discover`)
                    )
                );
                results.apiConcurrency[level] = {
                    time: performance.now() - concurrentStart,
                    success: true
                };
            } catch (error) {
                results.apiConcurrency[level] = {
                    time: performance.now() - concurrentStart,
                    success: false,
                    error: error.message
                };
                results.maxConcurrentUsers = level - 1;
                break;
            }
        }

        this.results.benchmarks.concurrency = results;
        console.log(`  Mixed workload: ${results.mixedWorkload.toFixed(2)}ms`);
        console.log(`  Max concurrent requests: ${results.maxConcurrentUsers || 'Not reached'}\n`);
    }

    // Helper methods
    async loadIntegrations(count) {
        const batchSize = 50;
        for (let i = 0; i < count; i += batchSize) {
            await fetch(`${API_BASE}/integrations/discover?limit=${batchSize}&offset=${i}`);
        }
    }

    async createUsers(count) {
        const batchSize = 100;
        for (let i = 0; i < count; i += batchSize) {
            const users = Array(Math.min(batchSize, count - i)).fill(null).map((_, j) => ({
                name: `Load Test User ${i + j}`,
                email: `loadtest${i + j}@test.com`
            }));

            await fetch(`${API_BASE}/users/dummy/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users })
            });
        }
    }

    async createConnections(count) {
        const promises = Array(count).fill(null).map((_, i) =>
            fetch(`${API_BASE}/connections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: `user-${i}`,
                    integrationName: 'test',
                    credentials: { token: `token-${i}` }
                })
            })
        );

        await Promise.all(promises);
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('PHASE 2 PERFORMANCE BENCHMARK REPORT');
        console.log('='.repeat(60) + '\n');

        // Summary
        console.log('SUMMARY');
        console.log('-'.repeat(30));
        console.log(`Platform: ${this.results.system.platform} (${this.results.system.arch})`);
        console.log(`CPUs: ${this.results.system.cpus}`);
        console.log(`Node Version: ${this.results.system.nodeVersion}`);
        console.log(`Timestamp: ${this.results.timestamp}\n`);

        // Key Metrics
        console.log('KEY PERFORMANCE METRICS');
        console.log('-'.repeat(30));
        console.log(`Integration Discovery (cold): ${this.results.benchmarks.integrationDiscovery.coldStart.toFixed(2)}ms`);
        console.log(`Integration Discovery (cached): ${this.results.benchmarks.integrationDiscovery.cached.toFixed(2)}ms`);
        console.log(`User Creation: ${this.results.benchmarks.userManagement.createUser.toFixed(2)}ms`);
        console.log(`WebSocket Latency: ${this.results.benchmarks.websocket.avgLatency.toFixed(2)}ms`);
        console.log(`UI Initial Load: ${this.results.benchmarks.uiPerformance.initialLoad.toFixed(2)}ms`);
        console.log(`Max Concurrent Users: ${this.results.benchmarks.concurrency.maxConcurrentUsers || '200+'}`);

        // Performance Grades
        console.log('\nPERFORMANCE GRADES');
        console.log('-'.repeat(30));
        this.gradePerformance();

        // Recommendations
        console.log('\nRECOMMENDATIONS');
        console.log('-'.repeat(30));
        this.generateRecommendations();

        // Save detailed report
        const reportPath = path.resolve(__dirname, '../../reports/phase2-performance.json');
        require('fs').writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        console.log(`\nDetailed report saved to: ${reportPath}`);
    }

    gradePerformance() {
        const grades = {
            'Integration Discovery': this.gradeMetric(this.results.benchmarks.integrationDiscovery.cached, 100, 50),
            'User Operations': this.gradeMetric(this.results.benchmarks.userManagement.createUser, 50, 20),
            'WebSocket Performance': this.gradeMetric(this.results.benchmarks.websocket.avgLatency, 10, 5),
            'UI Responsiveness': this.gradeMetric(this.results.benchmarks.uiPerformance.cachedLoad, 200, 100),
            'Concurrency': this.results.benchmarks.concurrency.maxConcurrentUsers >= 100 ? 'A' : 'B'
        };

        for (const [metric, grade] of Object.entries(grades)) {
            console.log(`${metric}: ${grade}`);
        }
    }

    gradeMetric(value, threshold, excellent) {
        if (value <= excellent) return 'A';
        if (value <= threshold) return 'B';
        if (value <= threshold * 2) return 'C';
        return 'D';
    }

    generateRecommendations() {
        const recommendations = [];

        // Check integration discovery
        if (this.results.benchmarks.integrationDiscovery.coldStart > 1000) {
            recommendations.push('- Consider implementing more aggressive caching for integration discovery');
        }

        // Check WebSocket latency
        if (this.results.benchmarks.websocket.avgLatency > 10) {
            recommendations.push('- Optimize WebSocket message handling to reduce latency');
        }

        // Check memory usage
        const memoryGrowth = this.results.benchmarks.memory.afterLoad;
        if (memoryGrowth.integrations && memoryGrowth.integrations.heapUsed > 100 * 1024 * 1024) {
            recommendations.push('- Implement pagination or lazy loading for large integration lists');
        }

        // Check concurrency
        if (this.results.benchmarks.concurrency.maxConcurrentUsers < 100) {
            recommendations.push('- Increase connection pool size or implement request queuing');
        }

        if (recommendations.length === 0) {
            console.log('Performance is within acceptable limits. No immediate optimizations needed.');
        } else {
            recommendations.forEach(rec => console.log(rec));
        }
    }
}

// Run benchmarks if called directly
if (require.main === module) {
    const benchmarks = new Phase2PerformanceBenchmarks();
    benchmarks.run().catch(console.error);
}

export default Phase2PerformanceBenchmarks;