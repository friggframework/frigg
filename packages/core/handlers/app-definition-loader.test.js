const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('@friggframework/core/utils', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));

const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const { loadAppDefinition } = require('./app-definition-loader');

function writeBackend(definition) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-app-def-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(
        path.join(dir, 'index.js'),
        `module.exports = { Definition: ${JSON.stringify(definition)} };`
    );
    findNearestBackendPackageJson.mockReturnValue(path.join(dir, 'package.json'));
    return dir;
}

describe('loadAppDefinition', () => {
    const dirs = [];

    afterEach(() => {
        for (const dir of dirs.splice(0)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('returns logging from the app definition', () => {
        const logging = { level: 'DEBUG', logGroup: { retentionInDays: 30 } };
        dirs.push(writeBackend({ integrations: [], logging }));

        expect(loadAppDefinition().logging).toEqual(logging);
    });

    it('defaults logging to null', () => {
        dirs.push(writeBackend({ integrations: [] }));

        expect(loadAppDefinition().logging).toBeNull();
    });
});
