const { Router } = require('express');
const { createAppHandler } = require('./../app-handler-helpers');
const { loadAppDefinition } = require('./../app-definition-loader');
const { ModuleFactory } = require('../../modules/module-factory');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../../integrations/utils/map-integration-dto');
const {
    createModuleRepository,
} = require('../../modules/repositories/module-repository-factory');
const {
    createHealthCheckRepository,
} = require('../../database/repositories/health-check-repository-factory');
const { prisma } = require('../../database/prisma');
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
const healthCheckRepository = createHealthCheckRepository({
    prismaClient: prisma,
});

// Load integrations and create factories just like auth router does
// This verifies the system can properly load integrations
let moduleFactory, integrationClasses;
try {
    const appDef = loadAppDefinition();
    integrationClasses = appDef.integrations || [];

    const moduleRepository = createModuleRepository();
    const moduleDefinitions =
        getModulesDefinitionFromIntegrationClasses(integrationClasses);

    moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });
} catch (error) {
    console.error(
        'Failed to load integrations for health check:',
        error.message
    );
    // Factories will be undefined, health check will report unhealthy
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

const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-frigg-health-api-key'];

    if (req.path === '/health') {
        return next();
    }

    if (!apiKey || apiKey !== process.env.HEALTH_API_KEY) {
        console.error('Unauthorized access attempt to health endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - x-frigg-health-api-key header required',
        });
    }

    next();
};

router.use(validateApiKey);

// AWS-specific health checks (VPC, KMS) are lazy-loaded from provider-aws
// to avoid pulling in @aws-sdk on non-AWS platforms.
function getAwsHealthChecks() {
    try {
        return require('@friggframework/provider-aws/health/kms-health-check');
    } catch {
        return null;
    }
}

const checkKmsDecryptCapability = async () => {
    const awsHealth = getAwsHealthChecks();
    if (!awsHealth) {
        return { status: 'skipped', reason: 'AWS provider not available' };
    }
    return awsHealth.checkKmsDecryptCapability();
};

const detectVpcConfiguration = async () => {
    const awsHealth = getAwsHealthChecks();
    if (!awsHealth) {
        return { status: 'skipped', reason: 'AWS provider not available' };
    }
    return awsHealth.detectVpcConfiguration();
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
        response.checks.encryption =
            await checkEncryptionHealthUseCase.execute();
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
        const { apiStatuses, allReachable } =
            await checkExternalApisHealthUseCase.execute();
        response.checks.externalApis = apiStatuses;
        if (!allReachable) {
            response.status = 'unhealthy';
        }
        console.log(
            'External APIs check completed:',
            response.checks.externalApis
        );
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
