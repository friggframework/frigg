const { Router } = require('express');
const { moduleFactory, integrationFactory } = require('./../backend-utils');
const { createAppHandler } = require('./../app-handler-helpers');
const {
    createHealthCheckRepository,
} = require('../../database/repositories/health-check-repository-factory');
const {
    TestEncryptionUseCase,
} = require('../../database/use-cases/test-encryption-use-case');
const {
    CheckDatabaseHealthUseCase,
} = require('../../database/use-cases/check-database-health-use-case');
const {
    CheckEncryptionHealthUseCase,
} = require('../../database/use-cases/check-encryption-health-use-case');
const {
    CheckExternalApisHealthUseCase,
} = require('../use-cases/check-external-apis-health-use-case');
const {
    CheckIntegrationsHealthUseCase,
} = require('../use-cases/check-integrations-health-use-case');

const router = Router();
const healthCheckRepository = createHealthCheckRepository();
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
    integrationFactory,
});

const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (req.path === '/health') {
        return next();
    }

    if (!apiKey || apiKey !== process.env.HEALTH_API_KEY) {
        console.error('Unauthorized access attempt to health endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized',
        });
    }

    next();
};

router.use(validateApiKey);

// Helper to detect VPC configuration
const detectVpcConfiguration = async () => {
    const results = {
        isInVpc: false,
        hasInternetAccess: false,
        canResolvePublicDns: false,
        canConnectToAws: false,
        vpcEndpoints: [],
    };

    try {
        // Check if we're in a VPC by looking for VPC-specific environment
        // Lambda in VPC has specific network interface configuration
        const dns = require('dns').promises;

        // Test 1: Can we resolve public DNS? (indicates DNS configuration)
        try {
            await Promise.race([
                dns.resolve4('www.google.com'),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 2000)
                ),
            ]);
            results.canResolvePublicDns = true;
        } catch (e) {
            console.log('Public DNS resolution failed:', e.message);
        }

        // Test 2: Can we reach internet? (indicates NAT gateway)
        try {
            const https = require('https');
            await new Promise((resolve, reject) => {
                const req = https.get(
                    'https://www.google.com',
                    { timeout: 2000 },
                    (res) => {
                        res.destroy();
                        resolve(true);
                    }
                );
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('timeout'));
                });
            });
            results.hasInternetAccess = true;
        } catch (e) {
            console.log('Internet connectivity test failed:', e.message);
        }

        // Test 3: Check for VPC endpoints by trying to resolve internal AWS endpoints
        const region = process.env.AWS_REGION; // Lambda always provides this
        const vpcEndpointDomains = [
            `com.amazonaws.${region}.kms`,
            `com.amazonaws.vpce.${region}`,
            `kms.${region}.amazonaws.com`,
        ];

        for (const domain of vpcEndpointDomains) {
            try {
                const addresses = await Promise.race([
                    dns.resolve4(domain).catch(() => dns.resolve6(domain)),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('timeout')), 1000)
                    ),
                ]);
                if (addresses && addresses.length > 0) {
                    // Check if it's a private IP (VPC endpoint indicator)
                    const isPrivateIp = addresses.some(
                        (ip) =>
                            ip.startsWith('10.') ||
                            ip.startsWith('172.') ||
                            ip.startsWith('192.168.')
                    );
                    if (isPrivateIp) {
                        results.vpcEndpoints.push(domain);
                    }
                }
            } catch (e) {
                // Expected for non-existent endpoints
            }
        }

        results.isInVpc =
            !results.hasInternetAccess || results.vpcEndpoints.length > 0;
        results.canConnectToAws =
            results.hasInternetAccess || results.vpcEndpoints.length > 0;
    } catch (error) {
        console.error('VPC detection error:', error.message);
    }

    return results;
};

// KMS decrypt capability check
const checkKmsDecryptCapability = async () => {
    const start = Date.now();
    const { KMS_KEY_ARN } = process.env;
    if (!KMS_KEY_ARN) {
        return {
            status: 'skipped',
            reason: 'KMS_KEY_ARN not configured',
        };
    }

    // Log environment for debugging
    console.log('KMS Check Debug:', {
        hasKmsKeyArn: !!KMS_KEY_ARN,
        kmsKeyArnPrefix: KMS_KEY_ARN?.substring(0, 30),
        awsRegion: process.env.AWS_REGION,
        hasDiscoveryKey: !!process.env.AWS_DISCOVERY_KMS_KEY_ID,
    });

    // First, detect VPC configuration
    const vpcConfig = await detectVpcConfiguration();
    console.log('VPC Configuration:', vpcConfig);

    // Test DNS resolution for KMS endpoint
    try {
        const dns = require('dns').promises;
        const region = process.env.AWS_REGION; // Lambda always provides this
        const kmsEndpoint = `kms.${region}.amazonaws.com`;
        console.log('Testing DNS resolution for:', kmsEndpoint);

        // Wrap DNS resolution in a timeout
        const dnsPromise = dns.resolve4(kmsEndpoint);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('DNS resolution timeout')), 3000)
        );

        const addresses = await Promise.race([dnsPromise, timeoutPromise]);
        console.log('KMS endpoint resolved to:', addresses);

        // Check if resolved to private IP (VPC endpoint)
        const isVpcEndpoint = addresses.some(
            (ip) =>
                ip.startsWith('10.') ||
                ip.startsWith('172.') ||
                ip.startsWith('192.168.')
        );

        if (isVpcEndpoint) {
            console.log(
                'KMS VPC Endpoint detected - using private connectivity'
            );
        }

        // Test TCP connectivity to KMS (port 443)
        const net = require('net');
        const testConnection = () =>
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

                socket.on('error', (err) => {
                    clearTimeout(connectionTimeout);
                    resolve({ connected: false, error: err.message });
                });

                // Try connecting to first resolved address on HTTPS port
                socket.connect(443, addresses[0]);
            });

        const connResult = await testConnection();
        console.log('TCP connectivity test:', connResult);

        if (!connResult.connected) {
            return {
                status: 'unhealthy',
                error: `Cannot connect to KMS endpoint: ${connResult.error}`,
                dnsResolved: true,
                tcpConnection: false,
                vpcConfig,
                latencyMs: Date.now() - start,
            };
        }
    } catch (dnsError) {
        console.error('DNS resolution failed:', dnsError.message);
        return {
            status: 'unhealthy',
            error: `Cannot resolve KMS endpoint: ${dnsError.message}`,
            dnsResolved: false,
            vpcConfig,
            latencyMs: Date.now() - start,
        };
    }

    try {
        // Use AWS SDK v3 for consistency with the rest of the codebase
        // eslint-disable-next-line global-require
        const {
            KMSClient,
            GenerateDataKeyCommand,
            DecryptCommand,
        } = require('@aws-sdk/client-kms');

        // Lambda always provides AWS_REGION
        const region = process.env.AWS_REGION;

        const kms = new KMSClient({
            region,
            requestHandler: {
                connectionTimeout: 10000, // 10 second connection timeout
                requestTimeout: 25000, // 25 second timeout for slow VPC connections
            },
            maxAttempts: 1, // No retries on health checks
        });

        // Generate a data key (without plaintext logging) then immediately decrypt ciphertext to ensure decrypt perms.
        const dataKeyResp = await kms.send(
            new GenerateDataKeyCommand({
                KeyId: KMS_KEY_ARN,
                KeySpec: 'AES_256',
            })
        );
        const decryptResp = await kms.send(
            new DecryptCommand({ CiphertextBlob: dataKeyResp.CiphertextBlob })
        );

        const success = Boolean(
            dataKeyResp.CiphertextBlob && decryptResp.Plaintext
        );

        return {
            status: success ? 'healthy' : 'unhealthy',
            kmsKeyArnSuffix: KMS_KEY_ARN.slice(-12),
            vpcConfig,
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
            vpcConfig,
            latencyMs: Date.now() - start,
        };
    }
};

router.get('/health', async (_req, res) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'frigg-core-api',
    };

    res.status(200).json(status);
});

router.get('/health/detailed', async (_req, res) => {
    console.log('Starting detailed health check');
    const startTime = Date.now();

    const response = {
        service: 'frigg-core-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {},
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
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('Network diagnostics timeout')),
                    5000
                )
            ),
        ]);
        response.checks.network.latencyMs = Date.now() - networkStart;
        console.log('Network diagnostics completed:', response.checks.network);
    } catch (error) {
        response.checks.network = {
            status: 'error',
            error: error.message,
        };
        console.log('Network diagnostics error:', error.message);
    }

    try {
        console.log('About to check KMS capability...');
        const kmsCheckPromise = checkKmsDecryptCapability();
        const kmsTimeoutPromise = new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error('KMS check timeout after 25 seconds')),
                25000
            )
        );

        response.checks.kms = await Promise.race([
            kmsCheckPromise,
            kmsTimeoutPromise,
        ]);
        if (response.checks.kms.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        console.log('KMS check completed:', response.checks.kms);
    } catch (error) {
        response.checks.kms = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        console.log('KMS check error:', error.message);
    }

    try {
        response.checks.database = await checkDatabaseHealthUseCase.execute();
        if (response.checks.database.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        console.log('Database check completed:', response.checks.database);
    } catch (error) {
        response.checks.database = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        console.log('Database check error:', error.message);
    }

    try {
        response.checks.encryption = await checkEncryptionHealthUseCase.execute();
        if (response.checks.encryption.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        console.log('Encryption check completed:', response.checks.encryption);
    } catch (error) {
        response.checks.encryption = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        console.log('Encryption check error:', error.message);
    }

    try {
        const { apiStatuses, allReachable } = await checkExternalApisHealthUseCase.execute();
        response.checks.externalApis = apiStatuses;
        if (!allReachable) {
            response.status = 'unhealthy';
        }
        console.log('External APIs check completed:', response.checks.externalApis);
    } catch (error) {
        response.checks.externalApis = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        console.log('External APIs check error:', error.message);
    }

    try {
        response.checks.integrations = checkIntegrationsHealthUseCase.execute();
        console.log('Integrations check completed:', response.checks.integrations);
    } catch (error) {
        response.checks.integrations = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        console.log('Integrations check error:', error.message);
    }

    response.responseTime = Date.now() - startTime;

    const statusCode = response.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);

    console.log(
        'Final health status:',
        response.status,
        'Response time:',
        response.responseTime
    );
});

router.get('/health/live', (_req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
    });
});

router.get('/health/ready', async (_req, res) => {
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

module.exports = { handler, router };
