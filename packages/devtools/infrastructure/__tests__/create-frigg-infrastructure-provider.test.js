/**
 * `node infrastructure.js package` (what a backend's `npm run build` runs)
 * for an app with provider 'netlify': createFriggInfrastructure() builds
 * through provider-netlify and returns an empty serverless definition
 * instead of composing CloudFormation (friggframework/frigg#545, 302ab9ba).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../infrastructure-composer', () => ({
    composeServerlessDefinition: jest.fn(async () => ({ service: 'aws-app' })),
}));
jest.mock('@friggframework/core', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));

const { composeServerlessDefinition } = require('../infrastructure-composer');
const { findNearestBackendPackageJson } = require('@friggframework/core');
const { createFriggInfrastructure } = require('../create-frigg-infrastructure');

function writeProject(definitionSource) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-infra-'));
    const backend = path.join(dir, 'backend');
    fs.mkdirSync(backend);
    fs.writeFileSync(path.join(backend, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(path.join(backend, 'index.js'), `module.exports = { Definition: ${definitionSource} };`);
    findNearestBackendPackageJson.mockReturnValue(path.join(backend, 'package.json'));
    return dir;
}

describe('createFriggInfrastructure with a non-AWS provider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
    });
    afterEach(() => jest.restoreAllMocks());

    it('generates the Netlify project and composes no serverless definition', async () => {
        const dir = writeProject(`{
            provider: 'netlify', integrations: [], database: { postgres: { enable: true } }
        }`);
        try {
            await expect(createFriggInfrastructure()).resolves.toEqual({});
            expect(composeServerlessDefinition).not.toHaveBeenCalled();
            expect(fs.existsSync(path.join(dir, 'netlify.toml'))).toBe(true);
            expect(fs.existsSync(path.join(dir, 'netlify/functions/auth.js'))).toBe(true);
            expect(fs.existsSync(path.join(dir, 'netlify/lib/routers.js'))).toBe(true);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('keeps composing the serverless definition for AWS', async () => {
        const dir = writeProject(`{ provider: 'aws', integrations: [] }`);
        try {
            await expect(createFriggInfrastructure()).resolves.toEqual({ service: 'aws-app' });
            expect(fs.existsSync(path.join(dir, 'netlify.toml'))).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
