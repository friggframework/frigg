const path = require('path');

class TestServer {
    constructor() {
        this.app = null;
        this.server = null;
        this.port = null;
        this.originalCwd = null;
        this.isStarted = false;
    }

    async start() {
        if (this.isStarted) {
            throw new Error('TestServer is already started');
        }

        this.originalCwd = process.cwd();
        const testAppPath = path.resolve(__dirname, '../../test-app');
        process.chdir(testAppPath);

        const express = require('express');
        const bodyParser = require('body-parser');
        const cors = require('cors');
        const Boom = require('@hapi/boom');

        const { createIntegrationRouter } = require('@friggframework/core');
        const loadUserManager = require('@friggframework/core/handlers/routers/middleware/loadUser');
        const { router: healthRouter } = require('@friggframework/core/handlers/routers/health');
        const { router: userRouter } = require('@friggframework/core/handlers/routers/user');

        this.app = express();

        this.app.use(bodyParser.json({ limit: '10mb' }));
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(cors({ origin: '*', credentials: true }));
        this.app.use(loadUserManager);

        this.app.use(healthRouter);
        this.app.use(userRouter);
        this.app.use('/api', createIntegrationRouter());

        this.app.use((err, req, res, next) => {
            const boomError = err.isBoom ? err : Boom.boomify(err);
            const { output: { statusCode = 500 } } = boomError;
            if (statusCode >= 500) {
                console.error(err);
                res.status(statusCode).json({ error: 'Internal Server Error' });
            } else {
                res.status(statusCode).json({ error: err.message });
            }
        });

        return new Promise((resolve, reject) => {
            this.server = this.app.listen(0, () => {
                this.port = this.server.address().port;
                this.isStarted = true;
                resolve();
            });

            this.server.on('error', (err) => {
                reject(err);
            });
        });
    }

    async stop() {
        if (!this.isStarted) {
            return;
        }

        if (this.server) {
            await new Promise((resolve) => this.server.close(resolve));
            this.server = null;
        }

        if (this.originalCwd) {
            process.chdir(this.originalCwd);
            this.originalCwd = null;
        }

        this.isStarted = false;
        this.app = null;
        this.port = null;
    }

    getBaseUrl() {
        return `http://localhost:${this.port}`;
    }

    getApp() {
        return this.app;
    }
}

module.exports = { TestServer };
