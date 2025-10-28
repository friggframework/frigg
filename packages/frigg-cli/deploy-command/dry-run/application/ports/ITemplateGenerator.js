class ITemplateGenerator {
    /**
     * Generates CloudFormation template from app definition
     * @param {Object} params - Generation parameters
     * @param {Object} params.appDefinition - Application definition
     * @param {Object} params.discoveryResults - AWS resource discovery results (optional)
     * @param {string} params.stage - Deployment stage
     * @returns {Promise<Object>} Template generation result
     * @returns {Promise<string>} result.template - Generated template (YAML string)
     * @returns {Promise<Object>} result.summary - Template summary
     * @returns {Promise<Array>} result.summary.functions - Lambda functions
     * @returns {Promise<Array>} result.summary.endpoints - API endpoints
     * @returns {Promise<Object>} result.summary.resources - Custom resources
     */
    async generateTemplate(params) {
        throw new Error('ITemplateGenerator.generateTemplate() must be implemented');
    }
}

module.exports = { ITemplateGenerator };
