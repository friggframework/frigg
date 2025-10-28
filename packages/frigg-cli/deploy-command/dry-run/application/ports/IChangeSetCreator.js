class IChangeSetCreator {
    /**
     * Creates a CloudFormation change set for preview
     * @param {Object} params - Change set parameters
     * @param {string} params.stackName - CloudFormation stack name
     * @param {string} params.template - CloudFormation template (YAML or JSON string)
     * @param {Array} params.parameters - CloudFormation parameters
     * @param {Array} params.tags - Resource tags
     * @param {Array} params.capabilities - Required capabilities
     * @returns {Promise<Object>} Change set details
     */
    async createChangeSet(params) {
        throw new Error('IChangeSetCreator.createChangeSet() must be implemented');
    }

    /**
     * Checks if a stack exists
     * @param {string} stackName - CloudFormation stack name
     * @returns {Promise<boolean>} True if stack exists
     */
    async stackExists(stackName) {
        throw new Error('IChangeSetCreator.stackExists() must be implemented');
    }

    /**
     * Waits for change set creation to complete
     * @param {string} stackName - CloudFormation stack name
     * @param {string} changeSetName - Change set name
     * @param {number} maxWaitTimeMs - Maximum wait time in milliseconds
     * @returns {Promise<void>}
     */
    async waitForChangeSet(stackName, changeSetName, maxWaitTimeMs) {
        throw new Error('IChangeSetCreator.waitForChangeSet() must be implemented');
    }

    /**
     * Retrieves change set details
     * @param {string} stackName - CloudFormation stack name
     * @param {string} changeSetName - Change set name
     * @returns {Promise<Object>} Change set details
     */
    async getChangeSetDetails(stackName, changeSetName) {
        throw new Error('IChangeSetCreator.getChangeSetDetails() must be implemented');
    }

    /**
     * Deletes a change set (cleanup)
     * @param {string} stackName - CloudFormation stack name
     * @param {string} changeSetName - Change set name
     * @returns {Promise<void>}
     */
    async deleteChangeSet(stackName, changeSetName) {
        throw new Error('IChangeSetCreator.deleteChangeSet() must be implemented');
    }
}

module.exports = { IChangeSetCreator };
