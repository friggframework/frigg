const { CredentialRepositoryMongoDBNative } = require('./credential-repository-mongodb-native');
const { ObjectId } = require('mongodb');

jest.mock('../../database/mongodb-native-client');
jest.mock('../../database/encrypted-collection-wrapper');

describe('CredentialRepositoryMongoDBNative', () => {
    let repository;
    let mockNativeClient;
    let mockCollection;
    let mockEncryptedCollection;

    beforeEach(() => {
        mockCollection = {
            findOne: jest.fn(),
            find: jest.fn(() => ({
                toArray: jest.fn(),
            })),
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            deleteOne: jest.fn(),
        };

        mockEncryptedCollection = {
            findOne: jest.fn(),
            find: jest.fn(),
            insertOne: jest.fn(),
            updateOne: jest.fn(),
            deleteOne: jest.fn(),
            countDocuments: jest.fn(),
        };

        mockNativeClient = {
            connect: jest.fn().mockResolvedValue(undefined),
            collection: jest.fn().mockReturnValue(mockCollection),
            isConnected: true,
        };

        const { getNativeMongoClient } = require('../../database/mongodb-native-client');
        getNativeMongoClient.mockReturnValue(mockNativeClient);

        const { EncryptedCollection } = require('../../database/encrypted-collection-wrapper');
        EncryptedCollection.mockImplementation(() => mockEncryptedCollection);

        repository = new CredentialRepositoryMongoDBNative();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findCredentialById()', () => {
        it('should find credential by string ID', async () => {
            const id = new ObjectId().toString();
            const mockCredential = { _id: new ObjectId(id), externalId: 'ext123' };
            mockEncryptedCollection.findOne.mockResolvedValue(mockCredential);

            const result = await repository.findCredentialById(id);

            expect(mockEncryptedCollection.findOne).toHaveBeenCalledWith({
                _id: expect.any(ObjectId),
            });
            expect(result).toEqual(mockCredential);
        });

        it('should return null for non-existent ID', async () => {
            mockEncryptedCollection.findOne.mockResolvedValue(null);

            const result = await repository.findCredentialById('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('findCredential()', () => {
        it('should find credential by filter', async () => {
            const filter = { userId: 'user123', externalId: 'ext123' };
            const mockCredential = { _id: new ObjectId(), ...filter };
            mockEncryptedCollection.findOne.mockResolvedValue(mockCredential);

            const result = await repository.findCredential(filter);

            expect(mockEncryptedCollection.findOne).toHaveBeenCalledWith(filter);
            expect(result).toEqual(mockCredential);
        });
    });

    describe('upsertCredential()', () => {
        it('should update existing credential', async () => {
            const existingId = new ObjectId();
            const existing = {
                _id: existingId,
                userId: 'user123',
                externalId: 'ext123',
                data: { access_token: 'old' },
            };

            mockEncryptedCollection.findOne.mockResolvedValue(existing);
            mockEncryptedCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
            mockEncryptedCollection.findOne
                .mockResolvedValueOnce(existing)
                .mockResolvedValueOnce({ ...existing, data: { access_token: 'new' } });

            const result = await repository.upsertCredential({
                identifiers: { userId: 'user123', externalId: 'ext123' },
                details: { access_token: 'new' },
            });

            expect(mockEncryptedCollection.updateOne).toHaveBeenCalled();
            expect(result.id).toBeDefined();
        });

        it('should create new credential if not exists', async () => {
            mockEncryptedCollection.findOne.mockResolvedValue(null);
            const insertedId = new ObjectId();
            mockEncryptedCollection.insertOne.mockResolvedValue({ insertedId });
            mockEncryptedCollection.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ _id: insertedId, externalId: 'ext123' });

            const result = await repository.upsertCredential({
                identifiers: { userId: 'user123', externalId: 'ext123' },
                details: { access_token: 'token' },
            });

            expect(mockEncryptedCollection.insertOne).toHaveBeenCalled();
            expect(result.id).toBeDefined();
        });

        it('should throw error if identifiers missing', async () => {
            await expect(
                repository.upsertCredential({ details: {} })
            ).rejects.toThrow('identifiers required');
        });

        it('should throw error if externalId missing', async () => {
            await expect(
                repository.upsertCredential({
                    identifiers: { userId: 'user123' },
                    details: {},
                })
            ).rejects.toThrow('externalId required');
        });
    });

    describe('updateCredential()', () => {
        it('should update credential by ID', async () => {
            const id = new ObjectId().toString();
            mockEncryptedCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
            mockEncryptedCollection.findOne.mockResolvedValue({
                _id: new ObjectId(id),
                data: { access_token: 'updated' },
            });

            const result = await repository.updateCredential(id, {
                access_token: 'updated',
            });

            expect(mockEncryptedCollection.updateOne).toHaveBeenCalled();
            expect(result).toBeDefined();
        });
    });

    describe('updateAuthenticationStatus()', () => {
        it('should update authIsValid field', async () => {
            const id = new ObjectId().toString();
            mockEncryptedCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

            const result = await repository.updateAuthenticationStatus(id, false);

            expect(mockEncryptedCollection.updateOne).toHaveBeenCalledWith(
                { _id: expect.any(ObjectId) },
                { $set: { authIsValid: false, updatedAt: expect.any(Date) } }
            );
            expect(result.modifiedCount).toBe(1);
        });
    });

    describe('deleteCredentialById()', () => {
        it('should delete credential by ID', async () => {
            const id = new ObjectId().toString();
            mockEncryptedCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await repository.deleteCredentialById(id);

            expect(mockEncryptedCollection.deleteOne).toHaveBeenCalledWith({
                _id: expect.any(ObjectId),
            });
            expect(result.deletedCount).toBe(1);
        });
    });
});

