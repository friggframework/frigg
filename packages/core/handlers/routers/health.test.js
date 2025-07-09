const request = require('supertest');
const express = require('express');
const { router } = require('./health');
const mongoose = require('mongoose');

// Mock mongoose connection
jest.mock('mongoose', () => ({
    connection: {
        readyState: 1,
        db: {
            admin: () => ({
                ping: jest.fn().mockResolvedValue(true)
            })
        }
    }
}));

// Mock backend-utils
jest.mock('./../backend-utils', () => ({
    moduleFactory: {
        getAll: () => ({
            'test-module': {},
            'another-module': {}
        })
    },
    integrationFactory: {
        getAll: () => ({
            'test-integration': {},
            'another-integration': {}
        })
    }
}));

describe('Health Check Endpoints', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(router);
    });

    describe('GET /health', () => {
        it('should return 200 with basic health status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('service', 'frigg-core-api');
            expect(response.body).toHaveProperty('version');
        });
    });

    describe('GET /health/detailed', () => {
        it('should return 200 with detailed health status when healthy', async () => {
            const response = await request(app)
                .get('/health/detailed')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('checks');
            expect(response.body.checks).toHaveProperty('database');
            expect(response.body.checks).toHaveProperty('external_apis');
            expect(response.body.checks).toHaveProperty('integrations');
            expect(response.body.checks).toHaveProperty('memory');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('responseTime');
        });

        it('should include database connectivity status', async () => {
            const response = await request(app)
                .get('/health/detailed')
                .expect(200);

            expect(response.body.checks.database).toHaveProperty('status', 'healthy');
            expect(response.body.checks.database).toHaveProperty('state', 'connected');
            expect(response.body.checks.database).toHaveProperty('type', 'mongodb');
        });

        it('should include integration information', async () => {
            const response = await request(app)
                .get('/health/detailed')
                .expect(200);

            expect(response.body.checks.integrations).toHaveProperty('status', 'healthy');
            expect(response.body.checks.integrations.modules).toHaveProperty('count', 2);
            expect(response.body.checks.integrations.integrations).toHaveProperty('count', 2);
        });
    });

    describe('GET /health/live', () => {
        it('should return 200 for liveness check', async () => {
            const response = await request(app)
                .get('/health/live')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'alive');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('GET /health/ready', () => {
        it('should return 200 when service is ready', async () => {
            const response = await request(app)
                .get('/health/ready')
                .expect(200);

            expect(response.body).toHaveProperty('ready', true);
            expect(response.body).toHaveProperty('checks');
            expect(response.body.checks).toHaveProperty('database', true);
            expect(response.body.checks).toHaveProperty('modules', true);
        });

        it('should return 503 when database is not connected', async () => {
            // Mock disconnected database
            mongoose.connection.readyState = 0;

            const response = await request(app)
                .get('/health/ready')
                .expect(503);

            expect(response.body).toHaveProperty('ready', false);
            expect(response.body.checks).toHaveProperty('database', false);
        });
    });
});

// Test utility functions
describe('Health Check Utilities', () => {
    it('should handle external API timeouts gracefully', async () => {
        // This would test the checkExternalAPI function
        // In a real implementation, you might want to export this function
        // for easier unit testing
    });
});