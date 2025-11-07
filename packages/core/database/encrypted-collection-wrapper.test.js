/**
 * Tests for Encrypted Collection Wrapper
 * Wraps MongoDB native driver collections with field-level encryption
 */

const { EncryptedCollection } = require('./encrypted-collection-wrapper');
const { ObjectId } = require('mongodb');

describe('EncryptedCollection', () => {
    let mockCollection;
    let mockEncryptionService;
    let encryptedCollection;

    beforeEach(() => {
        mockCollection = {
            findOne: jest.fn(),
            find: jest.fn(() => ({
                toArray: jest.fn(),
            })),
            insertOne: jest.fn(),
            insertMany: jest.fn(),
            updateOne: jest.fn(),
            updateMany: jest.fn(),
            deleteOne: jest.fn(),
            deleteMany: jest.fn(),
            countDocuments: jest.fn(),
        };

        mockEncryptionService = {
            encryptFields: jest.fn((model, doc) => Promise.resolve({ ...doc, encrypted: true })),
            decryptFields: jest.fn((model, doc) => Promise.resolve({ ...doc, decrypted: true })),
            encryptFieldsInBulk: jest.fn((model, docs) => 
                Promise.resolve(docs.map(d => ({ ...d, encrypted: true })))
            ),
        };

        encryptedCollection = new EncryptedCollection(
            mockCollection,
            mockEncryptionService,
            'Credential'
        );
    });

    describe('findOne()', () => {
        it('should decrypt result', async () => {
            const mockDoc = { _id: new ObjectId(), data: { token: 'encrypted' } };
            mockCollection.findOne.mockResolvedValue(mockDoc);

            const result = await encryptedCollection.findOne({ _id: mockDoc._id });

            expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: mockDoc._id });
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith('Credential', mockDoc);
            expect(result.decrypted).toBe(true);
        });

        it('should return null for no match', async () => {
            mockCollection.findOne.mockResolvedValue(null);

            const result = await encryptedCollection.findOne({ _id: 'nonexistent' });

            expect(result).toBeNull();
            expect(mockEncryptionService.decryptFields).not.toHaveBeenCalled();
        });
    });

    describe('find()', () => {
        it('should decrypt all results', async () => {
            const mockDocs = [
                { _id: new ObjectId(), data: { token: 'enc1' } },
                { _id: new ObjectId(), data: { token: 'enc2' } },
            ];
            mockCollection.find().toArray.mockResolvedValue(mockDocs);

            const result = await encryptedCollection.find({ userId: 'user123' });

            expect(mockCollection.find).toHaveBeenCalledWith({ userId: 'user123' });
            expect(mockEncryptionService.decryptFields).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(2);
            expect(result[0].decrypted).toBe(true);
        });

        it('should return empty array for no matches', async () => {
            mockCollection.find().toArray.mockResolvedValue([]);

            const result = await encryptedCollection.find({ userId: 'nonexistent' });

            expect(result).toEqual([]);
            expect(mockEncryptionService.decryptFields).not.toHaveBeenCalled();
        });
    });

    describe('insertOne()', () => {
        it('should encrypt before insert', async () => {
            const doc = { data: { token: 'plain' } };
            const insertedId = new ObjectId();
            mockCollection.insertOne.mockResolvedValue({ insertedId });

            const result = await encryptedCollection.insertOne(doc);

            expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith('Credential', doc);
            expect(mockCollection.insertOne).toHaveBeenCalledWith({ ...doc, encrypted: true });
            expect(result.insertedId).toBe(insertedId);
        });
    });

    describe('insertMany()', () => {
        it('should encrypt all documents before insert', async () => {
            const docs = [
                { data: { token: 'plain1' } },
                { data: { token: 'plain2' } },
            ];
            mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 });

            const result = await encryptedCollection.insertMany(docs);

            expect(mockEncryptionService.encryptFieldsInBulk).toHaveBeenCalledWith('Credential', docs);
            expect(mockCollection.insertMany).toHaveBeenCalled();
            expect(result.insertedCount).toBe(2);
        });
    });

    describe('updateOne()', () => {
        it('should encrypt update data', async () => {
            const filter = { _id: new ObjectId() };
            const update = { $set: { data: { token: 'new' } } };
            mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

            const result = await encryptedCollection.updateOne(filter, update);

            expect(mockEncryptionService.encryptFields).toHaveBeenCalled();
            expect(mockCollection.updateOne).toHaveBeenCalled();
            expect(result.modifiedCount).toBe(1);
        });
    });

    describe('deleteOne()', () => {
        it('should delete without encryption', async () => {
            const filter = { _id: new ObjectId() };
            mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

            const result = await encryptedCollection.deleteOne(filter);

            expect(mockCollection.deleteOne).toHaveBeenCalledWith(filter);
            expect(mockEncryptionService.encryptFields).not.toHaveBeenCalled();
            expect(result.deletedCount).toBe(1);
        });
    });

    describe('countDocuments()', () => {
        it('should count without encryption', async () => {
            mockCollection.countDocuments.mockResolvedValue(42);

            const result = await encryptedCollection.countDocuments({ userId: 'user123' });

            expect(mockCollection.countDocuments).toHaveBeenCalledWith({ userId: 'user123' });
            expect(result).toBe(42);
        });
    });
});

