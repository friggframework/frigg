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
});
