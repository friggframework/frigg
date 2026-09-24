const https = require('https');
const http = require('http');

class CheckExternalApisHealthUseCase {
    constructor({ apis = null } = {}) {
        this.apis = apis || [
            { name: 'github', url: 'https://api.github.com/status' },
            { name: 'npm', url: 'https://registry.npmjs.org' },
        ];
    }

    async execute() {
        const results = await Promise.all(
            this.apis.map((api) =>
                this._checkExternalAPI(api.url).then((result) => ({
                    name: api.name,
                    ...result,
                }))
            )
        );

        const apiStatuses = {};
        let allReachable = true;

        results.forEach(({ name, ...checkResult }) => {
            apiStatuses[name] = checkResult;
            if (!checkResult.reachable) {
                allReachable = false;
            }
        });

        return { apiStatuses, allReachable };
    }

    _checkExternalAPI(url, timeout = 5000) {
        return new Promise((resolve) => {
            const protocol = url.startsWith('https:') ? https : http;
            const startTime = Date.now();

            try {
                const request = protocol.get(url, { timeout }, (res) => {
                    const responseTime = Date.now() - startTime;
                    resolve({
                        status: 'healthy',
                        statusCode: res.statusCode,
                        responseTime,
                        reachable: res.statusCode < 500,
                    });
                });

                request.on('error', (error) => {
                    resolve({
                        status: 'unhealthy',
                        error: error.message,
                        responseTime: Date.now() - startTime,
                        reachable: false,
                    });
                });

                request.on('timeout', () => {
                    request.destroy();
                    resolve({
                        status: 'timeout',
                        error: 'Request timeout',
                        responseTime: timeout,
                        reachable: false,
                    });
                });
            } catch (error) {
                resolve({
                    status: 'error',
                    error: error.message,
                    responseTime: Date.now() - startTime,
                    reachable: false,
                });
            }
        });
    }
}

module.exports = { CheckExternalApisHealthUseCase };
