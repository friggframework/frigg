const {
    LAMBDA_ARCHITECTURES,
    resolveLambdaArchitecture,
    prismaEngineFileNames,
    foreignPrismaEngineExcludes,
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
    it('excludes the host platforms and the other Lambda architecture for x86_64', () => {
        expect(foreignPrismaEngineExcludes('x86_64')).toEqual([
            '**/*darwin*',
            '**/*-debian-*',
            '**/*-linux-musl*',
            '**/*windows*',
            '**/*-linux-arm64-openssl-3.0.x*',
        ]);
    });

    it('excludes the host platforms and the other Lambda architecture for arm64', () => {
        expect(foreignPrismaEngineExcludes('arm64')).toEqual([
            '**/*darwin*',
            '**/*-debian-*',
            '**/*-linux-musl*',
            '**/*windows*',
            '**/*-rhel-openssl-3.0.x*',
        ]);
    });
});
