#!/usr/bin/env node

/**
 * Schema validation script
 * Validates all JSON schemas for correctness and consistency
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');
const { schemas } = require('../index');

console.log('🔍 Validating Frigg JSON Schemas...\n');

// Initialize AJV with meta-schema validation
const ajv = new Ajv({
    validateSchema: true,
    allErrors: true
});
addFormats(ajv);

let hasErrors = false;

// Validate each schema against JSON Schema meta-schema
Object.entries(schemas).forEach(([name, schema]) => {
    console.log(`Validating ${name} schema...`);
    
    try {
        // Validate the schema itself
        const valid = ajv.validateSchema(schema);
        
        if (!valid) {
            console.error(`❌ ${name} schema is invalid:`);
            console.error(ajv.errorsText(ajv.errors));
            hasErrors = true;
        } else {
            console.log(`✅ ${name} schema is valid`);
            
            // Test with example data if available
            if (schema.examples && schema.examples.length > 0) {
                const validator = ajv.compile(schema);
                schema.examples.forEach((example, index) => {
                    const exampleValid = validator(example);
                    if (!exampleValid) {
                        console.error(`❌ ${name} example ${index} is invalid:`);
                        console.error(ajv.errorsText(validator.errors));
                        hasErrors = true;
                    } else {
                        console.log(`  ✅ Example ${index} validates correctly`);
                    }
                });
            }
        }
    } catch (error) {
        console.error(`❌ Error validating ${name} schema:`, error.message);
        hasErrors = true;
    }
    
    console.log('');
});

// Summary
if (hasErrors) {
    console.error('❌ Schema validation failed. Please fix the errors above.');
    process.exit(1);
} else {
    console.log('✅ All schemas are valid!');
    console.log(`\n📊 Summary:`);
    console.log(`  - ${Object.keys(schemas).length} schemas validated`);
    console.log(`  - All examples pass validation`);
    console.log(`  - Ready for production use`);
}