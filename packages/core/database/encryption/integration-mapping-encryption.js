const { getEncryptionConfig } = require('../prisma');
const {
    getFieldsToEncryptOnWrite,
    loadCustomEncryptionSchema,
} = require('./encryption-schema-registry');

let mappingWrittenPlain = false;

/**
 * The `IntegrationMapping` fields, `mapping` itself or a nested `mapping.*`
 * path, that field-level encryption encrypts on write. An empty result is
 * kept for the life of the process.
 *
 * @returns {string[]} Empty when every mapping path is written as plain JSON
 */
function getMappingFieldsEncryptedOnWrite() {
    if (mappingWrittenPlain) return [];

    const fields = encryptedMappingFields();
    mappingWrittenPlain = fields.length === 0;
    return fields;
}

function encryptedMappingFields() {
    if (!getEncryptionConfig().enabled) return [];

    loadCustomEncryptionSchema();
    return getFieldsToEncryptOnWrite('IntegrationMapping').filter(
        (field) => field === 'mapping' || field.startsWith('mapping.')
    );
}

/** Test helper: forget a kept result. */
function resetMappingEncryptionCheck() {
    mappingWrittenPlain = false;
}

module.exports = {
    getMappingFieldsEncryptedOnWrite,
    resetMappingEncryptionCheck,
};
