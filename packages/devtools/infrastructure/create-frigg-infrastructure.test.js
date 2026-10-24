const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('@friggframework/core', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));
jest.mock('./infrastructure-composer', () => ({
    composeServerlessDefinition: jest.fn(async () => ({ service: 'composed' })),
}));

const { findNearestBackendPackageJson } = require('@friggframework/core');
const { composeServerlessDefinition } = require('./infrastructure-composer');
const { createFriggInfrastructure } = require('./create-frigg-infrastructure');

describe('createFriggInfrastructure', () => {
    let dir;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-infra-'));
        fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"backend"}');
        fs.writeFileSync(
            path.join(dir, 'index.js'),
            `class Acme { static Definition = { name: 'acme' }; }
module.exports = { Definition: { name: 'app', integrations: [Acme], user: { usePassword: true } } };`
        );
        findNearestBackendPackageJson.mockReturnValue(
            path.join(dir, 'package.json')
        );
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        jest.restoreAllMocks();
    });

    it('composes the definition with the schema defaults applied (ADR-051)', async () => {
        await createFriggInfrastructure();

        const [definition] = composeServerlessDefinition.mock.calls[0];
        expect(definition.user).toEqual(
            expect.objectContaining({
                usePassword: true,
                individualUserRequired: true,
            })
        );
        expect(definition.integrations[0].Definition.name).toBe('acme');
        expect(typeof definition.integrations[0]).toBe('function');
    });
});
