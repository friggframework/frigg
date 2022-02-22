const AWS = require('aws-sdk');
const mongoose = require('mongoose');
const crypto = require('crypto');
const {
    expectValidSecret,
    expectValidRawDoc,
    expectValidRawDocById,
    createModel,
    saveTestDocument,
} = require('./test-encrypt');
const { TestMongo } = require('@friggframework/test-environment');

const testMongo = new TestMongo();
const originalEnv = process.env;

// Default LocalStack endpoint
AWS.config.update({
    endpoint: 'localhost:4566',
});

describe('Encrypt', () => {
    beforeAll(async () => {
        await testMongo.start();
        await mongoose.connect(process.env.MONGO_URI);
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await testMongo.stop();
    });

    describe('Disabled mode', () => {
        it('can be disabled', async () => {
            process.env = {
                ...originalEnv,
                STAGE: 'not-encryption-test',
            };

            try {
                const { Model } = createModel();
                const { doc, secret } = await saveTestDocument(Model);
                const rawDoc = await Model.collection.findOne({ _id: doc._id });

                // Test it was not encrypted in Mongo.
                expect(rawDoc).toHaveProperty('secret', secret);
            } finally {
                process.env = originalEnv;
            }
        });

        it('throws an error if both modes are set', async () => {
            process.env = {
                ...originalEnv,
                STAGE: 'encryption-test',
                AES_KEY_ID: '123',
                KMS_KEY_ARN: '321',
            };

            try {
                createModel();
            } catch (error) {
                expect(error).toHaveProperty(
                    'message',
                    'Local and AWS encryption keys are both set in the environment.'
                );
                return;
            } finally {
                process.env = originalEnv;
            }

            throw new Error('Expected error not caught.');
        });
    });

    describe('Local encryption functions', () => {
        beforeAll(() => {
            process.env = {
                ...originalEnv,
                STAGE: 'encryption-test',
                AES_KEY: crypto
                    .createHash('sha256')
                    .update('secret sauce')
                    .digest(),
                AES_KEY_ID: '12345',
            };
        });

        afterAll(() => {
            process.env = originalEnv;
        });

        let Model;
        beforeAll(() => {
            Model = createModel().Model;
        });

        it('can instantiate the model', async () => {
            new Model();
        });

        it('works when no document is found with findOne', async () => {
            const notSecret = new mongoose.Types.ObjectId();
            const doc = await Model.findOne({ notSecret });
            expect(doc).toBe(null);
        });

        it('works when no documents are found with find', async () => {
            const notSecret = new mongoose.Types.ObjectId();
            const docs = await Model.find({ notSecret });
            expect(docs).toHaveLength(0);
        });

        it('can be saved', async function () {
            await saveTestDocument(Model);
        });

        it('can be reloaded', async function () {
            const { doc, notSecret } = await saveTestDocument(Model);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('notSecret');
            expect(reloaded.notSecret.toString()).toBe(notSecret.toString());
        });

        it('can be reloaded (nested field)', async function () {
            const notSecret = new mongoose.Types.ObjectId();
            const secret = 'abcdefg';
            const doc = new Model({
                notSecret,
                'deeply.nested.secret': secret,
            });

            expect(doc).toHaveProperty('notSecret');
            expect(doc.notSecret.toString()).toBe(notSecret.toString());
            expect(doc).toHaveProperty('deeply');
            expect(doc.deeply).toHaveProperty('nested');
            expect(doc.deeply.nested).toHaveProperty('secret', secret);

            await doc.save();

            expect(doc).toHaveProperty('notSecret');
            expect(doc.notSecret.toString()).toBe(notSecret.toString());
            expect(doc).toHaveProperty('deeply');
            expect(doc.deeply).toHaveProperty('nested');
            expect(doc.deeply.nested).toHaveProperty('secret', secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('notSecret');
            expect(reloaded.notSecret.toString()).toBe(notSecret.toString());
            expect(reloaded).toHaveProperty('deeply');
            expect(reloaded.deeply).toHaveProperty('nested');
            expect(reloaded.deeply.nested).toHaveProperty('secret', secret);
        });

        it('automatically encrypts a secret field when saved', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('notSecret');
            expect(reloaded.notSecret.toString()).toBe(notSecret.toString());
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe(secret);
        });

        it('automatically encrypts a secret field when using updateOne', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.updateOne({ _id: doc._id }, { secret: 'hijklmn' });

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using updateOne and $set', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.updateOne(
                { _id: doc._id },
                { $set: { secret: 'hijklmn' } }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using updateOne on document', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await doc.updateOne({ secret: 'hijklmn' });

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts and decrypts secret field when using findOneAndUpdate', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const reloaded = await Model.findOneAndUpdate(
                { _id: doc._id },
                { secret: 'beets' }
            );

            expect(reloaded).toHaveProperty('secret', secret);

            const updatedDoc = await Model.findOne({ _id: doc._id });
            expect(updatedDoc).toHaveProperty('secret', 'beets');
        });

        it('handles findOneAndUpdate with `new: true` option', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const updatedDoc = await Model.findOneAndUpdate(
                { _id: doc._id },
                { secret: 'beets' },
                { new: true }
            );
            expect(updatedDoc).toHaveProperty('secret', 'beets');

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret', 'beets');
        });

        it('automatically encrypts and decrypts secret field when using findOneAndReplace', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const reloaded = await Model.findOneAndReplace(
                { _id: doc._id },
                { secret: 'beets' }
            );

            expect(reloaded).toHaveProperty('secret', secret);

            const updatedDoc = await Model.findOne({ _id: doc._id });
            expect(updatedDoc).toHaveProperty('secret', 'beets');
        });

        it('automatically decrypts secret field when using findOneAndDelete', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            const deleted = await Model.findOneAndDelete({ _id: doc._id });
            expect(deleted).toHaveProperty('secret', secret);

            const docsForUser = await Model.find({ notSecret });
            expect(docsForUser).toHaveLength(0);
        });

        it('correctly handles `rawResult: true` option when using findOneAndDelete', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const deleted = await Model.findOneAndDelete(
                { _id: doc._id },
                { rawResult: true }
            );

            expect(deleted).toHaveProperty('value');
            expectValidSecret(deleted.value.secret);
        });

        it('automatically decrypts secret field when using findOneAndRemove', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            const deleted = await Model.findOneAndRemove({ _id: doc._id });
            expect(deleted).toHaveProperty('secret', secret);

            const docsForUser = await Model.find({ notSecret });
            expect(docsForUser).toHaveLength(0);
        });

        it('correctly handles `rawResult: true` option when using findOneAndRemove', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const rawDoc = await Model.findOneAndRemove(
                { _id: doc._id },
                { rawResult: true }
            );

            expect(rawDoc).toHaveProperty('value');
            expectValidSecret(rawDoc.value.secret);
        });

        it('automatically encrypts a secret field when using insertMany', async () => {
            // First create documents with secret values
            const notSecret = new mongoose.Types.ObjectId();
            const insertedDocs = await Model.insertMany([
                { notSecret, secret: 'qwerty' },
                { notSecret, secret: 'zxcvbn' },
            ]);

            expect(insertedDocs).toHaveLength(2);
            expect(insertedDocs[0]).toHaveProperty('secret', 'qwerty');
            expect(insertedDocs[1]).toHaveProperty('secret', 'zxcvbn');

            const rawDocs = await Model.collection.find({
                notSecret: notSecret.toString(),
            });

            for (const rawDoc of await rawDocs.toArray()) {
                expectValidSecret(rawDoc.secret);
            }

            // Finally, reload the docs with Mongoose, and ensure that the values
            // were successfully decrypted.
            const reloadedDocs = await Model.find({ notSecret });
            expect(reloadedDocs).toHaveLength(2);
            expect(reloadedDocs[0]).toHaveProperty('secret', 'qwerty');
            expect(reloadedDocs[1]).toHaveProperty('secret', 'zxcvbn');
        });

        it('throws if rawResult is used with insertMany', async () => {
            const notSecret = new mongoose.Types.ObjectId();

            try {
                await Model.insertMany([{ notSecret, secret: 'qwerty' }], {
                    rawResult: true,
                });
                throw new Error('Expected error did not occurr.');
            } catch (error) {
                expect(error).toHaveProperty(
                    'message',
                    'Raw result not supported for insertMany with Encrypt plugin'
                );
            }
        });

        it('automatically encrypts a secret field when using updateOne', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.updateOne({ _id: doc._id }, { secret: 'hijklmn' });

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloadedDoc = await Model.findOne({ _id: doc._id });
            expect(reloadedDoc).toHaveProperty('secret');
            expect(reloadedDoc.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using replaceOne', async () => {
            const { doc, secret } = await saveTestDocument(Model);

            await Model.replaceOne({ _id: doc._id }, { secret: '012a457' });

            const rawDoc = await Model.collection.findOne({ _id: doc._id });
            expect(rawDoc).toHaveProperty('secret');
            expect(rawDoc).not.toHaveProperty('secret', secret);
            expectValidSecret(rawDoc.secret);

            const reloadedDoc = await Model.findOne({ _id: doc._id });
            expect(reloadedDoc).toHaveProperty('secret');
            expect(reloadedDoc.secret).toBe('012a457');
        });

        it('automatically encrypts a secret field when using update and $set', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.update(
                { _id: doc._id },
                { $set: { secret: 'hijklmn' } }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using $setOnInsert', async () => {
            const { doc, notSecret, secret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            const updateResult = await Model.update(
                { notSecret },
                { $setOnInsert: { secret: 'hijklmn' } },
                { upsert: true }
            );

            expect(updateResult).not.toHaveProperty('upserted');

            const notUpdatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(notUpdatedRawDoc.secret).toBe(rawDoc.secret);

            const reloadedNotUpdated = await Model.findOne({ _id: doc._id });
            expect(reloadedNotUpdated).toHaveProperty('secret', secret);

            const notSecret2 = new mongoose.Types.ObjectId();
            const updateResult2 = await Model.update(
                { notSecret: notSecret2 },
                { $setOnInsert: { secret: 'hijklmn' } },
                { upsert: true }
            );

            expect(updateResult2).toHaveProperty('upsertedCount', 1);

            // TODO update upsert tests.  Model.update is deprecated
            // const upsertedRawDoc = await expectValidRawDocById(
            //     Model,
            //     updateResult2.upserted[0]._id
            // );
            // expect(upsertedRawDoc.secret).not.toBe(rawDoc.secret);

            // const reloaded = await Model.findOne({ _id: upsertedRawDoc._id });
            // expect(reloaded).toHaveProperty('secret', 'hijklmn');
        });

        it('throws an error if update uses an encrypted field with `multi: true`', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            try {
                await Model.update(
                    { notSecret },
                    { secret: 'change all passwords' },
                    { multiple: true }
                );
            } catch (error) {
                expect(error).toHaveProperty('message');
                expect(error.message).toBe(
                    'Attempted to update encrypted field of multiple documents'
                );

                const reloaded = await Model.findOne({ _id: doc._id });
                expect(reloaded).toHaveProperty('secret', secret);

                return;
            }

            throw new Error('Did not catch expected error');
        });

        it('throws an error if updateMany uses an encrypted field', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            try {
                await Model.updateMany(
                    { notSecret },
                    { secret: 'change all passwords' }
                );
            } catch (error) {
                expect(error).toHaveProperty('message');
                expect(error.message).toBe(
                    'Attempted to update encrypted field of multiple documents'
                );

                const reloaded = await Model.findOne({ _id: doc._id });
                expect(reloaded).toHaveProperty('secret', secret);

                return;
            }

            throw new Error('Did not catch expected error');
        });

        it('automatically encrypts a nested field when using updateOne', async () => {
            const { doc, secret } = await saveTestDocument(Model);

            await Model.updateOne(
                { _id: doc._id },
                { 'deeply.nested.secret': 'hij2lmn' }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expectValidSecret(updatedRawDoc.deeply.nested.secret);

            const reloadedDoc = await Model.findOne({ _id: doc._id });
            expect(reloadedDoc).toHaveProperty('deeply');
            expect(reloadedDoc.deeply).toHaveProperty('nested');
            expect(reloadedDoc.deeply.nested).toHaveProperty(
                'secret',
                'hij2lmn'
            );
        });

        it('automatically encrypts a nested field when using update and $set', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);

            await Model.update(
                { _id: doc._id },
                {
                    $set: { deeply: { nested: { secret: 'h3jklmn' } } },
                }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expectValidSecret(updatedRawDoc.deeply.nested.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('deeply');
            expect(reloaded.deeply).toHaveProperty('nested');
            expect(reloaded.deeply.nested).toHaveProperty('secret', 'h3jklmn');
        });

        it('automatically encrypts a secret field when using $setOnInsert', async () => {
            const { doc, notSecret, secret } = await saveTestDocument(Model);

            const updateResult = await Model.update(
                { notSecret },
                { $setOnInsert: { deeply: { 'nested.secret': 'hijkl4n' } } },
                { upsert: true }
            );

            expect(updateResult).toHaveProperty('upsertedCount', 0);

            const notUpdatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(notUpdatedRawDoc).not.toHaveProperty('deeply');

            const notSecret2 = new mongoose.Types.ObjectId();
            const updateResult2 = await Model.update(
                { notSecret: notSecret2 },
                { $setOnInsert: { deeply: { 'nested.secret': 'hijkl4n' } } },
                { upsert: true }
            );

            expect(updateResult2).toHaveProperty('upsertedCount', 1);

            // TODO Model.update is deprecated
            // const upsertedRawDoc = await Model.collection.findOne({
            //     _id: updateResult2.upserted[0]._id,
            // });
            // expectValidSecret(upsertedRawDoc.deeply.nested.secret);

            // const reloaded = await Model.findOne({ _id: upsertedRawDoc._id });
            // expect(reloaded).toHaveProperty('deeply');
            // expect(reloaded.deeply).toHaveProperty('nested');
            // expect(reloaded.deeply.nested).toHaveProperty('secret', 'hijkl4n');
        });

        it('can use the deprecated key', async () => {
            const { Model } = createModel();
            const key = crypto
                .createHash('sha256')
                .update('secret sauce')
                .digest();

            process.env = {
                ...originalEnv,
                STAGE: 'encryption-test',
                AES_KEY: key,
                AES_KEY_ID: '12345',
            };

            try {
                const { doc } = await saveTestDocument(Model);
                await expectValidRawDoc(Model, doc);

                process.env = {
                    ...originalEnv,
                    STAGE: 'encryption-test',
                    AES_KEY: crypto
                        .createHash('sha256')
                        .update('secret 2')
                        .digest(),
                    AES_KEY_ID: '67890',
                    DEPRECATED_AES_KEY: key,
                    DEPRECATED_AES_KEY_ID: '12345',
                };

                const { doc: doc2 } = await saveTestDocument(Model);
                await expectValidRawDoc(Model, doc2);
            } finally {
                process.env = originalEnv;
            }
        });
    });

    describe.skip('Using KMS', () => {
        beforeAll(() => {
            process.env = {
                ...originalEnv,
                STAGE: 'encryption-test',
                AWS_ACCESS_KEY_ID: 'test',
                AWS_SECRET_ACCESS_KEY: 'test',
                AWS_REGION: 'us-east-1',
                // This is needed for testing because LocalStack uses a self-signed certificate
                NODE_TLS_REJECT_UNAUTHORIZED: '0',
            };
        });

        // Create a CMK for testing
        beforeAll(async () => {
            const kmsClient = new AWS.KMS();
            const { KeyMetadata: keyMetadata } = await kmsClient
                .createKey()
                .promise();
            process.env.KMS_KEY_ARN = keyMetadata.KeyId;
        });

        afterAll(() => {
            process.env = originalEnv;
        });

        let Model;
        beforeAll(() => {
            Model = createModel().Model;
        });

        it('can instantiate the model', async () => {
            new Model();
        });

        it('works when no document is found with findOne', async () => {
            const notSecret = new mongoose.Types.ObjectId();
            const doc = await Model.findOne({ notSecret });
            expect(doc).toBe(null);
        });

        it('works when no documents are found with find', async () => {
            const notSecret = new mongoose.Types.ObjectId();
            const docs = await Model.find({ notSecret });
            expect(docs).toHaveLength(0);
        });

        it('can be saved', async function () {
            await saveTestDocument(Model);
        });

        it('can be reloaded', async function () {
            const { doc, notSecret } = await saveTestDocument(Model);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('notSecret');
            expect(reloaded.notSecret.toString()).toBe(notSecret.toString());
        });

        it('can be reloaded (nested field)', async function () {
            const notSecret = new mongoose.Types.ObjectId();
            const secret = 'abcdefg';
            const doc = new Model({
                notSecret,
                'deeply.nested.secret': secret,
            });

            expect(doc).toHaveProperty('notSecret');
            expect(doc.notSecret.toString()).toBe(notSecret.toString());
            expect(doc).toHaveProperty('deeply');
            expect(doc.deeply).toHaveProperty('nested');
            expect(doc.deeply.nested).toHaveProperty('secret', secret);

            await doc.save();

            expect(doc).toHaveProperty('notSecret');
            expect(doc.notSecret.toString()).toBe(notSecret.toString());
            expect(doc).toHaveProperty('deeply');
            expect(doc.deeply).toHaveProperty('nested');
            expect(doc.deeply.nested).toHaveProperty('secret', secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('notSecret');
            expect(reloaded.notSecret.toString()).toBe(notSecret.toString());
            expect(reloaded).toHaveProperty('deeply');
            expect(reloaded.deeply).toHaveProperty('nested');
            expect(reloaded.deeply.nested).toHaveProperty('secret', secret);
        });

        it('automatically encrypts a secret field when saved', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('notSecret');
            expect(reloaded.notSecret.toString()).toBe(notSecret.toString());
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe(secret);
        });

        it('automatically encrypts a secret field when using updateOne', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.updateOne({ _id: doc._id }, { secret: 'hijklmn' });

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using updateOne and $set', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.updateOne(
                { _id: doc._id },
                { $set: { secret: 'hijklmn' } }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using updateOne on document', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await doc.updateOne({ secret: 'hijklmn' });

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts and decrypts secret field when using findOneAndUpdate', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const reloaded = await Model.findOneAndUpdate(
                { _id: doc._id },
                { secret: 'beets' }
            );

            expect(reloaded).toHaveProperty('secret', secret);

            const updatedDoc = await Model.findOne({ _id: doc._id });
            expect(updatedDoc).toHaveProperty('secret', 'beets');
        });

        it('handles findOneAndUpdate with `new: true` option', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const updatedDoc = await Model.findOneAndUpdate(
                { _id: doc._id },
                { secret: 'beets' },
                { new: true }
            );
            expect(updatedDoc).toHaveProperty('secret', 'beets');

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret', 'beets');
        });

        it('automatically encrypts and decrypts secret field when using findOneAndReplace', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const reloaded = await Model.findOneAndReplace(
                { _id: doc._id },
                { secret: 'beets' }
            );

            expect(reloaded).toHaveProperty('secret', secret);

            const updatedDoc = await Model.findOne({ _id: doc._id });
            expect(updatedDoc).toHaveProperty('secret', 'beets');
        });

        it('automatically decrypts secret field when using findOneAndDelete', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            const deleted = await Model.findOneAndDelete({ _id: doc._id });
            expect(deleted).toHaveProperty('secret', secret);

            const docsForUser = await Model.find({ notSecret });
            expect(docsForUser).toHaveLength(0);
        });

        it('correctly handles `rawResult: true` option when using findOneAndDelete', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const deleted = await Model.findOneAndDelete(
                { _id: doc._id },
                { rawResult: true }
            );

            expect(deleted).toHaveProperty('value');
            expectValidSecret(deleted.value.secret);
        });

        it('automatically decrypts secret field when using findOneAndRemove', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            const deleted = await Model.findOneAndRemove({ _id: doc._id });
            expect(deleted).toHaveProperty('secret', secret);

            const docsForUser = await Model.find({ notSecret });
            expect(docsForUser).toHaveLength(0);
        });

        it('correctly handles `rawResult: true` option when using findOneAndRemove', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const rawDoc = await Model.findOneAndRemove(
                { _id: doc._id },
                { rawResult: true }
            );

            expect(rawDoc).toHaveProperty('value');
            expectValidSecret(rawDoc.value.secret);
        });

        it('automatically encrypts a secret field when using insertMany', async () => {
            // First create documents with secret values
            const notSecret = new mongoose.Types.ObjectId();
            const insertedDocs = await Model.insertMany([
                { notSecret, secret: 'qwerty' },
                { notSecret, secret: 'zxcvbn' },
            ]);

            expect(insertedDocs).toHaveLength(2);
            expect(insertedDocs[0]).toHaveProperty('secret', 'qwerty');
            expect(insertedDocs[1]).toHaveProperty('secret', 'zxcvbn');

            const rawDocs = await Model.collection.find({
                notSecret: notSecret.toString(),
            });

            for (const rawDoc of await rawDocs.toArray()) {
                expectValidSecret(rawDoc.secret);
            }

            // Finally, reload the docs with Mongoose, and ensure that the values
            // were successfully decrypted.
            const reloadedDocs = await Model.find({ notSecret });
            expect(reloadedDocs).toHaveLength(2);
            expect(reloadedDocs[0]).toHaveProperty('secret', 'qwerty');
            expect(reloadedDocs[1]).toHaveProperty('secret', 'zxcvbn');
        });

        it('throws if rawResult is used with insertMany', async () => {
            const notSecret = new mongoose.Types.ObjectId();

            try {
                await Model.insertMany([{ notSecret, secret: 'qwerty' }], {
                    rawResult: true,
                });
                throw new Error('Expected error did not occurr.');
            } catch (error) {
                expect(error).toHaveProperty(
                    'message',
                    'Raw result not supported for insertMany with Encrypt plugin'
                );
            }
        });

        it('automatically encrypts a secret field when using updateOne', async () => {
            const { doc, secret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.updateOne({ _id: doc._id }, { secret: 'hijklmn' });

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloadedDoc = await Model.findOne({ _id: doc._id });
            expect(reloadedDoc).toHaveProperty('secret');
            expect(reloadedDoc.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using replaceOne', async () => {
            const { doc, secret } = await saveTestDocument(Model);

            await Model.replaceOne({ _id: doc._id }, { secret: '012a457' });

            const rawDoc = await Model.collection.findOne({ _id: doc._id });
            expect(rawDoc).toHaveProperty('secret');
            expect(rawDoc).not.toHaveProperty('secret', secret);
            expectValidSecret(rawDoc.secret);

            const reloadedDoc = await Model.findOne({ _id: doc._id });
            expect(reloadedDoc).toHaveProperty('secret');
            expect(reloadedDoc.secret).toBe('012a457');
        });

        it('automatically encrypts a secret field when using update and $set', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            await Model.update(
                { _id: doc._id },
                { $set: { secret: 'hijklmn' } }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(updatedRawDoc.secret).not.toBe(rawDoc.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('secret');
            expect(reloaded.secret).toBe('hijklmn');
        });

        it('automatically encrypts a secret field when using $setOnInsert', async () => {
            const { doc, notSecret, secret } = await saveTestDocument(Model);
            const rawDoc = await expectValidRawDoc(Model, doc);

            const updateResult = await Model.update(
                { notSecret },
                { $setOnInsert: { secret: 'hijklmn' } },
                { upsert: true }
            );

            expect(updateResult).not.toHaveProperty('upserted');

            const notUpdatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(notUpdatedRawDoc.secret).toBe(rawDoc.secret);

            const reloadedNotUpdated = await Model.findOne({ _id: doc._id });
            expect(reloadedNotUpdated).toHaveProperty('secret', secret);

            const notSecret2 = new mongoose.Types.ObjectId();
            const updateResult2 = await Model.update(
                { notSecret: notSecret2 },
                { $setOnInsert: { secret: 'hijklmn' } },
                { upsert: true }
            );

            expect(updateResult2).toHaveProperty('upsertedCount', 1);

            // TODO Model.update deprecated
            // expect(updateResult2.upserted).toHaveLength(1);
            // expect(updateResult2.upserted[0]).toHaveProperty('_id');
            // expect(updateResult2.upserted[0]).not.toHaveProperty(
            //     '_id',
            //     doc._id.toString()
            // );

            // const upsertedRawDoc = await expectValidRawDocById(
            //     Model,
            //     updateResult2.upserted[0]._id
            // );
            // expect(upsertedRawDoc.secret).not.toBe(rawDoc.secret);

            // const reloaded = await Model.findOne({ _id: upsertedRawDoc._id });
            // expect(reloaded).toHaveProperty('secret', 'hijklmn');
        });

        it('throws an error if update uses an encrypted field with `multi: true`', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            try {
                await Model.update(
                    { notSecret },
                    { secret: 'change all passwords' },
                    { multiple: true }
                );
            } catch (error) {
                expect(error).toHaveProperty('message');
                expect(error.message).toBe(
                    'Attempted to update encrypted field of multiple documents'
                );

                const reloaded = await Model.findOne({ _id: doc._id });
                expect(reloaded).toHaveProperty('secret', secret);

                return;
            }

            throw new Error('Did not catch expected error');
        });

        it('throws an error if updateMany uses an encrypted field', async () => {
            const { doc, secret, notSecret } = await saveTestDocument(Model);

            try {
                await Model.updateMany(
                    { notSecret },
                    { secret: 'change all passwords' }
                );
            } catch (error) {
                expect(error).toHaveProperty('message');
                expect(error.message).toBe(
                    'Attempted to update encrypted field of multiple documents'
                );

                const reloaded = await Model.findOne({ _id: doc._id });
                expect(reloaded).toHaveProperty('secret', secret);

                return;
            }

            throw new Error('Did not catch expected error');
        });

        it('automatically encrypts a nested field when using updateOne', async () => {
            const { doc, secret } = await saveTestDocument(Model);

            await Model.updateOne(
                { _id: doc._id },
                { 'deeply.nested.secret': 'hij2lmn' }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expectValidSecret(updatedRawDoc.deeply.nested.secret);

            const reloadedDoc = await Model.findOne({ _id: doc._id });
            expect(reloadedDoc).toHaveProperty('deeply');
            expect(reloadedDoc.deeply).toHaveProperty('nested');
            expect(reloadedDoc.deeply.nested).toHaveProperty(
                'secret',
                'hij2lmn'
            );
        });

        it('automatically encrypts a nested field when using update and $set', async () => {
            const { doc, notSecret } = await saveTestDocument(Model);

            await Model.update(
                { _id: doc._id },
                {
                    $set: { deeply: { nested: { secret: 'h3jklmn' } } },
                }
            );

            const updatedRawDoc = await expectValidRawDoc(Model, doc);
            expectValidSecret(updatedRawDoc.deeply.nested.secret);

            const reloaded = await Model.findOne({ _id: doc._id });
            expect(reloaded).toHaveProperty('deeply');
            expect(reloaded.deeply).toHaveProperty('nested');
            expect(reloaded.deeply.nested).toHaveProperty('secret', 'h3jklmn');
        });

        it('automatically encrypts a secret field when using $setOnInsert', async () => {
            const { doc, notSecret, secret } = await saveTestDocument(Model);

            const updateResult = await Model.update(
                { notSecret },
                { $setOnInsert: { deeply: { 'nested.secret': 'hijkl4n' } } },
                { upsert: true }
            );

            expect(updateResult).not.toHaveProperty('upserted');

            const notUpdatedRawDoc = await expectValidRawDoc(Model, doc);
            expect(notUpdatedRawDoc).not.toHaveProperty('deeply');

            const notSecret2 = new mongoose.Types.ObjectId();
            const updateResult2 = await Model.update(
                { notSecret: notSecret2 },
                { $setOnInsert: { deeply: { 'nested.secret': 'hijkl4n' } } },
                { upsert: true }
            );

            expect(updateResult2).toHaveProperty('upsertedCount', 1);

            // TODO Model.update is deprecated
            // expect(updateResult2.upserted).toHaveLength(1);
            // expect(updateResult2.upserted[0]).toHaveProperty('_id');
            // expect(updateResult2.upserted[0]).not.toHaveProperty(
            //     '_id',
            //     doc._id.toString()
            // );

            // const upsertedRawDoc = await Model.collection.findOne({
            //     _id: updateResult2.upserted[0]._id,
            // });
            // expectValidSecret(upsertedRawDoc.deeply.nested.secret);

            // const reloaded = await Model.findOne({ _id: upsertedRawDoc._id });
            // expect(reloaded).toHaveProperty('deeply');
            // expect(reloaded.deeply).toHaveProperty('nested');
            // expect(reloaded.deeply.nested).toHaveProperty('secret', 'hijkl4n');
        });
    });
});
