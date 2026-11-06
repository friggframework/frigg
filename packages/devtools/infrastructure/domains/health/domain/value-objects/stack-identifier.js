/**
 * StackIdentifier Value Object
 *
 * Immutable identifier for a CloudFormation stack
 * Combines stack name, region, and optional account ID
 */

class StackIdentifier {
    /**
     * Valid AWS regions
     * @private
     */
    static VALID_REGIONS = [
        'us-east-1',
        'us-east-2',
        'us-west-1',
        'us-west-2',
        'af-south-1',
        'ap-east-1',
        'ap-south-1',
        'ap-northeast-1',
        'ap-northeast-2',
        'ap-northeast-3',
        'ap-southeast-1',
        'ap-southeast-2',
        'ca-central-1',
        'eu-central-1',
        'eu-west-1',
        'eu-west-2',
        'eu-west-3',
        'eu-north-1',
        'eu-south-1',
        'me-south-1',
        'sa-east-1',
    ];

    /**
     * Create a new StackIdentifier
     *
     * @param {Object} params
     * @param {string} params.stackName - CloudFormation stack name
     * @param {string} params.region - AWS region
     * @param {string} [params.accountId] - AWS account ID (12 digits)
     */
    constructor({ stackName, region, accountId = null }) {
        // Validate required fields
        if (stackName === undefined || stackName === null) {
            throw new Error('stackName is required');
        }

        if (region === undefined || region === null) {
            throw new Error('region is required');
        }

        // Validate formats
        if (typeof stackName === 'string' && stackName.trim() === '') {
            throw new Error('stackName cannot be empty');
        }

        if (!StackIdentifier.VALID_REGIONS.includes(region)) {
            throw new Error('region must be a valid AWS region');
        }

        if (accountId !== null && !/^\d{12}$/.test(accountId)) {
            throw new Error('accountId must be a 12-digit number');
        }

        // Assign properties
        this._stackName = stackName;
        this._region = region;
        this._accountId = accountId;

        // Make immutable
        Object.freeze(this);
    }

    /**
     * Get stack name
     * @returns {string}
     */
    get stackName() {
        return this._stackName;
    }

    /**
     * Prevent modification of stackName
     * @throws {TypeError}
     */
    set stackName(value) {
        throw new TypeError('Cannot modify immutable property stackName');
    }

    /**
     * Get region
     * @returns {string}
     */
    get region() {
        return this._region;
    }

    /**
     * Prevent modification of region
     * @throws {TypeError}
     */
    set region(value) {
        throw new TypeError('Cannot modify immutable property region');
    }

    /**
     * Get account ID
     * @returns {string|null}
     */
    get accountId() {
        return this._accountId;
    }

    /**
     * Prevent modification of accountId
     * @throws {TypeError}
     */
    set accountId(value) {
        throw new TypeError('Cannot modify immutable property accountId');
    }

    /**
     * Check equality with another StackIdentifier
     *
     * @param {StackIdentifier} other
     * @returns {boolean}
     */
    equals(other) {
        if (!(other instanceof StackIdentifier)) {
            return false;
        }

        return (
            this.stackName === other.stackName &&
            this.region === other.region &&
            this.accountId === other.accountId
        );
    }

    /**
     * Get string representation
     *
     * @returns {string}
     */
    toString() {
        if (this.accountId) {
            return `${this.stackName} (${this.region}, ${this.accountId})`;
        }
        return `${this.stackName} (${this.region})`;
    }

    /**
     * Serialize to JSON
     *
     * @returns {Object}
     */
    toJSON() {
        return {
            stackName: this.stackName,
            region: this.region,
            accountId: this.accountId,
        };
    }

    /**
     * Create StackIdentifier from ARN
     *
     * @param {string} arn - CloudFormation stack ARN
     * @returns {StackIdentifier}
     */
    static fromArn(arn) {
        // arn:aws:cloudformation:region:account-id:stack/stack-name/guid
        const match = arn.match(/^arn:aws:cloudformation:([^:]+):(\d{12}):stack\/([^\/]+)/);

        if (!match) {
            throw new Error('Invalid CloudFormation stack ARN');
        }

        const [, region, accountId, stackName] = match;

        return new StackIdentifier({
            stackName,
            region,
            accountId,
        });
    }
}

module.exports = StackIdentifier;
