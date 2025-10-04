/**
 * GetAuthorizationRequirementsUseCase Unit Tests
 */

const { GetAuthorizationRequirementsUseCase } = require('../../../use-cases/get-authorization-requirements');
const { getTestModuleDefinitions } = require('../../helpers/auth-test-helpers');

describe('GetAuthorizationRequirementsUseCase', () => {
    let useCase;
    let moduleDefinitions;

    beforeEach(() => {
        moduleDefinitions = getTestModuleDefinitions();
        useCase = new GetAuthorizationRequirementsUseCase({
            moduleDefinitions,
        });
    });

    describe('Constructor', () => {
        it('should require moduleDefinitions array', () => {
            expect(() => {
                new GetAuthorizationRequirementsUseCase({});
            }).toThrow('moduleDefinitions array is required');
        });
    });

    describe('execute - Multi-Step Module (Nagaris)', () => {
        it('should return requirements for step 1', async () => {
            const result = await useCase.execute('nagaris', 1);

            expect(result.type).toBe('email');
            expect(result.step).toBe(1);
            expect(result.totalSteps).toBe(2);
            expect(result.isMultiStep).toBe(true);
            expect(result.data.jsonSchema).toBeDefined();
            expect(result.data.jsonSchema.properties.email).toBeDefined();
        });

        it('should return requirements for step 2', async () => {
            const result = await useCase.execute('nagaris', 2);

            expect(result.type).toBe('otp');
            expect(result.step).toBe(2);
            expect(result.totalSteps).toBe(2);
            expect(result.isMultiStep).toBe(true);
            expect(result.data.jsonSchema.properties.otp).toBeDefined();
        });
    });

    describe('execute - Single-Step Module (HubSpot)', () => {
        it('should return requirements for single step', async () => {
            const result = await useCase.execute('hubspot', 1);

            expect(result.type).toBe('oauth2');
            expect(result.step).toBe(1);
            expect(result.totalSteps).toBe(1);
            expect(result.isMultiStep).toBe(false);
            expect(result.url).toBeDefined();
        });

        it('should default to step 1 when not provided', async () => {
            const result = await useCase.execute('hubspot');

            expect(result.step).toBe(1);
        });
    });

    describe('Validation', () => {
        it('should throw error when entityType is missing', async () => {
            await expect(
                useCase.execute('')
            ).rejects.toThrow('entityType is required');
        });

        it('should throw error when module not found', async () => {
            await expect(
                useCase.execute('unknown')
            ).rejects.toThrow('Module definition not found: unknown');
        });

        it('should throw error when step exceeds max steps', async () => {
            await expect(
                useCase.execute('nagaris', 5)
            ).rejects.toThrow('Step 5 exceeds maximum steps (2) for nagaris');
        });

        it('should throw error when step is less than 1', async () => {
            await expect(
                useCase.execute('nagaris', 0)
            ).rejects.toThrow('step must be >= 1');
        });
    });
});
