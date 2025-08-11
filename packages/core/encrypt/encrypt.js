const { Cryptor } = require('./Cryptor');

const updateOneEvents = [
    'updateOne',
    'replaceOne',
    'findOneAndUpdate',
    'findOneAndReplace',
];
const findOneEvents = [
    'findOne',
    'findOneAndDelete',
    'findOneAndRemove',
    'findOneAndUpdate',
    'findOneAndReplace',
];

const shouldBypassEncryption = (STAGE) => {
    const defaultBypassStages = ['dev', 'test', 'local'];
    const bypassStageEnv = process.env.BYPASS_ENCRYPTION_STAGE;
    const useEnv = !String(bypassStageEnv) || !!bypassStageEnv;
    const bypassStages = useEnv
        ? bypassStageEnv.split(',').map((stage) => stage.trim())
        : defaultBypassStages;
    return bypassStages.includes(STAGE);
};

function Encrypt(schema) {
    const { STAGE, KMS_KEY_ARN, AES_KEY_ID } = process.env;

    if (shouldBypassEncryption(STAGE)) {
        return;
    }

    const hasAES = AES_KEY_ID && AES_KEY_ID.trim() !== '';
    const hasKMS = KMS_KEY_ARN && KMS_KEY_ARN.trim() !== '' && !hasAES;

    const fields = Object.values(schema.paths)
        .map(({ path, options }) => (options.lhEncrypt === true ? path : ''))
        .filter(Boolean);

    if (!fields.length) {
        return;
    }

    const cryptor = new Cryptor({
        shouldUseAws: hasKMS,
        fields: fields,
    });

    schema.pre('save', async function encryptionPreSave() {
        await cryptor.encryptFieldsInDocuments([this]);
    });

    schema.pre(
        'insertMany',
        async function encryptionPreInsertMany(_, docs, options) {
            if (options?.rawResult) {
                throw new Error(
                    'Raw result not supported for insertMany with Encrypt plugin'
                );
            }

            await cryptor.encryptFieldsInDocuments(docs);
        }
    );

    schema.pre(updateOneEvents, async function encryptionPreUpdateOne() {
        await cryptor.encryptFieldsInQuery(this);
    });

    schema.pre('updateMany', async function encryptionPreUpdateMany() {
        cryptor.expectNotToUpdateManyEncrypted(this.getUpdate());
    });

    schema.pre('update', async function encryptionPreUpdate() {
        const { multiple } = this.getOptions();

        if (multiple) {
            cryptor.expectNotToUpdateManyEncrypted(this.getUpdate());
            return;
        }

        await cryptor.encryptFieldsInQuery(this);
    });

    schema.post('save', async function encryptionPreSave() {
        await cryptor.decryptFieldsInDocuments([this]);
    });

    schema.post(findOneEvents, async function encryptionPostFindOne(doc) {
        const { rawResult } = this.getOptions();

        if (rawResult) {
            return;
        }

        await cryptor.decryptFieldsInDocuments([doc]);
    });

    schema.post('find', async function encryptionPostFind(docs) {
        await cryptor.decryptFieldsInDocuments(docs);
    });

    schema.post('insertMany', async function encryptionPostInsertMany(docs) {
        await cryptor.decryptFieldsInDocuments(docs);
    });
}

module.exports = { Encrypt };
