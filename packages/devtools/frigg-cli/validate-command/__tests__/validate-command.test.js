const fs = require('fs');
const os = require('os');
const path = require('path');

const { validateCommand, runValidation, preflightValidation } = require('..');

const GOOD_INDEX = `
class Api { static requesterType = 'apiKey'; }
const definition = {
    moduleName: 'acme',
    API: Api,
    requiredAuthMethods: {
        getEntityDetails: async () => {},
        getCredentialDetails: async () => {},
        testAuthRequest: async () => {},
        apiPropertiesToPersist: { credential: ['api_key'], entity: [] },
    },
};
class AcmeIntegration {
    static Definition = { name: 'acme', version: '1.0.0', modules: { acme: { definition } } };
}
module.exports = {
    Definition: {
        name: 'frigg-app',
        integrations: [AcmeIntegration],
        user: { usePassword: true },
        encryption: { fieldLevelEncryptionMethod: 'kms', createResourceIfNoneFound: true },
        database: { postgres: { enable: true, management: 'use-existing', endpoint: 'db.example.com' } },
        environment: { DATABASE_URL: true },
    },
};
`;

const BAD_INDEX = `
module.exports = {
    Definition: {
        integrations: [{ name: 'not-a-class' }],
        database: { postgres: { enable: true, management: 'create-new' } },
        encrpytion: { fieldLevelEncryptionMethod: 'kms' },
    },
};
`;

function backend(indexSource) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-validate-'));
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"backend"}');
    fs.writeFileSync(path.join(dir, 'index.js'), indexSource);
    return dir;
}

describe('frigg validate', () => {
    const dirs = [];
    let log;
    let warn;
    let error;
    let exit;

    beforeEach(() => {
        log = jest.spyOn(console, 'log').mockImplementation(() => {});
        warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        error = jest.spyOn(console, 'error').mockImplementation(() => {});
        exit = jest.spyOn(process, 'exit').mockImplementation(() => {});
        process.exitCode = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        process.exitCode = undefined;
        for (const dir of dirs.splice(0))
            fs.rmSync(dir, { recursive: true, force: true });
    });

    const inBackend = (source) => {
        const dir = backend(source);
        dirs.push(dir);
        jest.spyOn(process, 'cwd').mockReturnValue(dir);
        return dir;
    };

    it('passes an app with integration classes and exits 0', async () => {
        inBackend(GOOD_INDEX);

        const report = await validateCommand({ stage: 'prod' });

        expect(report.errors).toEqual([]);
        expect(process.exitCode).toBeUndefined();
        expect(log.mock.calls.flat().join('\n')).toContain(
            'The app definition is valid'
        );
    });

    it('prints errors with pointers and hints and exits 1', async () => {
        inBackend(BAD_INDEX);

        const report = await validateCommand({});
        const output = log.mock.calls.flat().join('\n');

        expect(process.exitCode).toBe(1);
        expect(report.errors.map((e) => e.pointer)).toEqual(
            expect.arrayContaining([
                '/encrpytion',
                '/database/postgres/management',
                '/integrations/0',
            ])
        );
        expect(output).toContain('/encrpytion');
        expect(output).toContain('Did you mean "encryption"?');
        expect(output).toContain(
            'Use one of: "discover", "managed", "use-existing"'
        );
    });

    it('--json prints a machine-readable report', async () => {
        inBackend(BAD_INDEX);

        await validateCommand({ json: true, stage: 'prod' });
        const json = JSON.parse(log.mock.calls[0][0]);

        expect(json).toEqual(
            expect.objectContaining({
                valid: false,
                stage: 'prod',
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        pointer: '/encrpytion',
                        code: 'unknown-key',
                        severity: 'error',
                    }),
                ]),
                warnings: expect.any(Array),
            })
        );
    });

    it('reports a backend that fails to load', () => {
        const dir = backend("require('./missing-file');");
        dirs.push(dir);

        const report = runValidation({ cwd: dir });

        expect(report.errors).toEqual([
            expect.objectContaining({
                code: 'load-failed',
                message: expect.stringContaining('missing-file'),
            }),
        ]);
    });

    it('reports a directory without a backend', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-empty-'));
        dirs.push(dir);

        expect(runValidation({ cwd: dir }).errors).toEqual([
            expect.objectContaining({ code: 'backend-not-found' }),
        ]);
    });

    it('finds the backend/ directory from the project root', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-root-'));
        dirs.push(root);
        fs.mkdirSync(path.join(root, 'backend'));
        fs.writeFileSync(path.join(root, 'backend', 'package.json'), '{}');
        fs.writeFileSync(path.join(root, 'backend', 'index.js'), GOOD_INDEX);

        expect(runValidation({ cwd: root }).source).toBe(
            path.join(root, 'backend', 'index.js')
        );
    });

    it('reports an index.js without a Definition', () => {
        const dir = backend('module.exports = {};');
        dirs.push(dir);

        expect(runValidation({ cwd: dir }).errors).toEqual([
            expect.objectContaining({ code: 'definition-not-exported' }),
        ]);
    });

    describe('preflightValidation', () => {
        it('stops build/deploy on errors', () => {
            inBackend(BAD_INDEX);

            const proceed = preflightValidation({
                command: 'deploy',
                options: { stage: 'prod' },
                failOnErrors: true,
            });

            expect(proceed).toBe(false);
            expect(exit).toHaveBeenCalledWith(1);
            expect(error.mock.calls.flat().join('\n')).toContain(
                '--skip-validate'
            );
        });

        it('lets build/deploy continue on a valid definition', () => {
            inBackend(GOOD_INDEX);

            expect(
                preflightValidation({
                    command: 'build',
                    options: { stage: 'prod' },
                    failOnErrors: true,
                })
            ).toBe(true);
            expect(exit).not.toHaveBeenCalled();
        });

        it('only warns for start', () => {
            inBackend(BAD_INDEX);

            expect(
                preflightValidation({
                    command: 'start',
                    options: {},
                    failOnErrors: false,
                })
            ).toBe(true);
            expect(exit).not.toHaveBeenCalled();
            const output = log.mock.calls.flat().join('\n');
            expect(output).toContain('warning');
            expect(output).not.toMatch(/^\s+error /m);
        });

        it('--skip-validate skips validation, loudly', () => {
            inBackend(BAD_INDEX);

            expect(
                preflightValidation({
                    command: 'deploy',
                    options: { skipValidate: true },
                    failOnErrors: true,
                })
            ).toBe(true);
            expect(exit).not.toHaveBeenCalled();
            expect(warn.mock.calls.flat().join('\n')).toContain(
                'VALIDATION SKIPPED'
            );
        });
    });
});
