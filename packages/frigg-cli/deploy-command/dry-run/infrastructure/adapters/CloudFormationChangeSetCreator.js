const {
    CloudFormationClient,
    CreateChangeSetCommand,
    DescribeStacksCommand,
    DescribeChangeSetCommand,
    DeleteChangeSetCommand,
} = require('@aws-sdk/client-cloudformation');

const { IChangeSetCreator } = require('../../application/ports/IChangeSetCreator');

class CloudFormationChangeSetCreator extends IChangeSetCreator {
    constructor(options = {}) {
        super();
        this.region = options.region || process.env.AWS_REGION || 'us-east-1';
        this._client = null;
    }

    _getClient() {
        if (!this._client) {
            this._client = new CloudFormationClient({ region: this.region });
        }
        return this._client;
    }

    /**
     * Checks if a CloudFormation stack exists
     * @param {string} stackName - CloudFormation stack name
     * @returns {Promise<boolean>} True if stack exists and is not deleted
     */
    async stackExists(stackName) {
        try {
            const command = new DescribeStacksCommand({
                StackName: stackName,
            });

            const response = await this._getClient().send(command);

            const stack = response.Stacks && response.Stacks[0];
            if (stack && stack.StackStatus === 'DELETE_COMPLETE') {
                return false;
            }

            return true;
        } catch (error) {
            if (error.name === 'ValidationError') {
                return false;
            }

            throw error;
        }
    }

    async createChangeSet(params) {
        const { stackName, template, parameters, tags, capabilities } = params;

        const exists = await this.stackExists(stackName);
        const changeSetType = exists ? 'UPDATE' : 'CREATE';
        const changeSetName = `frigg-dry-run-${Date.now()}`;

        const command = new CreateChangeSetCommand({
            StackName: stackName,
            TemplateBody: template,
            Parameters: parameters || [],
            Tags: tags || [],
            Capabilities: capabilities || [],
            ChangeSetName: changeSetName,
            ChangeSetType: changeSetType,
            Description: 'Frigg dry-run change set for deployment preview',
        });

        const response = await this._getClient().send(command);

        return {
            changeSetId: response.Id,
            stackId: response.StackId,
            changeSetName: changeSetName,
            changeSetType: changeSetType,
        };
    }

    async waitForChangeSet(stackName, changeSetName, maxWaitTimeMs = 300000) {
        const startTime = Date.now();
        const pollIntervalMs = 2000;

        while (true) {
            if (Date.now() - startTime > maxWaitTimeMs) {
                throw new Error(
                    `Timeout waiting for change set creation after ${maxWaitTimeMs}ms`
                );
            }

            const command = new DescribeChangeSetCommand({
                StackName: stackName,
                ChangeSetName: changeSetName,
            });

            const response = await this._getClient().send(command);

            if (response.Status === 'CREATE_COMPLETE') {
                return;
            }

            if (
                response.Status === 'FAILED' &&
                response.StatusReason &&
                response.StatusReason.includes("didn't contain changes")
            ) {
                return;
            }

            if (response.Status === 'FAILED') {
                throw new Error(
                    `Change set creation failed: ${response.StatusReason || 'Unknown error'}`
                );
            }

            await this._sleep(pollIntervalMs);
        }
    }

    async getChangeSetDetails(stackName, changeSetName) {
        let allChanges = [];
        let nextToken = null;

        do {
            const command = new DescribeChangeSetCommand({
                StackName: stackName,
                ChangeSetName: changeSetName,
                NextToken: nextToken,
            });

            const response = await this._getClient().send(command);

            if (response.Changes) {
                allChanges = allChanges.concat(response.Changes);
            }

            nextToken = response.NextToken;

            if (!nextToken) {
                return {
                    ...response,
                    Changes: allChanges,
                };
            }
        } while (nextToken);

        throw new Error('Unexpected pagination state');
    }

    async deleteChangeSet(stackName, changeSetName) {
        try {
            const command = new DeleteChangeSetCommand({
                StackName: stackName,
                ChangeSetName: changeSetName,
            });

            await this._getClient().send(command);
        } catch (error) {
            if (error.name === 'ChangeSetNotFoundException') {
                return;
            }

            throw error;
        }
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = { CloudFormationChangeSetCreator };
