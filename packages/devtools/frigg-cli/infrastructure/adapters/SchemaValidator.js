const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const path = require('path');
const fs = require('fs-extra');

/**
 * SchemaValidator
 * Validates data against JSON schemas from /packages/schemas
 */
class SchemaValidator {
    constructor(schemasPath) {
        // Default to schemas package in monorepo
        this.schemasPath = schemasPath || path.join(__dirname, '../../../../schemas/schemas');

        this.ajv = new Ajv({
            allErrors: true,
            strict: false,
            validateFormats: true
        });

        addFormats(this.ajv);
        this.schemas = new Map();
    }

    /**
     * Load and compile a schema
     */
    async loadSchema(schemaName) {
        if (this.schemas.has(schemaName)) {
            return this.schemas.get(schemaName);
        }

        const schemaPath = path.join(this.schemasPath, `${schemaName}.schema.json`);

        if (!await fs.pathExists(schemaPath)) {
            throw new Error(`Schema not found: ${schemaPath}`);
        }

        const schemaContent = await fs.readFile(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);

        const validate = this.ajv.compile(schema);
        this.schemas.set(schemaName, validate);

        return validate;
    }

    /**
     * Validate data against a schema
     * @param {string} schemaName - Name of the schema (e.g., 'integration-definition')
     * @param {object} data - Data to validate
     * @returns {Promise<{valid: boolean, errors: string[]}>}
     */
    async validate(schemaName, data) {
        try {
            const validate = await this.loadSchema(schemaName);
            const valid = validate(data);

            if (!valid) {
                const errors = validate.errors.map(err => {
                    const path = err.instancePath || '/';
                    return `${path} ${err.message}`;
                });

                return {
                    valid: false,
                    errors
                };
            }

            return {
                valid: true,
                errors: []
            };
        } catch (error) {
            return {
                valid: false,
                errors: [`Schema validation error: ${error.message}`]
            };
        }
    }

    /**
     * Check if a schema exists
     */
    async hasSchema(schemaName) {
        const schemaPath = path.join(this.schemasPath, `${schemaName}.schema.json`);
        return await fs.pathExists(schemaPath);
    }
}

module.exports = {SchemaValidator};
