const micromatch = require('micromatch');
const {
    LAMBDA_ARCHITECTURES,
    resolveLambdaArchitecture,
    prismaEngineFileNames,
    foreignPrismaEngineExcludes,
    bundledPrismaEngineExcludes,
} = require('./lambda-architectures');

describe('resolveLambdaArchitecture()', () => {
    it('resolves to x86_64 with the rhel engine when the key is unset', () => {
        expect(resolveLambdaArchitecture({})).toEqual({
            name: 'x86_64',
            prismaBinaryTarget: 'rhel-openssl-3.0.x',
            explicit: false,
        });
    });

    it('resolves an explicit x86_64', () => {
        expect(resolveLambdaArchitecture({ architecture: 'x86_64' })).toEqual({
            name: 'x86_64',
            prismaBinaryTarget: 'rhel-openssl-3.0.x',
            explicit: true,
        });
    });

    it('resolves arm64 to the linux-arm64 engine', () => {
        expect(resolveLambdaArchitecture({ architecture: 'arm64' })).toEqual({
            name: 'arm64',
            prismaBinaryTarget: 'linux-arm64-openssl-3.0.x',
            explicit: true,
        });
    });

    it('throws on an unknown architecture, naming the accepted ones', () => {
        expect(() =>
            resolveLambdaArchitecture({ architecture: 'aarch64' })
        ).toThrow(/aarch64.*x86_64.*arm64/);
    });

    it('uses the AWS architecture names as registry keys', () => {
        expect(Object.keys(LAMBDA_ARCHITECTURES)).toEqual(['x86_64', 'arm64']);
    });
});

describe('prismaEngineFileNames()', () => {
    it('names the schema engine and the query engine library the migrate CLI needs for a target', () => {
        expect(prismaEngineFileNames('linux-arm64-openssl-3.0.x')).toEqual({
            schemaEngine: 'schema-engine-linux-arm64-openssl-3.0.x',
            queryEngineLibrary: 'libquery_engine-linux-arm64-openssl-3.0.x.so.node',
        });
    });
});

describe('foreignPrismaEngineExcludes()', () => {
    const matches = (name, filePath) =>
        micromatch([filePath], foreignPrismaEngineExcludes(name), {
            dot: true,
        }).length > 0;

    const foreignEngineFiles = {
        x86_64: [
            'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node',
            'node_modules/@prisma/engines/schema-engine-darwin-arm64',
            'node_modules/.prisma/client/query_engine-windows.dll.node',
            'node_modules/@prisma/engines/query-engine-debian-openssl-3.0.x',
            'node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node',
            'node_modules/@prisma/engines/libquery_engine-linux-musl-openssl-3.0.x.so.node',
            'node_modules/@prisma/engines/schema-engine-linux-arm64-openssl-3.0.x',
            'node_modules/@prisma/engines/libquery_engine-linux-arm64-openssl-3.0.x.so.node',
        ],
        arm64: [
            'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node',
            'node_modules/.prisma/client/query_engine-windows.dll.node',
            'node_modules/@prisma/engines/libquery_engine-linux-musl-openssl-3.0.x.so.node',
            'node_modules/@prisma/engines/schema-engine-rhel-openssl-3.0.x',
            'node_modules/@prisma/engines/libquery_engine-rhel-openssl-3.0.x.so.node',
        ],
    };

    const targetEngineFiles = {
        x86_64: [
            'node_modules/@prisma/engines/schema-engine-rhel-openssl-3.0.x',
            'node_modules/@prisma/engines/libquery_engine-rhel-openssl-3.0.x.so.node',
        ],
        arm64: [
            'node_modules/@prisma/engines/schema-engine-linux-arm64-openssl-3.0.x',
            'node_modules/@prisma/engines/libquery_engine-linux-arm64-openssl-3.0.x.so.node',
        ],
    };

    const nonEngineFiles = [
        'node_modules/is-windows/index.js',
        'node_modules/is-windows/package.json',
        'node_modules/darwin-utils/lib/index.js',
        'node_modules/some-pkg/lib/debian-release.js',
        'node_modules/some-pkg/linux-musl-detect.js',
        'node_modules/@prisma/engines/query_engine_bg.wasm',
        'node_modules/.prisma/client/query_engine_bg.js',
        'node_modules/some-pkg/dist/linux-arm64-notes.js',
        'src/handlers/windows-handler.js',
    ];

    it.each(['x86_64', 'arm64'])(
        'matches every foreign engine file for %s',
        (name) => {
            foreignEngineFiles[name].forEach((file) =>
                expect({ name, file, hit: matches(name, file) }).toEqual({
                    name,
                    file,
                    hit: true,
                })
            );
        }
    );

    it.each(['x86_64', 'arm64'])(
        'keeps the engine files of the %s target',
        (name) => {
            targetEngineFiles[name].forEach((file) =>
                expect({ file, hit: matches(name, file) }).toEqual({
                    file,
                    hit: false,
                })
            );
        }
    );

    it.each(['x86_64', 'arm64'])(
        'keeps runtime files that only share a platform word with an engine for %s',
        (name) => {
            nonEngineFiles.forEach((file) =>
                expect({ file, hit: matches(name, file) }).toEqual({
                    file,
                    hit: false,
                })
            );
        }
    );

    it('never uses negation', () => {
        ['x86_64', 'arm64'].forEach((name) =>
            foreignPrismaEngineExcludes(name).forEach((pattern) =>
                expect(pattern.startsWith('!')).toBe(false)
            )
        );
    });
});

describe('bundledPrismaEngineExcludes()', () => {
    it('adds nothing when the Prisma layer carries the engines', () => {
        expect(bundledPrismaEngineExcludes({ architecture: 'arm64' }, true)).toEqual([]);
    });

    it.each([
        [{}, 'x86_64'],
        [{ architecture: 'x86_64' }, 'x86_64'],
        [{ architecture: 'arm64' }, 'arm64'],
    ])('with the layer off, excludes the engines %j does not load', (appDefinition, name) => {
        expect(bundledPrismaEngineExcludes(appDefinition, false)).toEqual(
            foreignPrismaEngineExcludes(name)
        );
    });
});
