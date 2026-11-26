const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    validateCommand,
    runModuleValidation,
} = require('..');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const FATHOM_DIR = path.join(FIXTURES, 'fathom-module');
const BAD_DIR = path.join(FIXTURES, 'bad-module');

describe('frigg validate --module', () => {
    let log;
    let cwdSpy;

    beforeEach(() => {
        log = jest.spyOn(console, 'log').mockImplementation(() => {});
        process.exitCode = undefined;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        process.exitCode = undefined;
    });

    const inDir = (dir) => {
        cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(dir);
        return dir;
    };

    it('passes the Fathom fixture with --module', async () => {
        inDir(FATHOM_DIR);

        const report = await validateCommand({ module: true });

        expect(report.errors).toEqual([]);
        expect(process.exitCode).toBeUndefined();
        expect(report.source).toBe(path.join(FATHOM_DIR, 'index.js'));
    });

    it('passes when target is "module" (frigg validate module)', async () => {
        inDir(FATHOM_DIR);

        const report = await validateCommand({ target: 'module' });

        expect(report.errors).toEqual([]);
        expect(process.exitCode).toBeUndefined();
    });

    it('fails the bad fixture listing JSON field paths', async () => {
        inDir(BAD_DIR);

        const report = await validateCommand({ module: true });
        const output = log.mock.calls.flat().join('\n');
        const pointers = report.errors.map((e) => e.pointer);

        expect(process.exitCode).toBe(1);
        expect(pointers).toEqual(
            expect.arrayContaining([
                '/notARealField',
                '/moduleName',
                '/getName',
                '/requiredAuthMethods/getEntityDetails',
                '/requiredAuthMethods/getCredentialDetails',
                '/requiredAuthMethods/testAuthRequest',
                '/requiredAuthMethods/apiPropertiesToPersist',
            ])
        );
        expect(output).toContain('/notARealField');
        expect(output).toContain('/moduleName');
    });

    it('--json prints a machine-readable report for module mode', async () => {
        inDir(BAD_DIR);

        await validateCommand({ module: true, json: true });
        const json = JSON.parse(log.mock.calls[0][0]);

        expect(json).toEqual(
            expect.objectContaining({
                valid: false,
                source: path.join(BAD_DIR, 'index.js'),
                errors: expect.arrayContaining([
                    expect.objectContaining({
                        pointer: '/notARealField',
                        code: 'unknown-key',
                        severity: 'error',
                    }),
                ]),
            })
        );
    });

    it('runModuleValidation reports a missing index.js', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-mod-'));
        try {
            expect(runModuleValidation({ cwd: dir }).errors).toEqual([
                expect.objectContaining({ code: 'module-index-not-found' }),
            ]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('does not change app-mode when --module is absent', async () => {
        // No backend in Fathom fixture dir: app mode should fail to find a backend.
        inDir(FATHOM_DIR);

        const report = await validateCommand({});

        expect(report.errors).toEqual([
            expect.objectContaining({ code: 'backend-not-found' }),
        ]);
        expect(process.exitCode).toBe(1);
        expect(cwdSpy).toHaveBeenCalled();
    });
});
