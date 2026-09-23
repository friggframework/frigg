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

/**
 * @throws {Error} When field-level encryption still encrypts `mapping`, or a
 *   nested `mapping.*` path, on write, naming the opt-out that lifts it
 */
function assertMappingWrittenUnencrypted() {
    const fields = getMappingFieldsEncryptedOnWrite();
    if (fields.length === 0) return;

    const encrypted = fields
        .map((field) => `IntegrationMapping.${field}`)
        .join(', ');
    const optOut = fields.map((field) => `'${field}'`).join(', ');
    throw new Error(
        `queryMappings: field-level encryption still encrypts ${encrypted} on write, so it cannot be queried. Opt out by adding ${optOut} to appDefinition.encryption.disable.IntegrationMapping.`
    );
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
    assertMappingWrittenUnencrypted,
    getMappingFieldsEncryptedOnWrite,
    resetMappingEncryptionCheck,
};
