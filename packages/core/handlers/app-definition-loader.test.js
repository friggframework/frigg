const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

jest.mock('@friggframework/core/utils', () => ({
    findNearestBackendPackageJson: jest.fn(),
}));

const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const { loadAppDefinition } = require('./app-definition-loader');
const { isDeniedKey } = require('../logs/redact');

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

    it('registers module credential fields and custom schema leaves as denied log keys', () => {
        expect(isDeniedKey('acmePinCode')).toBe(false);
        expect(isDeniedKey('ledgerPin')).toBe(false);
        dirs.push(
            writeBackend({
                integrations: [
                    {
                        Definition: {
                            modules: {
                                acme: {
                                    definition: {
                                        encryption: { credentialFields: ['acme_pin_code'] },
                                    },
                                },
                            },
                        },
                    },
                ],
                encryption: { schema: { Ledger: { fields: ['data.ledger_pin'] } } },
            })
        );

        loadAppDefinition();

        expect(isDeniedKey('acmePinCode')).toBe(true);
        expect(isDeniedKey('ledgerPin')).toBe(true);
    });

    it('still loads when an integration has an unexpected shape', () => {
        dirs.push(writeBackend({ integrations: [{}], encryption: { schema: 'x' } }));

        expect(loadAppDefinition().integrations).toEqual([{}]);
    });
});
