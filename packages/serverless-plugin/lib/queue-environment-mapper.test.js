const { QueueEnvironmentMapper } = require('./queue-environment-mapper');

describe('QueueEnvironmentMapper', () => {
  let mapper;

  beforeEach(() => {
    mapper = new QueueEnvironmentMapper();
  });

  describe('createMapping', () => {
    it('should map single queue key to environment variable name', () => {
      const queues = [{ key: 'AsanaQueue', name: 'test-asana-queue' }];
      const result = mapper.createMapping(queues);

      expect(result).toEqual({
        AsanaQueue: 'ASANA_QUEUE_URL',
      });
    });

    it('should map multiple queue keys to environment variable names', () => {
      const queues = [
        { key: 'AsanaQueue', name: 'test-asana-queue' },
        { key: 'SlackQueue', name: 'test-slack-queue' },
        { key: 'HubspotQueue', name: 'test-hubspot-queue' },
      ];
      const result = mapper.createMapping(queues);

      expect(result).toEqual({
        AsanaQueue: 'ASANA_QUEUE_URL',
        SlackQueue: 'SLACK_QUEUE_URL',
        HubspotQueue: 'HUBSPOT_QUEUE_URL',
      });
    });

    it('should handle empty queue array', () => {
      const result = mapper.createMapping([]);
      expect(result).toEqual({});
    });

    it('should preserve case in base name conversion', () => {
      const queues = [{ key: 'MyCustomQueue', name: 'test-queue' }];
      const result = mapper.createMapping(queues);

      expect(result).toEqual({
        MyCustomQueue: 'MYCUSTOM_QUEUE_URL',
      });
    });
  });

  describe('getEnvironmentKey', () => {
    it('should return environment variable name for valid queue key', () => {
      const mapping = { AsanaQueue: 'ASANA_QUEUE_URL' };
      const result = mapper.getEnvironmentKey('AsanaQueue', mapping);

      expect(result).toBe('ASANA_QUEUE_URL');
    });

    it('should throw error for missing queue key', () => {
      const mapping = { AsanaQueue: 'ASANA_QUEUE_URL' };

      expect(() => {
        mapper.getEnvironmentKey('InvalidQueue', mapping);
      }).toThrow('No environment variable mapping found for queue "InvalidQueue"');
    });

    it('should throw error with helpful message pattern', () => {
      const mapping = {};

      expect(() => {
        mapper.getEnvironmentKey('TestQueue', mapping);
      }).toThrow('Expected pattern: {QueueName}Queue -> {QUEUENAME}_QUEUE_URL');
    });
  });
});
