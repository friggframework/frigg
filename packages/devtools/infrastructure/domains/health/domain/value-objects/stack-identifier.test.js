/**
 * Tests for StackIdentifier Value Object
 */

const StackIdentifier = require('./stack-identifier');

describe('StackIdentifier', () => {
    describe('constructor', () => {
        it('should create a valid stack identifier', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            expect(identifier.stackName).toBe('my-app-prod');
            expect(identifier.region).toBe('us-east-1');
            expect(identifier.accountId).toBe('123456789012');
        });

        it('should require stackName', () => {
            expect(() => {
                new StackIdentifier({
                    region: 'us-east-1',
                    accountId: '123456789012',
                });
            }).toThrow('stackName is required');
        });

        it('should require region', () => {
            expect(() => {
                new StackIdentifier({
                    stackName: 'my-app-prod',
                    accountId: '123456789012',
                });
            }).toThrow('region is required');
        });

        it('should allow accountId to be optional', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            expect(identifier.stackName).toBe('my-app-prod');
            expect(identifier.region).toBe('us-east-1');
            expect(identifier.accountId).toBeNull();
        });

        it('should validate stackName format', () => {
            expect(() => {
                new StackIdentifier({
                    stackName: '',
                    region: 'us-east-1',
                });
            }).toThrow('stackName cannot be empty');
        });

        it('should validate region format', () => {
            expect(() => {
                new StackIdentifier({
                    stackName: 'my-app-prod',
                    region: 'invalid-region',
                });
            }).toThrow('region must be a valid AWS region');
        });

        it('should validate accountId format when provided', () => {
            expect(() => {
                new StackIdentifier({
                    stackName: 'my-app-prod',
                    region: 'us-east-1',
                    accountId: '123',
                });
            }).toThrow('accountId must be a 12-digit number');
        });

        it('should accept valid AWS regions', () => {
            const validRegions = [
                'us-east-1',
                'us-east-2',
                'us-west-1',
                'us-west-2',
                'eu-west-1',
                'eu-central-1',
                'ap-southeast-1',
                'ap-northeast-1',
            ];

            validRegions.forEach(region => {
                expect(() => {
                    new StackIdentifier({
                        stackName: 'my-app-prod',
                        region,
                    });
                }).not.toThrow();
            });
        });
    });

    describe('equals', () => {
        it('should return true for identical identifiers', () => {
            const id1 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            const id2 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            expect(id1.equals(id2)).toBe(true);
        });

        it('should return false for different stack names', () => {
            const id1 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const id2 = new StackIdentifier({
                stackName: 'my-app-dev',
                region: 'us-east-1',
            });

            expect(id1.equals(id2)).toBe(false);
        });

        it('should return false for different regions', () => {
            const id1 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const id2 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-west-2',
            });

            expect(id1.equals(id2)).toBe(false);
        });

        it('should return false for different account IDs', () => {
            const id1 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            const id2 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '987654321098',
            });

            expect(id1.equals(id2)).toBe(false);
        });

        it('should handle null accountId comparison', () => {
            const id1 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            const id2 = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            expect(id1.equals(id2)).toBe(true);
        });
    });

    describe('toString', () => {
        it('should return string representation with account ID', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            expect(identifier.toString()).toBe('my-app-prod (us-east-1, 123456789012)');
        });

        it('should return string representation without account ID', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            expect(identifier.toString()).toBe('my-app-prod (us-east-1)');
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON with account ID', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            expect(identifier.toJSON()).toEqual({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });
        });

        it('should serialize to JSON without account ID', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            expect(identifier.toJSON()).toEqual({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: null,
            });
        });
    });

    describe('immutability', () => {
        it('should not allow modification of stackName', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            expect(() => {
                identifier.stackName = 'modified';
            }).toThrow();
        });

        it('should not allow modification of region', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
            });

            expect(() => {
                identifier.region = 'us-west-2';
            }).toThrow();
        });

        it('should not allow modification of accountId', () => {
            const identifier = new StackIdentifier({
                stackName: 'my-app-prod',
                region: 'us-east-1',
                accountId: '123456789012',
            });

            expect(() => {
                identifier.accountId = '987654321098';
            }).toThrow();
        });
    });
});
