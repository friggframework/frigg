const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureMigrationEngines } = require('./migration-engines');

describe('ensureMigrationEngines()', () => {
    const target = 'linux-arm64-openssl-3.0.x';
    const schemaEngine = `schema-engine-${target}`;
    const queryEngineLibrary = `libquery_engine-${target}.so.node`;
    let enginesDir;

    const writeEngines = (...names) => {
        for (const name of names) {
            fs.writeFileSync(path.join(enginesDir, name), '');
        }
    };

    beforeEach(() => {
        enginesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-prisma-engines-'));
    });

    afterEach(() => {
        fs.rmSync(enginesDir, { recursive: true, force: true });
    });

    it('fetches nothing when both engines for the target are already present', async () => {
        writeEngines(schemaEngine, queryEngineLibrary);
        const fetchEngines = jest.fn();

        await ensureMigrationEngines({ prismaBinaryTarget: target, enginesDir, fetchEngines });

        expect(fetchEngines).not.toHaveBeenCalled();
    });

    it('fetches the target engines into the engines directory when one is missing', async () => {
        writeEngines(schemaEngine);
        const fetchEngines = jest.fn(({ enginesDir: dir }) => {
            fs.writeFileSync(path.join(dir, queryEngineLibrary), '');
        });

        await ensureMigrationEngines({ prismaBinaryTarget: target, enginesDir, fetchEngines });

        expect(fetchEngines).toHaveBeenCalledWith({ enginesDir, prismaBinaryTarget: target });
    });

    it.each([
        ['the schema engine', [queryEngineLibrary], schemaEngine],
        ['the query engine library', [schemaEngine], queryEngineLibrary],
        ['both engines', [], `${schemaEngine}, ${queryEngineLibrary}`],
    ])('fails packaging naming %s when the fetch leaves it missing', async (_, present, missing) => {
        writeEngines(...present);
        const fetchEngines = jest.fn();

        await expect(
            ensureMigrationEngines({ prismaBinaryTarget: target, enginesDir, fetchEngines })
        ).rejects.toThrow(missing);
    });

    describe('resolving the engines directory from cwd', () => {
        let root;

        const installEngines = (dir) => {
            const engines = path.join(dir, 'node_modules', '@prisma', 'engines');
            fs.mkdirSync(path.join(engines, 'scripts'), { recursive: true });
            fs.writeFileSync(path.join(engines, 'scripts', 'postinstall.js'), '');
            return engines;
        };

        beforeEach(() => {
            root = fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-app-root-'));
        });

        afterEach(() => {
            fs.rmSync(root, { recursive: true, force: true });
        });

        it("uses the engines in the app's own node_modules", async () => {
            const appDir = path.join(root, 'app');
            const appEngines = installEngines(appDir);
            fs.writeFileSync(path.join(appEngines, schemaEngine), '');
            fs.writeFileSync(path.join(appEngines, queryEngineLibrary), '');
            const fetchEngines = jest.fn();

            await ensureMigrationEngines({ prismaBinaryTarget: target, cwd: appDir, fetchEngines });

            expect(fetchEngines).not.toHaveBeenCalled();
        });

        it('fails with a readable error when only a parent directory has the engines', async () => {
            installEngines(root);
            const appDir = path.join(root, 'app');
            fs.mkdirSync(appDir);
            const fetchEngines = jest.fn();

            const failure = ensureMigrationEngines({
                prismaBinaryTarget: target,
                cwd: appDir,
                fetchEngines,
            });

            await expect(failure).rejects.toThrow(/prisma.*own node_modules.*hoisted parent/is);
            await expect(failure).rejects.not.toHaveProperty('code', 'MODULE_NOT_FOUND');
            expect(fetchEngines).not.toHaveBeenCalled();
        });
    });
});
