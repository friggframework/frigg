/**
 * ADR-059: the worker entry point hands every queue worker the app registry's
 * module definitions, so workers and HTTP handlers offer the same entity types.
 */
const mockModuleDefinitions = [
    { moduleName: 'hubspot' },
    { moduleName: 'xero' },
];
class mockSync {
    static Definition = { name: 'sync' };
}

jest.mock('@friggframework/core', () => ({
    createHandler: jest.fn((options) => options),
}));
jest.mock('../app-definition-loader', () => ({
    loadAppDefinition: () => ({
        integrations: [mockSync],
        moduleDefinitions: mockModuleDefinitions,
    }),
}));
jest.mock('../backend-utils', () => ({
    createQueueWorker: jest.fn(() => class {}),
}));

const { createQueueWorker } = require('../backend-utils');
const { handlers } = require('./integration-defined-workers');

describe('integration-defined-workers and the entity registry (ADR-059)', () => {
    it('creates each queue worker with the app moduleDefinitions', () => {
        expect(Object.keys(handlers)).toEqual(['sync']);
        expect(createQueueWorker).toHaveBeenCalledWith(mockSync, {
            moduleDefinitions: mockModuleDefinitions,
        });
    });
});
