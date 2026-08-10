/**
 * Scenario: Integration lifecycle + context loading
 *
 * Seeds real database records, then exercises the FIND_INTEGRATION_BY_EXTERNAL_ID
 * USER_ACTION on TestApiAIntegration. The action sources externalId + type from
 * the hydrated integration itself, so we load context first, then dispatch.
 *
 * Usage: npm test
 */
require('dotenv').config();

const { prisma } = require('@friggframework/core/database/prisma');
const {
    IntegrationEventDispatcher,
} = require('@friggframework/core/handlers/integration-event-dispatcher');
const { createFriggCommands } = require('@friggframework/core');

const TestApiAIntegration = require('../src/integrations/TestApiAIntegration');

let testUserId;
let testCredentialId;
let testEntityId;
let testIntegrationAId;
let testIntegrationBId;

const TEST_EXTERNAL_ID = `shared-entity-${Date.now()}`;

async function setupTestData() {
    console.log('📦 Setting up test data...\n');

    const user = await prisma.user.create({
        data: {
            type: 'INDIVIDUAL',
            username: `test-user-${Date.now()}@example.com`,
            hashword: 'test-hash',
        },
    });
    testUserId = user.id;
    console.log(`1. Created User: id=${user.id}`);

    const credential = await prisma.credential.create({
        data: { userId: testUserId, data: { api_key: 'shared-api-key-12345' } },
    });
    testCredentialId = credential.id;
    console.log(`2. Created Credential: id=${credential.id}`);

    const entity = await prisma.entity.create({
        data: {
            userId: testUserId,
            credentialId: testCredentialId,
            externalId: TEST_EXTERNAL_ID,
            name: 'Shared Entity',
            moduleName: 'test-api-a',
            data: { sharedAccountId: 'acct-shared-123' },
        },
    });
    testEntityId = entity.id;
    console.log(`3. Created Entity: id=${entity.id}, externalId=${entity.externalId}`);

    const integrationA = await prisma.integration.create({
        data: {
            userId: testUserId,
            config: { type: 'test-api-a', settings: { feature: 'A' } },
            version: '1.0.0',
            status: 'ENABLED',
            entities: { connect: [{ id: testEntityId }] },
        },
    });
    testIntegrationAId = integrationA.id;
    console.log(`4. Created Integration A: id=${integrationA.id}, config.type=test-api-a`);

    const integrationB = await prisma.integration.create({
        data: {
            userId: testUserId,
            config: { type: 'test-api-b', settings: { feature: 'B' } },
            version: '1.0.0',
            status: 'ENABLED',
            entities: { connect: [{ id: testEntityId }] },
        },
    });
    testIntegrationBId = integrationB.id;
    console.log(`5. Created Integration B: id=${integrationB.id}, config.type=test-api-b`);

    console.log(
        `\n   Entity ${testEntityId} belongs to BOTH integrations (${testIntegrationAId} and ${testIntegrationBId})\n`
    );
}

async function cleanupTestData() {
    console.log('\n🧹 Cleaning up test data...');
    try {
        if (testIntegrationAId) await prisma.integration.delete({ where: { id: testIntegrationAId } });
        if (testIntegrationBId) await prisma.integration.delete({ where: { id: testIntegrationBId } });
        if (testEntityId) await prisma.entity.delete({ where: { id: testEntityId } });
        if (testCredentialId) await prisma.credential.delete({ where: { id: testCredentialId } });
        if (testUserId) await prisma.user.delete({ where: { id: testUserId } });
        console.log('   Done.');
    } catch (error) {
        console.error('   Error:', error.message);
    }
}

async function runTests() {
    console.log('═'.repeat(60));
    console.log('Testing USER ACTION: FIND_INTEGRATION_BY_EXTERNAL_ID');
    console.log('(externalId + type are sourced from the integration itself)');
    console.log('═'.repeat(60) + '\n');

    const commands = createFriggCommands({
        integrationClass: TestApiAIntegration,
    });

    let passed = 0;
    let failed = 0;

    /**
     * Run one case: invoke fn(), then pass (result, error) to check().
     * check returns true when the case passed. Keeps the per-test
     * try/catch/PASSED/FAILED bookkeeping in one place.
     */
    async function runCase(label, fn, check) {
        console.log(label);
        try {
            const result = await fn();
            console.log(`   Result: ${JSON.stringify(result)}`);
            if (check(result, null)) {
                console.log('   ✅ PASSED\n');
                passed++;
            } else {
                console.log(`   ❌ FAILED: unexpected result: ${JSON.stringify(result)}\n`);
                failed++;
            }
        } catch (error) {
            if (check(null, error)) {
                console.log(`   Error: "${error.message}"`);
                console.log('   ✅ PASSED\n');
                passed++;
            } else {
                console.log(`   ❌ FAILED: ${error.code || error.message}\n`);
                failed++;
            }
        }
    }

    // Load context (hydrate) → dispatch the user action.
    async function dispatchForIntegration(integrationId) {
        const loaded = await commands.loadIntegrationContextById(integrationId);
        if (!loaded.context) {
            throw new Error(
                `Failed to load context: ${loaded.reason || 'unknown error'}`
            );
        }
        const integration = new TestApiAIntegration({
            ...loaded.context.record,
            modules: loaded.context.modules,
        });
        const dispatcher = new IntegrationEventDispatcher(integration);
        return dispatcher.dispatchJob({
            event: 'FIND_INTEGRATION_BY_EXTERNAL_ID',
        });
    }

    // Manually-hydrated integration for error cases (control config/entities).
    async function dispatchForConfig(config, entities) {
        const integration = new TestApiAIntegration({ config, entities });
        const dispatcher = new IntegrationEventDispatcher(integration);
        return dispatcher.dispatchJob({
            event: 'FIND_INTEGRATION_BY_EXTERNAL_ID',
        });
    }

    // Test 1: Integration A → reads its own config.type=test-api-a
    await runCase(
        'Test 1: Hydrate Integration A, dispatch (config.type=test-api-a)',
        () => dispatchForIntegration(testIntegrationAId),
        (result) =>
            result?.success &&
            result.integrationId === testIntegrationAId.toString() &&
            result.integrationType === 'test-api-a'
    );

    // Test 2: Integration B (same shared entity) → reads config.type=test-api-b
    await runCase(
        'Test 2: Hydrate Integration B, dispatch (config.type=test-api-b)',
        () => dispatchForIntegration(testIntegrationBId),
        (result) =>
            result?.success &&
            result.integrationId === testIntegrationBId.toString() &&
            result.integrationType === 'test-api-b'
    );

    // Test 3: config.type matches no integration for the shared entity
    await runCase(
        'Test 3: config.type=unknown-type (manually hydrated)',
        () => dispatchForConfig({ type: 'unknown-type' }, [{ externalId: TEST_EXTERNAL_ID }]),
        (result, error) => error?.code === 'INTEGRATION_NOT_FOUND'
    );

    // Test 4: config has no type
    await runCase(
        'Test 4: config has no type (manually hydrated)',
        () => dispatchForConfig({}, [{ externalId: TEST_EXTERNAL_ID }]),
        (result, error) => error?.code === 'TYPE_REQUIRED'
    );

    return { passed, failed };
}

async function main() {
    console.log('═'.repeat(60));
    console.log('Scenario: Integration lifecycle + context loading');
    console.log('Called from Frigg USER ACTION in TestApiAIntegration');
    console.log('═'.repeat(60) + '\n');

    try {
        await setupTestData();
        const { passed, failed } = await runTests();

        console.log('═'.repeat(60));
        console.log(`Results: ${passed} passed, ${failed} failed`);
        console.log('═'.repeat(60));

        await cleanupTestData();
        await prisma.$disconnect();
        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        await cleanupTestData();
        await prisma.$disconnect();
        process.exit(1);
    }
}

main();
