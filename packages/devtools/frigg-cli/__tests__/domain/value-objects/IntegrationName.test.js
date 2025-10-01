const {IntegrationName} = require('../../../domain/value-objects/IntegrationName');
const {DomainException} = require('../../../domain/exceptions/DomainException');

describe('IntegrationName Value Object', () => {
    describe('valid names', () => {
        test('accepts valid kebab-case name', () => {
            const name = new IntegrationName('salesforce-sync');
            expect(name.value).toBe('salesforce-sync');
        });

        test('accepts name with numbers', () => {
            const name = new IntegrationName('api-module-v2');
            expect(name.value).toBe('api-module-v2');
        });

        test('accepts two-character name', () => {
            const name = new IntegrationName('ab');
            expect(name.value).toBe('ab');
        });
    });

    describe('invalid names', () => {
        test('rejects uppercase letters', () => {
            expect(() => new IntegrationName('SalesforceSync'))
                .toThrow(DomainException);
        });

        test('rejects name starting with hyphen', () => {
            expect(() => new IntegrationName('-salesforce'))
                .toThrow(DomainException);
        });

        test('rejects name ending with hyphen', () => {
            expect(() => new IntegrationName('salesforce-'))
                .toThrow(DomainException);
        });

        test('rejects consecutive hyphens', () => {
            expect(() => new IntegrationName('salesforce--sync'))
                .toThrow(DomainException);
        });

        test('rejects name with spaces', () => {
            expect(() => new IntegrationName('salesforce sync'))
                .toThrow(DomainException);
        });

        test('rejects name with underscores', () => {
            expect(() => new IntegrationName('salesforce_sync'))
                .toThrow(DomainException);
        });

        test('rejects single character name', () => {
            expect(() => new IntegrationName('a'))
                .toThrow(DomainException);
        });

        test('rejects empty name', () => {
            expect(() => new IntegrationName(''))
                .toThrow(DomainException);
        });

        test('rejects null', () => {
            expect(() => new IntegrationName(null))
                .toThrow(DomainException);
        });
    });

    describe('equality', () => {
        test('equal names are equal', () => {
            const name1 = new IntegrationName('salesforce-sync');
            const name2 = new IntegrationName('salesforce-sync');
            expect(name1.equals(name2)).toBe(true);
        });

        test('different names are not equal', () => {
            const name1 = new IntegrationName('salesforce-sync');
            const name2 = new IntegrationName('hubspot-sync');
            expect(name1.equals(name2)).toBe(false);
        });
    });
});
