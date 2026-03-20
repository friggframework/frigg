import { DocumentDBEncryptionService } from '../documentdb-encryption-service';
import { registerCustomSchema, resetCustomSchema } from '../encryption/encryption-schema-registry';

describe('DocumentDBEncryptionService', () => {
    let service: any;
    let mockCryptor: { encrypt: jest.Mock; decrypt: jest.Mock };

    beforeEach(() => {
        resetCustomSchema();
        registerCustomSchema({
            User: { fields: ['username'] },
        });

        mockCryptor = {
            encrypt: jest.fn(async (val: any) => {
                const stringVal = typeof val === 'string' ? val : JSON.stringify(val);
                return `encrypted:${stringVal}`;
            }),
            decrypt: jest.fn(async (val: string) => {
                if (!val.startsWith('encrypted:')) {
                    throw new Error('Invalid encrypted format');
                }
                return val.replace('encrypted:', '');
            })
        };

        service = new DocumentDBEncryptionService({ cryptor: mockCryptor as any });
        const origIsEncrypted = service._isEncryptedValue.bind(service);
        service._isEncryptedValue = (value: any) => {
            if (typeof value !== 'string') return false;
            if (value.startsWith('encrypted:')) return true;
            return origIsEncrypted(value);
        };
    });

    afterEach(() => {
        resetCustomSchema();
    });

    describe('encryptFields', () => {
        it('encrypts User.username (custom field)', async () => {
            const doc = { username: 'test@example.com', type: 'INDIVIDUAL' };

            const encrypted = await service.encryptFields('User', doc);

            expect(encrypted.username).toBe('encrypted:test@example.com');
            expect(encrypted.type).toBe('INDIVIDUAL');
        });

        it('encrypts User.hashword (core field)', async () => {
            const doc = { hashword: 'hashed_password', type: 'INDIVIDUAL' };

            const encrypted = await service.encryptFields('User', doc);

            expect(encrypted.hashword).toBe('encrypted:hashed_password');
            expect(encrypted.type).toBe('INDIVIDUAL');
        });

        it('encrypts both core and custom fields', async () => {
            const doc = {
                username: 'test@example.com',
                hashword: 'hashed',
                type: 'INDIVIDUAL'
            };

            const encrypted = await service.encryptFields('User', doc);

            expect(encrypted.username).toBe('encrypted:test@example.com');
            expect(encrypted.hashword).toBe('encrypted:hashed');
            expect(encrypted.type).toBe('INDIVIDUAL');
        });

        it('returns document unchanged if no encrypted fields', async () => {
            const doc = { type: 'INDIVIDUAL', email: 'test@example.com' };

            const result = await service.encryptFields('UnknownModel', doc);

            expect(result).toEqual(doc);
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('returns document unchanged if encryption disabled', async () => {
            const disabledService = new DocumentDBEncryptionService();
            (disabledService as any).enabled = false;
            (disabledService as any).cryptor = mockCryptor;

            const doc = { username: 'test@example.com' };
            const result = await disabledService.encryptFields('User', doc);

            expect(result.username).toBe('test@example.com');
            expect(mockCryptor.encrypt).not.toHaveBeenCalled();
        });

        it('handles nested field encryption (Credential.data.access_token)', async () => {
            const doc = {
                userId: '12345',
                data: {
                    access_token: 'secret_token',
                    refresh_token: 'refresh_secret',
                    other_field: 'not_encrypted'
                }
            };

            const encrypted = await service.encryptFields('Credential', doc);

            expect(encrypted.data.access_token).toBe('encrypted:secret_token');
            expect(encrypted.data.refresh_token).toBe('encrypted:refresh_secret');
            expect(encrypted.data.other_field).toBe('not_encrypted');
            expect(encrypted.userId).toBe('12345');
        });

        it('does not mutate original document', async () => {
            const doc = { username: 'test@example.com', type: 'INDIVIDUAL' };
            const originalUsername = doc.username;

            await service.encryptFields('User', doc);

            expect(doc.username).toBe(originalUsername);
        });

        it('handles null/undefined document gracefully', async () => {
            expect(await service.encryptFields('User', null)).toBeNull();
            expect(await service.encryptFields('User', undefined)).toBeUndefined();
        });

        it('handles empty object', async () => {
            const result = await service.encryptFields('User', {});
            expect(result).toEqual({});
        });

        it('skips fields that are already encrypted', async () => {
            const doc = {
                username: 'YWVzLWtleS0x:TXlJVkhlcmU=:QWN0dWFsQ2lwaGVy:RW5jcnlwdGVk',
                hashword: 'plain_text'
            };

            const encrypted = await service.encryptFields('User', doc);

            expect(encrypted.username).toBe('YWVzLWtleS0x:TXlJVkhlcmU=:QWN0dWFsQ2lwaGVy:RW5jcnlwdGVk');
            expect(encrypted.hashword).toBe('encrypted:plain_text');
        });
    });

    describe('decryptFields', () => {
        it('decrypts User.username (custom field)', async () => {
            const doc = { username: 'encrypted:test@example.com', type: 'INDIVIDUAL' };

            const decrypted = await service.decryptFields('User', doc);

            expect(decrypted.username).toBe('test@example.com');
            expect(decrypted.type).toBe('INDIVIDUAL');
        });

        it('decrypts User.hashword (core field)', async () => {
            const doc = { hashword: 'encrypted:hashed_password' };

            const decrypted = await service.decryptFields('User', doc);

            expect(decrypted.hashword).toBe('hashed_password');
        });

        it('round-trips encryption and decryption', async () => {
            const original = {
                username: 'test@example.com',
                hashword: 'hashed',
                type: 'INDIVIDUAL'
            };

            const encrypted = await service.encryptFields('User', original);
            const decrypted = await service.decryptFields('User', encrypted);

            expect(decrypted).toEqual(original);
        });

        it('handles nested field decryption', async () => {
            const doc = {
                userId: '12345',
                data: {
                    access_token: 'encrypted:secret_token',
                    refresh_token: 'encrypted:refresh_token'
                }
            };

            const decrypted = await service.decryptFields('Credential', doc);

            expect(decrypted.data.access_token).toBe('secret_token');
            expect(decrypted.data.refresh_token).toBe('refresh_token');
        });

        it('does not mutate original document', async () => {
            const doc = { username: 'encrypted:test@example.com' };
            const originalUsername = doc.username;

            await service.decryptFields('User', doc);

            expect(doc.username).toBe(originalUsername);
        });

        it('handles null/undefined document gracefully', async () => {
            expect(await service.decryptFields('User', null)).toBeNull();
            expect(await service.decryptFields('User', undefined)).toBeUndefined();
        });

        it('returns document unchanged if encryption disabled', async () => {
            const disabledService = new DocumentDBEncryptionService();
            (disabledService as any).enabled = false;
            (disabledService as any).cryptor = mockCryptor;

            const doc = { username: 'encrypted:test@example.com' };
            const result = await disabledService.decryptFields('User', doc);

            expect(result.username).toBe('encrypted:test@example.com');
            expect(mockCryptor.decrypt).not.toHaveBeenCalled();
        });

        it('skips non-encrypted values', async () => {
            const doc = {
                username: 'plain_text',
                hashword: 'encrypted:hashed'
            };

            const decrypted = await service.decryptFields('User', doc);

            expect(decrypted.username).toBe('plain_text');
            expect(decrypted.hashword).toBe('hashed');
        });
    });

    describe('_isEncryptedValue', () => {
        it('identifies encrypted format (4 colon-separated base64 parts)', () => {
            const encrypted = 'YWVzLWtleS0x:TXlJVkhlcmU=:QWN0dWFsQ2lwaGVy:RW5jcnlwdGVkS2V5SGVyZVdpdGhMb25nQmFzZTY0U3RyaW5n';
            expect(service._isEncryptedValue(encrypted)).toBe(true);
        });

        it('rejects plain text', () => {
            expect(service._isEncryptedValue('plain_text')).toBe(false);
        });

        it('rejects values with wrong number of colons', () => {
            expect(service._isEncryptedValue('part1:part2:part3')).toBe(false);
            expect(service._isEncryptedValue('part1:part2:part3:part4:part5')).toBe(false);
        });

        it('rejects short values (< 50 chars)', () => {
            expect(service._isEncryptedValue('a:b:c:d')).toBe(false);
            expect(service._isEncryptedValue('YWE=:YmI=:Y2M=:ZGQ=')).toBe(false);
        });

        it('rejects non-base64 characters', () => {
            expect(service._isEncryptedValue('inv@lid:ch@rs:in:b@se64characterstomakeitlongenough')).toBe(false);
        });

        it('rejects empty strings', () => {
            expect(service._isEncryptedValue('')).toBe(false);
        });

        it('rejects non-string values', () => {
            expect(service._isEncryptedValue(null)).toBe(false);
            expect(service._isEncryptedValue(undefined)).toBe(false);
            expect(service._isEncryptedValue(123)).toBe(false);
            expect(service._isEncryptedValue({})).toBe(false);
            expect(service._isEncryptedValue([])).toBe(false);
        });

        it('accepts valid encrypted value with minimum length', () => {
            const valid = 'YWVzLWtleS0x:TXlJVkhlcmU=:QWN0dWFsQ2lwaGVy:RW5jcnlwdGVkS2V5';
            expect(valid.length).toBeGreaterThan(50);
            expect(service._isEncryptedValue(valid)).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles Date objects in document', async () => {
            const date = new Date('2025-01-13');
            const doc = { username: 'test@example.com', createdAt: date };

            const encrypted = await service.encryptFields('User', doc);

            expect(encrypted.username).toBe('encrypted:test@example.com');
            expect(encrypted.createdAt).toEqual(date);
        });

        it('handles deeply nested objects', async () => {
            const doc = {
                data: {
                    level1: {
                        level2: {
                            access_token: 'secret'
                        }
                    }
                }
            };

            const encrypted = await service.encryptFields('Credential', doc);

            expect(encrypted.data.level1.level2.access_token).toBe('secret');
        });

        it('handles array values in document', async () => {
            const doc = { username: 'test@example.com', tags: ['tag1', 'tag2'] };

            const encrypted = await service.encryptFields('User', doc);

            expect(encrypted.username).toBe('encrypted:test@example.com');
            expect(encrypted.tags).toEqual(['tag1', 'tag2']);
        });
    });

    describe('error handling', () => {
        it('throws on encryption failure', async () => {
            mockCryptor.encrypt.mockRejectedValueOnce(new Error('Encryption failed'));

            const doc = { username: 'test@example.com' };

            await expect(service.encryptFields('User', doc)).rejects.toThrow('Encryption failed');
        });

        it('throws on decryption failure', async () => {
            mockCryptor.decrypt.mockRejectedValueOnce(new Error('Decryption failed'));

            const doc = { username: 'encrypted:test@example.com' };

            await expect(service.decryptFields('User', doc)).rejects.toThrow('Decryption failed');
        });
    });
});
