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
   *
   * Attributes whose value still contains an unresolved CloudFormation
   * intrinsic (`Fn::GetAtt`, `Ref`, `Fn::Sub`, …) are DROPPED rather
   * than stringified. Example: integration-builder.js emits
   * `RedrivePolicy.deadLetterTargetArn: {'Fn::GetAtt': [...]}`, which
   * CloudFormation resolves to a real ARN in AWS but is still a raw
   * intrinsic object at local plugin-time. Forwarding that JSON blob
   * to SQS `CreateQueue` would fail (`deadLetterTargetArn` must be a
   * valid ARN string) or produce malformed config. Dropping the
   * attribute gives local parity on every other queue property
   * (notably `VisibilityTimeout`, which is the main reason this code
   * exists) while leaving the DLQ association intentionally un-wired
   * locally — matching the pre-PR behavior for that one attribute.
   * @private
   */
  _propertiesToAttributes(properties = {}) {
    const attributes = {};
    for (const key of LocalStackQueueService.PROPERTY_ATTRIBUTE_KEYS) {
      const value = properties[key];
      if (value === undefined || value === null) continue;
      if (LocalStackQueueService._containsUnresolvedIntrinsic(value)) {
        console.warn(
          `[frigg-plugin] Skipping queue attribute "${key}" because it contains an unresolved CloudFormation intrinsic. ` +
            `Deployed AWS will apply it via CloudFormation; local emulation will fall back to the AWS default for this attribute.`
        );
        continue;
      }
      attributes[key] =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    return attributes;
  }

  /**
   * Recursively checks whether a value still contains a CloudFormation
   * intrinsic function key (`Fn::*` or `Ref`). Such values are unsafe
   * to pass through to SQS `CreateQueue` — AWS's runtime API doesn't
   * understand CloudFormation intrinsics; they're only valid inside
   * serverless.yml / CloudFormation templates.
   * @private
   */
  static _containsUnresolvedIntrinsic(value) {
    if (value === null || value === undefined) return false;
    if (typeof value !== 'object') return false;
    if (Array.isArray(value)) {
      return value.some((v) =>
        LocalStackQueueService._containsUnresolvedIntrinsic(v)
      );
    }
    for (const key of Object.keys(value)) {
      if (key === 'Ref' || key.startsWith('Fn::')) return true;
      if (
        LocalStackQueueService._containsUnresolvedIntrinsic(value[key])
      ) {
        return true;
      }
    }
    return false;
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
