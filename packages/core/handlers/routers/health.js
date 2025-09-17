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

    try {
        // eslint-disable-next-line no-console
        console.log('Attempting to save document with encryption...');
        const startTime = Date.now();

        await withTimeout(
            testDoc.save(),
            30000,
            'Save operation timed out after 30 seconds'
        );

        const duration = Date.now() - startTime;
        // eslint-disable-next-line no-console
        console.log(`Test document saved successfully in ${duration}ms`);
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Save operation failed:', {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            mongooseConnectionState: testDoc.db.readyState,
            modelName: TestModel.modelName,
        });

        // Try to get more details about the connection
        if (mongoose.connection && mongoose.connection.db) {
            try {
                const admin = mongoose.connection.db.admin();
                const serverStatus = await admin.serverStatus();
                // eslint-disable-next-line no-console
                console.log('DocumentDB Server Status:', {
                    version: serverStatus.version,
                    uptime: serverStatus.uptime,
                    connections: serverStatus.connections,
                });
            } catch (statusError) {
                // eslint-disable-next-line no-console
                console.error(
                    'Could not get server status:',
                    statusError.message
                );
            }
        }

        throw error;
    }

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

const checkKMSAccess = async () => {
    const { KMS_KEY_ARN } = process.env;

    if (!KMS_KEY_ARN || KMS_KEY_ARN.trim() === '') {
        return {
            status: 'disabled',
            testResult: 'No KMS key configured',
            canAccessKey: false,
        };
    }

    try {
        // eslint-disable-next-line no-console
        console.log(
            'Testing KMS key access with key:',
            KMS_KEY_ARN.substring(0, 50) + '...'
        );

        const AWS = require('aws-sdk');
        const kms = new AWS.KMS();

        // First, check if the master key exists and is accessible
        let keyExists = false;
        let keyMetadata = null;

        try {
            // eslint-disable-next-line no-console
            console.log('Checking if KMS master key exists...');
            const describeResult = await withTimeout(
                kms.describeKey({ KeyId: KMS_KEY_ARN }).promise(),
                5000,
                'KMS describeKey operation timed out after 5 seconds'
            );

            keyMetadata = describeResult.KeyMetadata;
            keyExists = true;
            // eslint-disable-next-line no-console
            console.log('KMS master key found:', {
                KeyId: keyMetadata.KeyId,
                KeyState: keyMetadata.KeyState,
                Enabled: keyMetadata.Enabled,
                KeyUsage: keyMetadata.KeyUsage,
            });
        } catch (describeError) {
            // eslint-disable-next-line no-console
            console.error(
                'KMS master key does not exist or is not accessible:',
                describeError.message
            );

            if (describeError.code === 'NotFoundException') {
                return {
                    status: 'unhealthy',
                    testResult: 'KMS master key not found',
                    canAccessKey: false,
                    error: 'Master key does not exist',
                    keyExists: false,
                };
            } else if (describeError.code === 'AccessDeniedException') {
                return {
                    status: 'unhealthy',
                    testResult: 'No permission to access KMS master key',
                    canAccessKey: false,
                    error: 'Access denied to master key',
                    keyExists: 'unknown',
                };
            }
            // Continue to try generateDataKey even if describeKey fails
            // as permissions might be limited
        }

        // Check if key is in a usable state
        if (keyExists && keyMetadata) {
            // Only 'Enabled' state allows cryptographic operations
            if (keyMetadata.KeyState !== 'Enabled') {
                // eslint-disable-next-line no-console
                console.error(
                    `KMS master key exists but is in state: ${keyMetadata.KeyState}`
                );

                let testResult = '';
                switch (keyMetadata.KeyState) {
                    case 'Disabled':
                        testResult = 'KMS master key is disabled';
                        break;
                    case 'PendingDeletion':
                        testResult = 'KMS master key is pending deletion';
                        break;
                    case 'PendingImport':
                        testResult = 'KMS master key is pending import';
                        break;
                    case 'Unavailable':
                        testResult =
                            'KMS master key is unavailable (custom key store disconnected)';
                        break;
                    case 'Creating':
                        testResult = 'KMS master key is still being created';
                        break;
                    case 'Updating':
                        testResult = 'KMS master key is being updated';
                        break;
                    default:
                        testResult = `KMS master key is in unusable state: ${keyMetadata.KeyState}`;
                }

                return {
                    status: 'unhealthy',
                    testResult,
                    canAccessKey: false,
                    keyExists: true,
                    keyState: keyMetadata.KeyState,
                };
            }
        }

        // Try to generate a data key to test full KMS access
        // eslint-disable-next-line no-console
        console.log('Attempting to generate data key...');
        const startTime = Date.now();
        const result = await withTimeout(
            kms
                .generateDataKey({
                    KeyId: KMS_KEY_ARN,
                    KeySpec: 'AES_256',
                })
                .promise(),
            10000,
            'KMS generateDataKey operation timed out after 10 seconds'
        );

        const responseTime = Date.now() - startTime;

        // If we got a result with plaintext key, KMS access works
        if (result && result.Plaintext) {
            // eslint-disable-next-line no-console
            console.log(
                `KMS key access successful, response time: ${responseTime}ms`
            );
            return {
                status: 'healthy',
                testResult:
                    'Successfully requested and received decrypt key from KMS',
                canAccessKey: true,
                responseTime,
                keyExists: true,
                keyState: keyMetadata?.KeyState || 'Enabled',
            };
        }

        return {
            status: 'unhealthy',
            testResult: 'KMS responded but no key data received',
            canAccessKey: false,
            responseTime,
            keyExists: keyExists,
        };
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('KMS generateDataKey failed:', error.message);

        // Provide more specific error messages based on error codes
        let testResult = `KMS access failed: ${error.message}`;
        if (error.code === 'NotFoundException') {
            testResult = 'KMS master key not found during data key generation';
            // eslint-disable-next-line no-console
            console.error('Master key does not exist in KMS');
        } else if (error.code === 'AccessDeniedException') {
            testResult =
                'Access denied - check IAM permissions for kms:GenerateDataKey';
            // eslint-disable-next-line no-console
            console.error('IAM permissions insufficient for KMS operations');
        } else if (error.code === 'InvalidKeyId.NotFound') {
            testResult = 'Invalid KMS key ID format or key not found';
            // eslint-disable-next-line no-console
            console.error('KMS key ID is invalid or does not exist');
        }

        return {
            status: 'unhealthy',
            testResult,
            canAccessKey: false,
            error: error.message,
            errorCode: error.code,
        };
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

    // Run all health checks in parallel for faster response
    // eslint-disable-next-line no-console
    console.log('Running all health checks in parallel...');

    const [
        kmsResult,
        databaseResult,
        encryptionResult,
        externalApisResult,
        integrationsResult,
    ] = await Promise.allSettled([
        checkKMSAccess(),
        checkDatabaseHealth(),
        checkEncryptionHealth(),
        checkExternalAPIs(),
        Promise.resolve(checkIntegrations()), // Wrap sync function in Promise
    ]);

    // Process KMS check result
    if (kmsResult.status === 'fulfilled') {
        response.checks.kmsAccess = kmsResult.value;
        if (kmsResult.value.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('KMS access check completed:', response.checks.kmsAccess);
    } else {
        response.checks.kmsAccess = {
            status: 'unhealthy',
            error: kmsResult.reason?.message || 'KMS check failed',
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('KMS access check error:', kmsResult.reason?.message);
    }

    // Process database check result
    if (databaseResult.status === 'fulfilled') {
        response.checks.database = databaseResult.value;
        const dbState = getDatabaseState();
        if (!dbState.isConnected) {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('Database check completed:', response.checks.database);
    } else {
        response.checks.database = {
            status: 'unhealthy',
            error: databaseResult.reason?.message || 'Database check failed',
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('Database check error:', databaseResult.reason?.message);
    }

    // Process encryption check result
    if (encryptionResult.status === 'fulfilled') {
        response.checks.encryption = encryptionResult.value;
        if (encryptionResult.value.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('Encryption check completed:', response.checks.encryption);
    } else {
        response.checks.encryption = {
            status: 'unhealthy',
            error: encryptionResult.reason?.message || 'Encryption check failed',
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('Encryption check error:', encryptionResult.reason?.message);
    }

    // Process external APIs check result
    if (externalApisResult.status === 'fulfilled') {
        const { apiStatuses, allReachable } = externalApisResult.value;
        response.checks.externalApis = apiStatuses;
        if (!allReachable) {
            response.status = 'unhealthy';
        }
        // eslint-disable-next-line no-console
        console.log('External APIs check completed:', response.checks.externalApis);
    } else {
        response.checks.externalApis = {
            error: externalApisResult.reason?.message || 'External APIs check failed',
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('External APIs check error:', externalApisResult.reason?.message);
    }

    // Process integrations check result
    if (integrationsResult.status === 'fulfilled') {
        response.checks.integrations = integrationsResult.value;
        // eslint-disable-next-line no-console
        console.log(
            'Integrations check completed:',
            response.checks.integrations
        );
    } else {
        response.checks.integrations = {
            status: 'unhealthy',
            error: integrationsResult.reason?.message || 'Integrations check failed',
        };
        response.status = 'unhealthy';
        // eslint-disable-next-line no-console
        console.log('Integrations check error:', integrationsResult.reason?.message);
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
