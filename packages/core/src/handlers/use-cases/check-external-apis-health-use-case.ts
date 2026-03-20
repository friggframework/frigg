import https from 'node:https';
import http from 'node:http';

export interface ApiDefinition {
    name: string;
    url: string;
}

export interface ApiCheckResult {
    status: string;
    statusCode?: number;
    responseTime: number;
    reachable: boolean;
    error?: string;
}

export interface ExternalApisHealthResult {
    apiStatuses: Record<string, ApiCheckResult>;
    allReachable: boolean;
}

export class CheckExternalApisHealthUseCase {
    apis: ApiDefinition[];

    constructor({ apis = null }: { apis?: ApiDefinition[] | null } = {}) {
        this.apis = apis || [
            { name: 'github', url: 'https://api.github.com/status' },
            { name: 'npm', url: 'https://registry.npmjs.org' },
        ];
    }

    async execute(): Promise<ExternalApisHealthResult> {
        const results = await Promise.all(
            this.apis.map((api) =>
                this._checkExternalAPI(api.url).then((result) => ({
                    name: api.name,
                    ...result,
                }))
            )
        );

        const apiStatuses: Record<string, ApiCheckResult> = {};
        let allReachable = true;

        results.forEach(({ name, ...checkResult }) => {
            apiStatuses[name] = checkResult;
            if (!checkResult.reachable) {
                allReachable = false;
            }
        });

        return { apiStatuses, allReachable };
    }

    _checkExternalAPI(url: string, timeout = 5000): Promise<ApiCheckResult> {
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
                        reachable: (res.statusCode ?? 500) < 500,
                    });
                });

                request.on('error', (error: Error) => {
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
            } catch (error: unknown) {
                resolve({
                    status: 'error',
                    error: (error as Error).message,
                    responseTime: Date.now() - startTime,
                    reachable: false,
                });
            }
        });
    }
}

