const { Router } = require('express');
const mongoose = require('mongoose');
const https = require('https');
const http = require('http');
const { moduleFactory, integrationFactory } = require('./../backend-utils');
const { createAppHandler } = require('./../app-handler-helpers');

const router = Router();

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

const checkExternalAPI = (url, timeout = 5000) => {
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
};

const getDatabaseState = () => {
    const stateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
    };
    const readyState = mongoose.connection.readyState;

    return {
        readyState,
        stateName: stateMap[readyState],
        isConnected: readyState === 1,
    };
};

const checkDatabaseHealth = async () => {
    const { stateName, isConnected } = getDatabaseState();
    const result = {
        status: isConnected ? 'healthy' : 'unhealthy',
        state: stateName,
    };

    if (isConnected) {
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping({ maxTimeMS: 2000 });
        result.responseTime = Date.now() - pingStart;
    }

    return result;
};

const getEncryptionConfiguration = () => {
    const { STAGE, BYPASS_ENCRYPTION_STAGE, KMS_KEY_ARN, AES_KEY_ID } =
        process.env;

    const defaultBypassStages = ['dev', 'test', 'local'];
    const useEnv = BYPASS_ENCRYPTION_STAGE !== undefined;
    const bypassStages = useEnv
        ? BYPASS_ENCRYPTION_STAGE.split(',').map((s) => s.trim())
        : defaultBypassStages;

    const isBypassed = bypassStages.includes(STAGE);
    const hasAES = AES_KEY_ID && AES_KEY_ID.trim() !== '';
    const hasKMS = KMS_KEY_ARN && KMS_KEY_ARN.trim() !== '' && !hasAES;
    const mode = hasAES ? 'aes' : hasKMS ? 'kms' : 'none';

    return {
        stage: STAGE || null,
        isBypassed,
        hasAES,
        hasKMS,
        mode,
    };
};

const createTestEncryptionModel = () => {
    const { Encrypt } = require('./../../encrypt');

    const testSchema = new mongoose.Schema(
        {
            testSecret: { type: String, lhEncrypt: true },
            normalField: { type: String },
            nestedSecret: {
                value: { type: String, lhEncrypt: true },
            },
        },
        { timestamps: false }
    );

    testSchema.plugin(Encrypt);

    return (
        mongoose.models.TestEncryption ||
        mongoose.model('TestEncryption', testSchema)
    );
};

const verifyDecryption = (retrievedDoc, originalData) => {
    return (
        retrievedDoc &&
        retrievedDoc.testSecret === originalData.testSecret &&
        retrievedDoc.normalField === originalData.normalField &&
        retrievedDoc.nestedSecret?.value === originalData.nestedSecret.value
    );
};

const verifyEncryptionInDatabase = async (testDoc, originalData, TestModel) => {
    const collectionName = TestModel.collection.name;
    const rawDoc = await mongoose.connection.db
        .collection(collectionName)
        .findOne({ _id: testDoc._id });

    const secretIsEncrypted =
        rawDoc &&
        typeof rawDoc.testSecret === 'string' &&
        rawDoc.testSecret.includes(':') &&
        rawDoc.testSecret !== originalData.testSecret;

    const nestedIsEncrypted =
        rawDoc?.nestedSecret?.value &&
        typeof rawDoc.nestedSecret.value === 'string' &&
        rawDoc.nestedSecret.value.includes(':') &&
        rawDoc.nestedSecret.value !== originalData.nestedSecret.value;

    const normalNotEncrypted =
        rawDoc && rawDoc.normalField === originalData.normalField;

    return {
        secretIsEncrypted,
        nestedIsEncrypted,
        normalNotEncrypted,
    };
};

const evaluateEncryptionTestResults = (decryptionWorks, encryptionResults) => {
    const { secretIsEncrypted, nestedIsEncrypted, normalNotEncrypted } =
        encryptionResults;

    if (
        decryptionWorks &&
        secretIsEncrypted &&
        nestedIsEncrypted &&
        normalNotEncrypted
    ) {
        return {
            status: 'enabled',
            testResult: 'Encryption and decryption verified successfully',
        };
    }

    if (decryptionWorks && (!secretIsEncrypted || !nestedIsEncrypted)) {
        return {
            status: 'unhealthy',
            testResult: 'Fields are not being encrypted in database',
        };
    }

    if (decryptionWorks && !normalNotEncrypted) {
        return {
            status: 'unhealthy',
            testResult: 'Normal fields are being incorrectly encrypted',
        };
    }

    return {
        status: 'unhealthy',
        testResult: 'Decryption failed or data mismatch',
    };
};

const withTimeout = (promise, ms, errorMessage) => {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(errorMessage)), ms)
        ),
    ]);
};

const testEncryption = async () => {
    // eslint-disable-next-line no-console
    console.log('Starting encryption test');
    const TestModel = createTestEncryptionModel();
    // eslint-disable-next-line no-console
    console.log('Test model created');

    const testData = {
        testSecret: 'This is a secret value that should be encrypted',
        normalField: 'This is a normal field that should not be encrypted',
        nestedSecret: {
            value: 'This is a nested secret that should be encrypted',
        },
    };

    const testDoc = new TestModel(testData);
    await withTimeout(testDoc.save(), 5000, 'Save operation timed out');
    // eslint-disable-next-line no-console
    console.log('Test document saved');

    try {
        const retrievedDoc = await withTimeout(
            TestModel.findById(testDoc._id),
            5000,
            'Find operation timed out'
        );
        // eslint-disable-next-line no-console
        console.log('Test document retrieved');
        const decryptionWorks = verifyDecryption(retrievedDoc, testData);
        const encryptionResults = await withTimeout(
            verifyEncryptionInDatabase(testDoc, testData, TestModel),
            5000,
            'Database verification timed out'
        );
        // eslint-disable-next-line no-console
        console.log('Encryption verification completed');

        const evaluation = evaluateEncryptionTestResults(
            decryptionWorks,
            encryptionResults
        );

        return {
            ...evaluation,
            encryptionWorks: decryptionWorks,
        };
    } finally {
        await withTimeout(
            TestModel.deleteOne({ _id: testDoc._id }),
            5000,
            'Delete operation timed out'
        );
        // eslint-disable-next-line no-console
        console.log('Test document deleted');
    }
};

const checkEncryptionHealth = async () => {
    const config = getEncryptionConfiguration();

    if (config.isBypassed || config.mode === 'none') {
        // eslint-disable-next-line no-console
        console.log('Encryption check bypassed:', {
            stage: config.stage,
            mode: config.mode,
        });

        const testResult = config.isBypassed
            ? 'Encryption bypassed for this stage'
            : 'No encryption keys configured';

        return {
            status: 'disabled',
            mode: config.mode,
            bypassed: config.isBypassed,
            stage: config.stage,
            testResult,
            encryptionWorks: false,
            debug: {
                hasKMS: config.hasKMS,
                hasAES: config.hasAES,
            },
        };
    }

    try {
        const testResults = await testEncryption();

        return {
            ...testResults,
            mode: config.mode,
            bypassed: config.isBypassed,
            stage: config.stage,
            debug: {
                hasKMS: config.hasKMS,
                hasAES: config.hasAES,
            },
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            mode: config.mode,
            bypassed: config.isBypassed,
            stage: config.stage,
            testResult: `Encryption test failed: ${error.message}`,
            encryptionWorks: false,
            debug: {
                hasKMS: config.hasKMS,
                hasAES: config.hasAES,
            },
        };
    }
};

const checkExternalAPIs = async () => {
    const apis = [
        { name: 'github', url: 'https://api.github.com/status' },
        { name: 'npm', url: 'https://registry.npmjs.org' },
    ];

    const results = await Promise.all(
        apis.map((api) =>
            checkExternalAPI(api.url).then((result) => ({
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
};

const checkIntegrations = () => {
    const moduleTypes = Array.isArray(moduleFactory.moduleTypes)
        ? moduleFactory.moduleTypes
        : [];

    const integrationTypes = Array.isArray(integrationFactory.integrationTypes)
        ? integrationFactory.integrationTypes
        : [];

    return {
        status: 'healthy',
        modules: {
            count: moduleTypes.length,
            available: moduleTypes,
        },
        integrations: {
            count: integrationTypes.length,
            available: integrationTypes,
        },
    };
};

const buildHealthCheckResponse = (startTime) => {
    return {
        service: 'frigg-core-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {},
        calculateResponseTime: () => Date.now() - startTime,
    };
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
        awsDefaultRegion: process.env.AWS_DEFAULT_REGION,
        hasDiscoveryKey: !!process.env.AWS_DISCOVERY_KMS_KEY_ID,
    });

    // Test DNS resolution for KMS endpoint
    try {
        const dns = require('dns').promises;
        const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-central-1';
        const kmsEndpoint = `kms.${region}.amazonaws.com`;
        console.log('Testing DNS resolution for:', kmsEndpoint);
        const addresses = await dns.resolve4(kmsEndpoint);
        console.log('KMS endpoint resolved to:', addresses);

        // Test TCP connectivity to KMS (port 443)
        const net = require('net');
        const testConnection = () => new Promise((resolve) => {
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
                latencyMs: Date.now() - start,
            };
        }
    } catch (dnsError) {
        console.error('DNS resolution failed:', dnsError.message);
        return {
            status: 'unhealthy',
            error: `Cannot resolve KMS endpoint: ${dnsError.message}`,
            dnsResolved: false,
            latencyMs: Date.now() - start,
        };
    }

    try {
        // Lazy load to avoid cost if unused in some environments
        // eslint-disable-next-line global-require
        const AWS = require('aws-sdk');

        // Ensure AWS SDK has proper configuration
        const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
        if (!region) {
            return {
                status: 'unhealthy',
                error: 'AWS_REGION not configured',
                latencyMs: Date.now() - start,
            };
        }

        const kms = new AWS.KMS({
            region,
            httpOptions: {
                timeout: 5000, // 5 second timeout
                connectTimeout: 5000,
            },
            maxRetries: 1, // Don't retry on health checks
        });

        // Generate a data key (without plaintext logging) then immediately decrypt ciphertext to ensure decrypt perms.
        const dataKeyResp = await kms
            .generateDataKey({ KeyId: KMS_KEY_ARN, KeySpec: 'AES_256' })
            .promise();
        const decryptResp = await kms
            .decrypt({ CiphertextBlob: dataKeyResp.CiphertextBlob })
            .promise();

        const success = Boolean(
            dataKeyResp.CiphertextBlob && decryptResp.Plaintext
        );

        return {
            status: success ? 'healthy' : 'unhealthy',
            kmsKeyArnSuffix: KMS_KEY_ARN.slice(-12),
            latencyMs: Date.now() - start,
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error.message,
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
    // eslint-disable-next-line no-console
    console.log('Starting detailed health check');
    const startTime = Date.now();
    const response = buildHealthCheckResponse(startTime);

    // 1. KMS decrypt capability (must succeed before DB assumed healthy if encryption depends on KMS)
    try {
        response.checks.kms = await checkKmsDecryptCapability();
        if (response.checks.kms.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('KMS check completed:', response.checks.kms);
    } catch (error) {
        response.checks.kms = { status: 'unhealthy', error: error.message };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('KMS check error:', error.message);
    }

    try {
        response.checks.database = await checkDatabaseHealth();
        const dbState = getDatabaseState();
        if (!dbState.isConnected) {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('Database check completed:', response.checks.database);
    } catch (error) {
        response.checks.database = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('Database check error:', error.message);
    }

    try {
        response.checks.encryption = await checkEncryptionHealth();
        if (response.checks.encryption.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('Encryption check completed:', response.checks.encryption);
    } catch (error) {
        response.checks.encryption = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('Encryption check error:', error.message);
    }

    const { apiStatuses, allReachable } = await checkExternalAPIs();
    response.checks.externalApis = apiStatuses;
    if (!allReachable) {
        response.status = 'unhealthy';
    }
    // eslint-disable-next-line no-console
    console.log('External APIs check completed:', response.checks.externalApis);

    try {
        response.checks.integrations = checkIntegrations();
        // eslint-disable-next-line no-console
        console.log(
            'Integrations check completed:',
            response.checks.integrations
        );
    } catch (error) {
        response.checks.integrations = {
            status: 'unhealthy',
            error: error.message,
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('Integrations check error:', error.message);
    }

    response.responseTime = response.calculateResponseTime();
    delete response.calculateResponseTime;

    const statusCode = response.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);

    // eslint-disable-next-line no-console
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
    const dbState = getDatabaseState();
    const isDbReady = dbState.isConnected;

    let areModulesReady = false;
    try {
        const moduleTypes = Array.isArray(moduleFactory.moduleTypes)
            ? moduleFactory.moduleTypes
            : [];
        areModulesReady = moduleTypes.length > 0;
    } catch (error) {
        areModulesReady = false;
    }

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
