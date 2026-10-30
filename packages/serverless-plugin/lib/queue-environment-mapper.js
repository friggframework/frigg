/**
 * Domain Service - Queue to Environment Variable Mapper
 *
 * Maps queue keys to environment variable names using naming convention.
 * Pattern: AsanaQueue -> ASANA_QUEUE_URL
 */
class QueueEnvironmentMapper {
  /**
   * @param {Array<{key: string, name: string}>} queues - Queue definitions
   * @returns {Object} Map of queue keys to environment variable names
   */
  createMapping(queues) {
    const mapping = {};

    queues.forEach(queue => {
      const baseName = queue.key.replace(/Queue$/, '');
      const envVarName = `${baseName.toUpperCase()}_QUEUE_URL`;
      mapping[queue.key] = envVarName;
    });

    return mapping;
  }

  /**
   * @param {string} queueKey - Queue key to look up
   * @param {Object} mapping - Environment variable mapping
   * @returns {string} Environment variable name
   * @throws {Error} If no mapping found
   */
  getEnvironmentKey(queueKey, mapping) {
    const envKey = mapping[queueKey];

    if (!envKey) {
      throw new Error(
        `No environment variable mapping found for queue "${queueKey}". ` +
        `Expected pattern: {QueueName}Queue -> {QUEUENAME}_QUEUE_URL`
      );
    }

    return envKey;
  }
}

module.exports = { QueueEnvironmentMapper };
