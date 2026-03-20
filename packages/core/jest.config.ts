import type { Config } from 'jest';

const config: Config = {
    resolver: './jest-resolver.ts',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json', diagnostics: false }],
    },
    coverageThreshold: {
        global: {
            statements: 13,
            branches: 0,
            functions: 1,
            lines: 13,
        },
    },
    globalSetup: './jest-setup.ts',
    globalTeardown: './jest-teardown.ts',
};

export default config;
