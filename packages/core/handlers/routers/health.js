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
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized'
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
                    reachable: res.statusCode < 500
                });
            });

            request.on('error', (error) => {
                resolve({
                    status: 'unhealthy',
                    error: error.message,
                    responseTime: Date.now() - startTime,
                    reachable: false
                });
            });

            request.on('timeout', () => {
                request.destroy();
                resolve({
                    status: 'timeout',
                    error: 'Request timeout',
                    responseTime: timeout,
                    reachable: false
                });
            });
        } catch (error) {
            resolve({
                status: 'error',
                error: error.message,
                responseTime: Date.now() - startTime,
                reachable: false
            });
        }
    });
};

const getDatabaseState = () => {
    const stateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    const readyState = mongoose.connection.readyState;
    
    return {
        readyState,
        stateName: stateMap[readyState],
        isConnected: readyState === 1
    };
};

const checkDatabaseHealth = async () => {
    const { stateName, isConnected } = getDatabaseState();
    const result = {
        status: isConnected ? 'healthy' : 'unhealthy',
        state: stateName
    };

    if (isConnected) {
        const pingStart = Date.now();
        await mongoose.connection.db.admin().ping({ maxTimeMS: 2000 });
        result.responseTime = Date.now() - pingStart;
    }

    return result;
};

const getEncryptionConfiguration = () => {
    const { STAGE, BYPASS_ENCRYPTION_STAGE, KMS_KEY_ARN, AES_KEY_ID } = process.env;
    
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
    
    const testSchema = new mongoose.Schema({
        testSecret: { type: String, lhEncrypt: true },
        normalField: { type: String },
        nestedSecret: {
            value: { type: String, lhEncrypt: true }
        }
    }, { timestamps: false });

    testSchema.plugin(Encrypt);
    
    return mongoose.models.TestEncryption || 
        mongoose.model('TestEncryption', testSchema);
};

const createTestDocument = async (TestModel) => {
    const testData = {
        testSecret: 'This is a secret value that should be encrypted',
        normalField: 'This is a normal field that should not be encrypted',
        nestedSecret: {
            value: 'This is a nested secret that should be encrypted'
        }
    };

    const testDoc = new TestModel(testData);
    await testDoc.save();
    
    return { testDoc, testData };
};

const verifyDecryption = (retrievedDoc, originalData) => {
    return retrievedDoc && 
        retrievedDoc.testSecret === originalData.testSecret &&
        retrievedDoc.normalField === originalData.normalField &&
        retrievedDoc.nestedSecret?.value === originalData.nestedSecret.value;
};

const verifyEncryptionInDatabase = async (testDoc, originalData, TestModel) => {
    const collectionName = TestModel.collection.name;
    const rawDoc = await mongoose.connection.db
        .collection(collectionName)
        .findOne({ _id: testDoc._id });

    const secretIsEncrypted = rawDoc && 
        typeof rawDoc.testSecret === 'string' && 
        rawDoc.testSecret.includes(':') && 
        rawDoc.testSecret !== originalData.testSecret;
    
    const nestedIsEncrypted = rawDoc?.nestedSecret?.value && 
        typeof rawDoc.nestedSecret.value === 'string' &&
        rawDoc.nestedSecret.value.includes(':') && 
        rawDoc.nestedSecret.value !== originalData.nestedSecret.value;
    
    const normalNotEncrypted = rawDoc && 
        rawDoc.normalField === originalData.normalField;

    return {
        secretIsEncrypted,
        nestedIsEncrypted,
        normalNotEncrypted
    };
};

const evaluateEncryptionTestResults = (decryptionWorks, encryptionResults) => {
    const { secretIsEncrypted, nestedIsEncrypted, normalNotEncrypted } = encryptionResults;
    
    if (decryptionWorks && secretIsEncrypted && nestedIsEncrypted && normalNotEncrypted) {
        return {
            status: 'enabled',
            testResult: 'Encryption and decryption verified successfully'
        };
    }
    
    if (decryptionWorks && (!secretIsEncrypted || !nestedIsEncrypted)) {
        return {
            status: 'unhealthy',
            testResult: 'Fields are not being encrypted in database'
        };
    }
    
    if (decryptionWorks && !normalNotEncrypted) {
        return {
            status: 'unhealthy',
            testResult: 'Normal fields are being incorrectly encrypted'
        };
    }
    
    return {
        status: 'unhealthy',
        testResult: 'Decryption failed or data mismatch'
    };
};

const testEncryption = async () => {
    const TestModel = createTestEncryptionModel();
    const { testDoc, testData } = await createTestDocument(TestModel);
    
    try {
        const retrievedDoc = await TestModel.findById(testDoc._id);
        const decryptionWorks = verifyDecryption(retrievedDoc, testData);
        const encryptionResults = await verifyEncryptionInDatabase(testDoc, testData, TestModel);
        
        const evaluation = evaluateEncryptionTestResults(decryptionWorks, encryptionResults);
        
        return {
            ...evaluation,
            encryptionWorks: decryptionWorks
        };
    } finally {
        await TestModel.deleteOne({ _id: testDoc._id });
    }
};

const checkEncryptionHealth = async () => {
    const config = getEncryptionConfiguration();
    
    if (config.isBypassed || config.mode === 'none') {
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
                hasAES: config.hasAES
            }
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
                hasAES: config.hasAES
            }
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
                hasAES: config.hasAES
            }
        };
    }
};

const checkExternalAPIs = async () => {
    const apis = [
        { name: 'github', url: 'https://api.github.com/status' },
        { name: 'npm', url: 'https://registry.npmjs.org' }
    ];

    const results = await Promise.all(
        apis.map(api => 
            checkExternalAPI(api.url).then(result => ({ name: api.name, ...result }))
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
        calculateResponseTime: () => Date.now() - startTime
    };
};

router.get('/health', async (_req, res) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'frigg-core-api'
    };

    res.status(200).json(status);
});

router.get('/health/detailed', async (_req, res) => {
    const startTime = Date.now();
    const response = buildHealthCheckResponse(startTime);

    try {
        response.checks.database = await checkDatabaseHealth();
        const dbState = getDatabaseState();
        if (!dbState.isConnected) {
            response.status = 'unhealthy';
        }
    } catch (error) {
        response.checks.database = {
            status: 'unhealthy',
            error: error.message
        };
        response.status = 'unhealthy';
    }

    try {
        response.checks.encryption = await checkEncryptionHealth();
        if (response.checks.encryption.status === 'unhealthy') {
            response.status = 'unhealthy';
        }
    } catch (error) {
        response.checks.encryption = {
            status: 'unhealthy',
            error: error.message
        };
        response.status = 'unhealthy';
    }

    const { apiStatuses, allReachable } = await checkExternalAPIs();
    response.checks.externalApis = apiStatuses;
    if (!allReachable) {
        response.status = 'unhealthy';
    }

    try {
        response.checks.integrations = checkIntegrations();
    } catch (error) {
        response.checks.integrations = {
            status: 'unhealthy',
            error: error.message
        };
        response.status = 'unhealthy';
    }

    response.responseTime = response.calculateResponseTime();
    delete response.calculateResponseTime;

    const statusCode = response.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(response);
});

router.get('/health/live', (_req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
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
            modules: areModulesReady
        }
    });
});

const handler = createAppHandler('HTTP Event: Health', router);

module.exports = { handler, router };