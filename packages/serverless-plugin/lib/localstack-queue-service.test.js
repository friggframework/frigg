const { LocalStackQueueService } = require('./localstack-queue-service');

describe('LocalStackQueueService', () => {
  let service;
  let mockSQS;

  beforeEach(() => {
    mockSQS = {
      createQueue: jest.fn(),
    };
    service = new LocalStackQueueService(mockSQS);
  });

  describe('createQueue', () => {
    it('should create queue and return URL on success', async () => {
      const queueUrl = 'http://localhost:4566/000000000000/test-queue';
      mockSQS.createQueue.mockImplementation((params, callback) => {
        callback(null, { QueueUrl: queueUrl });
      });

      const result = await service.createQueue('test-queue');

      expect(result).toBe(queueUrl);
      expect(mockSQS.createQueue).toHaveBeenCalledWith(
        { QueueName: 'test-queue' },
        expect.any(Function)
      );
    });

    it('should reject with error on failure', async () => {
      const error = new Error('SQS Error');
      mockSQS.createQueue.mockImplementation((params, callback) => {
        callback(error);
      });

      await expect(service.createQueue('test-queue')).rejects.toThrow(
        'Failed to create queue test-queue: SQS Error'
      );
    });
  });

  describe('createQueues', () => {
    it('should create multiple queues and return results', async () => {
      mockSQS.createQueue.mockImplementation((params, callback) => {
        const url = `http://localhost:4566/000000000000/${params.QueueName}`;
        callback(null, { QueueUrl: url });
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const queues = [
        { key: 'AsanaQueue', name: 'test-asana-queue' },
        { key: 'SlackQueue', name: 'test-slack-queue' },
      ];

      const results = await service.createQueues(queues);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        key: 'AsanaQueue',
        url: 'http://localhost:4566/000000000000/test-asana-queue',
      });
      expect(results[1]).toEqual({
        key: 'SlackQueue',
        url: 'http://localhost:4566/000000000000/test-slack-queue',
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);
      consoleLogSpy.mockRestore();
    });

    it('should handle empty queue array', async () => {
      const results = await service.createQueues([]);
      expect(results).toEqual([]);
    });

    it('should reject if any queue creation fails', async () => {
      mockSQS.createQueue.mockImplementation((params, callback) => {
        if (params.QueueName === 'failing-queue') {
          callback(new Error('Failed'));
        } else {
          callback(null, { QueueUrl: 'http://localhost:4566/queue' });
        }
      });

      const queues = [
        { key: 'SuccessQueue', name: 'success-queue' },
        { key: 'FailQueue', name: 'failing-queue' },
      ];

      await expect(service.createQueues(queues)).rejects.toThrow('Failed to create queue failing-queue');
    });
  });
});
