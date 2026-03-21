const { validateNetlifyConfig } = require('../lib/validate');

describe('validateNetlifyConfig', () => {
    test('validates a valid Netlify app definition', () => {
        const result = validateNetlifyConfig({
            name: 'test-app',
            database: { postgres: { enable: true } },
            encryption: { fieldLevelEncryptionMethod: 'aes' },
            queue: { provider: 'netlify-background' },
            integrations: [{ Definition: { name: 'hubspot' } }],
        });

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    test('returns error for null app definition', () => {
        const result = validateNetlifyConfig(null);

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('App definition is required');
    });

    test('returns error for DocumentDB (AWS-specific)', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { documentDB: { enable: true } },
        });

        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('DocumentDB');
    });

    test('returns error for WebSocket support', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { postgres: { enable: true } },
            websockets: { enable: true },
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('WebSocket'))).toBe(true);
    });

    test('returns error for SQS queue provider', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { postgres: { enable: true } },
            queue: { provider: 'sqs' },
        });

        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('SQS'))).toBe(true);
    });

    test('returns warning for VPC configuration', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { postgres: { enable: true } },
            vpc: { enable: true },
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.includes('VPC'))).toBe(true);
    });

    test('returns warning for SSM configuration', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { postgres: { enable: true } },
            ssm: { enable: true },
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.includes('SSM'))).toBe(true);
    });

    test('returns warning for KMS encryption', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { postgres: { enable: true } },
            encryption: { useDefaultKMSForFieldLevelEncryption: true },
        });

        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.includes('KMS'))).toBe(true);
    });

    test('returns warning for no integrations', () => {
        const result = validateNetlifyConfig({
            name: 'test',
            database: { postgres: { enable: true } },
        });

        expect(result.valid).toBe(true);
        expect(
            result.warnings.some((w) => w.includes('No integrations'))
        ).toBe(true);
    });

    test('returns warning for no database config', () => {
        const result = validateNetlifyConfig({
            name: 'test',
        });

        expect(result.valid).toBe(false);
        expect(
            result.errors.some((e) => e.includes('database'))
        ).toBe(true);
    });
});
