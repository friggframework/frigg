/**
 * Base Infrastructure Builder Interface
 * 
 * Domain Layer - Hexagonal Architecture
 * 
 * This abstract class defines the contract for all infrastructure builders.
 * Each infrastructure domain (VPC, KMS, Database, etc.) implements this interface.
 * 
 * Benefits of Hexagonal Architecture:
 * - Domain logic separated from infrastructure concerns
 * - Easy to test in isolation
 * - Dependency injection for cross-cutting concerns
 * - Clear boundaries between domains
 * - Enables parallel execution where dependencies allow
 */

class InfrastructureBuilder {
    /**
     * Build infrastructure resources
     * 
     * @param {Object} appDefinition - Application definition from user
     * @param {Object} discoveredResources - Resources discovered from AWS
     * @returns {Object} CloudFormation resources to add to template
     * @throws {Error} If validation fails or build encounters errors
     */
    async build(appDefinition, discoveredResources) {
        throw new Error('InfrastructureBuilder.build() must be implemented by subclass');
    }

    /**
     * Validate configuration before building
     * 
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result { valid: boolean, errors: string[] }
     */
    validate(config) {
        throw new Error('InfrastructureBuilder.validate() must be implemented by subclass');
    }

    /**
     * Check if this builder should execute
     * 
     * @param {Object} appDefinition - Application definition
     * @returns {boolean} True if builder should execute
     */
    shouldExecute(appDefinition) {
        return false;
    }

    /**
     * Get dependencies (other builders that must execute first)
     * 
     * @returns {Array<string>} Array of builder names this depends on
     */
    getDependencies() {
        return [];
    }

    /**
     * Get builder name for logging and dependency resolution
     * 
     * @returns {string} Builder name
     */
    getName() {
        return this.constructor.name;
    }
}

/**
 * Value Object for validation results
 */
class ValidationResult {
    constructor(valid = true, errors = [], warnings = []) {
        this.valid = valid;
        this.errors = errors;
        this.warnings = warnings;
    }

    addError(error) {
        this.errors.push(error);
        this.valid = false;
    }

    addWarning(warning) {
        this.warnings.push(warning);
    }

    hasErrors() {
        return this.errors.length > 0;
    }

    hasWarnings() {
        return this.warnings.length > 0;
    }

    toString() {
        let result = `Valid: ${this.valid}\n`;
        if (this.errors.length > 0) {
            result += `Errors:\n  - ${this.errors.join('\n  - ')}\n`;
        }
        if (this.warnings.length > 0) {
            result += `Warnings:\n  - ${this.warnings.join('\n  - ')}\n`;
        }
        return result;
    }
}

module.exports = {
    InfrastructureBuilder,
    ValidationResult,
};

