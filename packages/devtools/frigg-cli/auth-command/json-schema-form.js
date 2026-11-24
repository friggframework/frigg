const { input, password } = require('@inquirer/prompts');
const chalk = require('chalk');

/**
 * Renders a JSON Schema form as interactive CLI prompts
 *
 * @param {Object} jsonSchema - JSON Schema object with properties, required fields, etc.
 * @param {Object} uiSchema - UI Schema with rendering hints (ui:widget, ui:help, ui:placeholder)
 * @returns {Promise<Object>} - Object containing all form field values
 */
async function renderJsonSchemaForm(jsonSchema, uiSchema = {}) {
    const results = {};
    const properties = jsonSchema.properties || {};
    const required = jsonSchema.required || [];

    // Display form title
    if (jsonSchema.title) {
        console.log(chalk.blue(`\n📝 ${jsonSchema.title}\n`));
    }

    for (const [key, prop] of Object.entries(properties)) {
        const ui = uiSchema[key] || {};
        const isRequired = required.includes(key);
        const isPassword = ui['ui:widget'] === 'password';

        // Build prompt message with title
        const fieldTitle = prop.title || key;

        // Show help text before the prompt if available
        if (ui['ui:help']) {
            console.log(chalk.gray(`  (${ui['ui:help']})`));
        }

        let value;
        if (isPassword) {
            value = await password({
                message: fieldTitle,
                mask: '*',
                validate: (input) => {
                    if (isRequired && !input) {
                        return `${fieldTitle} is required`;
                    }
                    return true;
                },
            });
        } else {
            value = await input({
                message: fieldTitle,
                default: '',
                validate: (input) => {
                    if (isRequired && !input) {
                        return `${fieldTitle} is required`;
                    }
                    return true;
                },
            });
        }

        if (value) {
            results[key] = value;
        }
    }

    return results;
}

module.exports = { renderJsonSchemaForm };
