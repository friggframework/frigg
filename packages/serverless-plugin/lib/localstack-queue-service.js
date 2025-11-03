/**
 * Infrastructure Service - LocalStack Queue Management
 *
 * Handles SQS queue creation in LocalStack for offline development.
 */
class LocalStackQueueService {
  constructor(sqsClient) {
    this.sqs = sqsClient;
  }

  /**
   * @param {string} queueName - Name of queue to create
   * @returns {Promise<string>} Queue URL
   */
  async createQueue(queueName) {
    return new Promise((resolve, reject) => {
      this.sqs.createQueue({ QueueName: queueName }, (err, data) => {
        if (err) {
          reject(new Error(`Failed to create queue ${queueName}: ${err.message}`));
        } else {
          resolve(data.QueueUrl);
        }
      });
    });
  }

  /**
   * @param {Array<{key: string, name: string}>} queues - Queue definitions
   * @returns {Promise<Array<{key: string, url: string}>>} Created queues with URLs
   */
  async createQueues(queues) {
    const results = await Promise.all(
      queues.map(async (queue) => {
        const url = await this.createQueue(queue.name);
        console.log(`Queue ${queue.name} created successfully. URL: ${url}`);
        return { key: queue.key, url };
      })
    );

    return results;
  }
}

module.exports = { LocalStackQueueService };
