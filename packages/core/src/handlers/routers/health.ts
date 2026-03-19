import { Router } from 'express';
import type { Request, Response } from 'express';
import { createAppHandler } from '../app-handler-helpers';
import { loadAppDefinition } from '../app-definition-loader';
import { CheckExternalApisHealthUseCase } from '../use-cases/check-external-apis-health-use-case';
import { CheckIntegrationsHealthUseCase } from '../use-cases/check-integrations-health-use-case';

// JS modules not yet converted — use require
/* eslint-disable @typescript-eslint/no-var-requires */
const { ModuleFactory } = require('../../../modules/module-factory');
const { getModulesDefinitionFromIntegrationClasses } = require('../../../integrations/utils/map-integration-dto');
const { createModuleRepository } = require('../../../modules/repositories/module-repository-factory');
const { createHealthCheckRepository } = require('../../../database/repositories/health-check-repository-factory');
const { prisma } = require('../../../database/prisma');
const { TestEncryptionUseCase } = require('../../../database/use-cases/test-encryption-use-case');
const { CheckDatabaseHealthUseCase } = require('../../../database/use-cases/check-database-health-use-case');
const { CheckEncryptionHealthUseCase } = require('../../../database/use-cases/check-encryption-health-use-case');
/* eslint-enable @typescript-eslint/no-var-requires */

const router = Router();
const healthCheckRepository = createHealthCheckRepository({ prismaClient: prisma });

// Load integrations and create factories just like auth router does
let moduleFactory: any;
let integrationClasses: any[] = [];
try {
    const appDef = loadAppDefinition();
    integrationClasses = appDef.integrations || [];

    const moduleRepository = createModuleRepository();
    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses(integrationClasses);

    moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });
} catch (error: unknown) {
    console.error('Failed to load integrations for health check:', (error as Error).message);
    moduleFactory = undefined;
    integrationClasses = [];
}

const testEncryptionUseCase = new TestEncryptionUseCase({
    healthCheckRepository,
});
const checkDatabaseHealthUseCase = new CheckDatabaseHealthUseCase({
    healthCheckRepository,
});
const checkEncryptionHealthUseCase = new CheckEncryptionHealthUseCase({
    testEncryptionUseCase,
});
const checkExternalApisHealthUseCase = new CheckExternalApisHealthUseCase();
const checkIntegrationsHealthUseCase = new CheckIntegrationsHealthUseCase({
    moduleFactory,
    integrationClasses,
});

const validateApiKey = (req: Request, res: Response, next: () => void): void => {
    const apiKey = req.headers['x-frigg-health-api-key'] as string | undefined;

    if (req.path === '/health') {
        return next();
    }

    if (!apiKey || apiKey !== process.env.HEALTH_API_KEY) {
        console.error('Unauthorized access attempt to health endpoint');
        res.status(401).json({
            status: 'error',
            message: 'Unauthorized - x-frigg-health-api-key header required',
        });
        return;
    }

    next();
};

router.use(validateApiKey);



// Helper to detect VPC configuration
const detectVpcConfiguration = async (): Promise<any> => {
    const results: any = {
        isInVpc: false,
        hasInternetAccess: false,
        canResolvePublicDns: false,
        canConnectToAws: false,
        vpcEndpoints: [] as string[],
    };

    try {
        const dns = require('dns').promises;

        try {
            await Promise.race([
                dns.resolve4('www.google.com'),
                new Promise((_: any, reject: any) =>
                    setTimeout(() => reject(new Error('timeout')), 2000)
                ),
            ]);
            results.canResolvePublicDns = true;
        } catch (e: any) {
            console.log('Public DNS resolution failed:', e.message);
        }

        try {
            const httpsModule = require('https');
            await new Promise((resolve: any, reject: any) => {
                const req = httpsModule.get(
                    'https://www.google.com',
                    { timeout: 2000 },
                    (res: any) => { res.destroy(); resolve(true); }
                );
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            });
            results.hasInternetAccess = true;
        } catch (e: any) {
            console.log('Internet connectivity test failed:', e.message);
        }

        const region = process.env.AWS_REGION;
        const vpcEndpointDomains = [
            `com.amazonaws.${region}.kms`,
            `com.amazonaws.vpce.${region}`,
            `kms.${region}.amazonaws.com`,
        ];

        for (const domain of vpcEndpointDomains) {
            try {
                const addresses = await Promise.race([
                    dns.resolve4(domain).catch(() => dns.resolve6(domain)),
                    new Promise((_: any, reject: any) => setTimeout(() => reject(new Error('timeout')), 1000)),
                ]);
                if (addresses?.length > 0) {
                    const isPrivateIp = addresses.some((ip: string) =>
                        ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.')
                    );
                    if (isPrivateIp) results.vpcEndpoints.push(domain);
                }
            } catch (_e) { /* expected */ }
        }

        results.isInVpc = process.env.VPC_ENABLED === 'true' ||
            (!results.hasInternetAccess && results.canResolvePublicDns) ||
            results.vpcEndpoints.length > 0;
        results.canConnectToAws = results.hasInternetAccess || results.vpcEndpoints.length > 0;
    } catch (error: any) {
        console.error('VPC detection error:', error.message);
    }

    return results;
};

// KMS decrypt capability check
const checkKmsDecryptCapability = async (): Promise<any> => {
    const start = Date.now();
    const { KMS_KEY_ARN } = process.env;
    if (!KMS_KEY_ARN) {
        return { status: 'skipped', reason: 'KMS_KEY_ARN not configured' };
    }

    console.log('KMS Check Debug:', {
        hasKmsKeyArn: !!KMS_KEY_ARN,
        kmsKeyArnPrefix: KMS_KEY_ARN?.substring(0, 30),
        awsRegion: process.env.AWS_REGION,
        hasDiscoveryKey: !!process.env.AWS_DISCOVERY_KMS_KEY_ID,
    });

    const vpcConfig = await detectVpcConfiguration();
    console.log('VPC Configuration:', vpcConfig);

    try {
        const dns = require('dns').promises;
        const region = process.env.AWS_REGION;
        const kmsEndpoint = `kms.${region}.amazonaws.com`;
        console.log('Testing DNS resolution for:', kmsEndpoint);

        const dnsPromise = dns.resolve4(kmsEndpoint);
        const timeoutPromise = new Promise((_: any, reject: any) =>
            setTimeout(() => reject(new Error('DNS resolution timeout')), 3000)
        );

        const addresses: string[] = await Promise.race([dnsPromise, timeoutPromise]);
        console.log('KMS endpoint resolved to:', addresses);

        const isVpcEndpoint = addresses.some((ip: string) =>
            ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.')
        );
        if (isVpcEndpoint) {
            console.log('KMS VPC Endpoint detected - using private connectivity');
        }

        const net = require('net');
        const testConnection = (): Promise<{ connected: boolean; error?: string }> =>
            new Promise((resolve) => {
                const socket = new net.Socket();
                const connectionTimeout = setTimeout(() => {
                    socket.destroy();
                    resolve({ connected: false, error: 'Connection timeout' });
                }, 3000);

                socket.on('connect', () => {
                    clearTimeout(connectionTimeout);
                    socket.destroy();
                    resolve({ connected: true });
                });
                socket.on('error', (err: Error) => {
                    clearTimeout(connectionTimeout);
                    resolve({ connected: false, error: err.message });
                });
                socket.connect(443, addresses[0]);
            });

        const connResult = await testConnection();
        console.log('TCP connectivity test:', connResult);

        if (!connResult.connected) {
            return {
                status: 'unhealthy',
                error: `Cannot connect to KMS endpoint: ${connResult.error}`,
                dnsResolved: true, tcpConnection: false, vpcConfig,
                latencyMs: Date.now() - start,
            };
        }
    } catch (dnsError: any) {
        console.error('DNS resolution failed:', dnsError.message);
        return {
            status: 'unhealthy',
            error: `Cannot resolve KMS endpoint: ${dnsError.message}`,
            dnsResolved: false, vpcConfig, latencyMs: Date.now() - start,
        };
    }

    try {
        const { KMSClient, GenerateDataKeyCommand, DecryptCommand } = require('@aws-sdk/client-kms');
        const region = process.env.AWS_REGION;

        const kms = new KMSClient({
            region,
            requestHandler: { connectionTimeout: 10000, requestTimeout: 25000 },
            maxAttempts: 1,
        });

        const dataKeyResp = await kms.send(new GenerateDataKeyCommand({ KeyId: KMS_KEY_ARN, KeySpec: 'AES_256' }));
        const decryptResp = await kms.send(new DecryptCommand({ CiphertextBlob: dataKeyResp.CiphertextBlob }));

        const success = Boolean(dataKeyResp.CiphertextBlob && decryptResp.Plaintext);
        return {
            status: success ? 'healthy' : 'unhealthy',
            kmsKeyArnSuffix: KMS_KEY_ARN.slice(-12),
            vpcConfig, latencyMs: Date.now() - start,
        };
    } catch (error: any) {
        return { status: 'unhealthy', error: error.message, vpcConfig, latencyMs: Date.now() - start };
    }
};

router.get('/health', async (_req: Request, res: Response) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'frigg-core-api',
    };
    res.status(200).json(status);
});

router.get('/health/detailed', async (_req: Request, res: Response) => {
    console.log('Starting detailed health check');
    const startTime = Date.now();

    const response: any = {
        service: 'frigg-core-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {} as Record<string, any>,
    };

    console.log('Health Check Environment:', {
        hasKmsKeyArn: !!process.env.KMS_KEY_ARN,
        awsRegion: process.env.AWS_REGION,
        awsDefaultRegion: process.env.AWS_DEFAULT_REGION,
        nodeEnv: process.env.NODE_ENV,
        stage: process.env.STAGE,
    });

    try {
        console.log('Running network diagnostics...');
        const networkStart = Date.now();
        response.checks.network = await Promise.race([
            detectVpcConfiguration(),
            new Promise((_: any, reject: any) =>
                setTimeout(() => reject(new Error('Network diagnostics timeout')), 5000)
            ),
        ]);
        response.checks.network.latencyMs = Date.now() - networkStart;
        console.log('Network diagnostics completed:', response.checks.network);
    } catch (error: any) {
        response.checks.network = { status: 'error', error: error.message };
        console.log('Network diagnostics error:', error.message);
    }

    try {
        console.log('About to check KMS capability...');
        const kmsCheckPromise = checkKmsDecryptCapability();
        const kmsTimeoutPromise = new Promise((_: any, reject: any) =>
            setTimeout(() => reject(new Error('KMS check timeout after 25 seconds')), 25000)
        );
        response.checks.kms = await Promise.race([kmsCheckPromise, kmsTimeoutPromise]);
        if (response.checks.kms.status === 'unhealthy') response.status = 'unhealthy';
        console.log('KMS check completed:', response.checks.kms);
    } catch (error: any) {
        response.checks.kms = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        console.log('KMS check error:', error.message);
    }

    try {
        response.checks.database = await checkDatabaseHealthUseCase.execute();
        if (response.checks.database.status === 'unhealthy') response.status = 'unhealthy';
        console.log('Database check completed:', response.checks.database);
    } catch (error: any) {
        response.checks.database = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        console.log('Database check error:', error.message);
    }

    try {
        response.checks.encryption = await checkEncryptionHealthUseCase.execute();
        if (response.checks.encryption.status === 'unhealthy') response.status = 'unhealthy';
        console.log('Encryption check completed:', response.checks.encryption);
    } catch (error: any) {
        response.checks.encryption = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        console.log('Encryption check error:', error.message);
    }

    try {
        const { apiStatuses, allReachable } = await checkExternalApisHealthUseCase.execute();
        response.checks.externalApis = apiStatuses;
        if (!allReachable) response.status = 'unhealthy';
        console.log('External APIs check completed:', response.checks.externalApis);
    } catch (error: any) {
        response.checks.externalApis = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        console.log('External APIs check error:', error.message);
    }

    try {
        response.checks.integrations = checkIntegrationsHealthUseCase.execute();
        console.log('Integrations check completed:', response.checks.integrations);
    } catch (error: any) {
        response.checks.integrations = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        console.log('Integrations check error:', error.message);
    }

    response.responseTime = Date.now() - startTime;
    const statusCode = response.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);

    console.log('Final health status:', response.status, 'Response time:', response.responseTime);
});

router.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
    });
});

router.get('/health/ready', async (_req: Request, res: Response) => {
    const dbHealth = await checkDatabaseHealthUseCase.execute();
    const isDbReady = dbHealth.status === 'healthy';

    const integrationsHealth = checkIntegrationsHealthUseCase.execute();
    const areModulesReady = integrationsHealth.modules.count > 0;

    const isReady = isDbReady && areModulesReady;

    res.status(isReady ? 200 : 503).json({
        ready: isReady,
        timestamp: new Date().toISOString(),
        checks: {
            database: isDbReady,
            modules: areModulesReady,
        },
    });
});

const handler = createAppHandler('HTTP Event: Health', router);

export { handler, router };