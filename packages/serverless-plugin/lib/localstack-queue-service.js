/**
 * Infrastructure Service - LocalStack Queue Management
 *
 * Handles SQS queue creation in LocalStack for offline development.
 *
 * On deployed AWS, CloudFormation applies queue properties
 * (VisibilityTimeout, MessageRetentionPeriod, RedrivePolicy) from the
 * `Resources` block in serverless.yml. LocalStack gets those same
 * properties here so local emulation matches production behavior —
 * otherwise the queue defaults to a 30s VisibilityTimeout which re-
 * delivers in-flight messages while a long-running queue worker is
 * still processing them.
 */
class LocalStackQueueService {
  constructor(sqsClient) {
    this.sqs = sqsClient;
  }

  /**
   * Whitelist of CloudFormation `AWS::SQS::Queue` Properties that map
   * onto SQS `CreateQueue` Attributes. Everything else (tags, inline
   * refs, etc.) is dropped on the way to LocalStack.
   * @private
   */
  static PROPERTY_ATTRIBUTE_KEYS = [
    'DelaySeconds',
    'MaximumMessageSize',
    'MessageRetentionPeriod',
    'ReceiveMessageWaitTimeSeconds',
    'VisibilityTimeout',
    'RedrivePolicy',
    'RedriveAllowPolicy',
    'KmsMasterKeyId',
    'KmsDataKeyReusePeriodSeconds',
    'SqsManagedSseEnabled',
    'FifoQueue',
    'ContentBasedDeduplication',
    'DeduplicationScope',
    'FifoThroughputLimit',
  ];

  /**
   * Serialize a CloudFormation `Properties` object into the
   * `Attributes` shape the SQS `CreateQueue` API accepts (string
   * values only; object values like `RedrivePolicy` get JSON-encoded).
   * @private
   */
  _propertiesToAttributes(properties = {}) {
    const attributes = {};
    for (const key of LocalStackQueueService.PROPERTY_ATTRIBUTE_KEYS) {
      const value = properties[key];
      if (value === undefined || value === null) continue;
      attributes[key] =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    return attributes;
  }

  /**
   * @param {string} queueName - Name of queue to create
   * @param {Object} [attributes] - SQS CreateQueue Attributes (already
   *   stringified); missing/empty attributes fall back to AWS defaults.
   * @returns {Promise<string>} Queue URL
   */
  async createQueue(queueName, attributes) {
    return new Promise((resolve, reject) => {
      const params = { QueueName: queueName };
      if (attributes && Object.keys(attributes).length > 0) {
        params.Attributes = attributes;
      }
      this.sqs.createQueue(params, (err, data) => {
        if (err) {
          reject(new Error(`Failed to create queue ${queueName}: ${err.message}`));
        } else {
          resolve(data.QueueUrl);
        }
      });
    });
  }

  /**
   * @param {Array<{key: string, name: string, properties?: Object}>} queues
   *   Queue definitions. `properties` mirrors the CloudFormation
   *   `AWS::SQS::Queue` Properties block; extracted by the plugin from
   *   `serverless.service.resources.Resources`.
   * @returns {Promise<Array<{key: string, url: string}>>} Created queues with URLs
   */
  async createQueues(queues) {
    const results = await Promise.all(
      queues.map(async (queue) => {
        const attributes = this._propertiesToAttributes(queue.properties);
        const url = await this.createQueue(queue.name, attributes);
        console.log(`Queue ${queue.name} created successfully. URL: ${url}`);
        return { key: queue.key, url };
      })
    );

    return results;
  }
}

module.exports = { LocalStackQueueService };
