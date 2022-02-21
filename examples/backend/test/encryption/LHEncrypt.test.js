const AWS = require('aws-sdk');
const chai = require('chai');
const crypto = require('crypto');
const TestEncrypt = require('./TestEncrypt');

const { expect } = chai;
const originalEnv = process.env;

// Default LocalStack endpoint
AWS.config.update({
    endpoint: 'localhost:4566',
});

describe('LHEncrypt', async () => {
    describe('Disabled mode', async () => {
        it('can be disabled', async () => {
            process.env = {
                ...originalEnv,
                STAGE: 'not-encryption-test',
            };

            try {
                const { Model } = TestEncrypt.createModel();
                const { doc, secret } = await TestEncrypt.saveTestDocument(
                    Model
                );
                const rawDoc = await Model.collection.findOne({ _id: doc._id });

                // Test it was not encrypted in Mongo.
                expect(rawDoc).to.have.property('secret', secret);
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
                TestEncrypt.createModel();
            } catch (error) {
                expect(error).to.have.property(
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

    describe('Local encryption functions', async () => {
        before(() => {
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

        after(() => {
            process.env = originalEnv;
        });

        TestEncrypt.generateTests();

        it('can use the deprecated key', async () => {
            const { Model } = TestEncrypt.createModel();
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
                const { doc } = await TestEncrypt.saveTestDocument(Model);
                await TestEncrypt.expectValidRawDoc(Model, doc);

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

                const { doc: doc2 } = await TestEncrypt.saveTestDocument(Model);
                await TestEncrypt.expectValidRawDoc(Model, doc2);
            } finally {
                process.env = originalEnv;
            }
        });
    });

    describe.skip('Using KMS', async () => {
        before(() => {
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
        before(async () => {
            const kmsClient = new AWS.KMS();
            const { KeyMetadata: keyMetadata } = await kmsClient
                .createKey()
                .promise();
            process.env.KMS_KEY_ARN = keyMetadata.KeyId;
        });

        after(() => {
            process.env = originalEnv;
        });

        TestEncrypt.generateTests();
    });
});
