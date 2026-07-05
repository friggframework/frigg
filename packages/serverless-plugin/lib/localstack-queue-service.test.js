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

    it('should pass Attributes when provided', async () => {
      mockSQS.createQueue.mockImplementation((params, callback) => {
        callback(null, { QueueUrl: 'url' });
      });

      await service.createQueue('test-queue', {
        VisibilityTimeout: '1800',
        MessageRetentionPeriod: '345600',
      });

      expect(mockSQS.createQueue).toHaveBeenCalledWith(
        {
          QueueName: 'test-queue',
          Attributes: {
            VisibilityTimeout: '1800',
            MessageRetentionPeriod: '345600',
          },
        },
        expect.any(Function)
      );
    });

    it('should omit Attributes when empty', async () => {
      mockSQS.createQueue.mockImplementation((params, callback) => {
        callback(null, { QueueUrl: 'url' });
      });

      await service.createQueue('test-queue', {});

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

  describe('_propertiesToAttributes', () => {
    it('maps CloudFormation Properties onto SQS Attributes and stringifies', () => {
      const attrs = service._propertiesToAttributes({
        VisibilityTimeout: 1800,
        MessageRetentionPeriod: 345600,
        RedrivePolicy: {
          maxReceiveCount: 3,
          deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
        },
        QueueName: 'should-be-dropped',
        Tags: [{ Key: 'ignored', Value: 'yes' }],
      });

      expect(attrs).toEqual({
        VisibilityTimeout: '1800',
        MessageRetentionPeriod: '345600',
        RedrivePolicy: JSON.stringify({
          maxReceiveCount: 3,
          deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
        }),
      });
    });

    it('skips undefined and null values', () => {
      const attrs = service._propertiesToAttributes({
        VisibilityTimeout: 60,
        MessageRetentionPeriod: undefined,
        KmsMasterKeyId: null,
      });
      expect(attrs).toEqual({ VisibilityTimeout: '60' });
    });

    it('returns an empty object when properties are missing', () => {
      expect(service._propertiesToAttributes()).toEqual({});
    });

    it('drops attributes containing unresolved CloudFormation intrinsics', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const attrs = service._propertiesToAttributes({
        VisibilityTimeout: 1800,
        RedrivePolicy: {
          maxReceiveCount: 3,
          deadLetterTargetArn: {
            'Fn::GetAtt': ['InternalErrorQueue', 'Arn'],
          },
        },
      });

      // VisibilityTimeout survives; RedrivePolicy is dropped because
      // deadLetterTargetArn is still an unresolved Fn::GetAtt intrinsic
      // (real AWS resolves it via CloudFormation; LocalStack cannot).
      expect(attrs).toEqual({ VisibilityTimeout: '1800' });
      expect(attrs).not.toHaveProperty('RedrivePolicy');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipping queue attribute "RedrivePolicy"')
      );
      warnSpy.mockRestore();
    });

    it('drops attributes with Ref intrinsics', () => {
      jest.spyOn(console, 'warn').mockImplementation();
      const attrs = service._propertiesToAttributes({
        VisibilityTimeout: 60,
        KmsMasterKeyId: { Ref: 'MyKmsKey' },
      });
      expect(attrs).toEqual({ VisibilityTimeout: '60' });
    });

    it('detects intrinsics nested deep inside objects and arrays', () => {
      expect(
        LocalStackQueueService._containsUnresolvedIntrinsic({
          a: { b: [{ c: { 'Fn::Sub': '${AWS::Region}' } }] },
        })
      ).toBe(true);
      expect(
        LocalStackQueueService._containsUnresolvedIntrinsic({
          a: { b: [{ c: 'hello' }] },
        })
      ).toBe(false);
      expect(LocalStackQueueService._containsUnresolvedIntrinsic(null)).toBe(false);
      expect(LocalStackQueueService._containsUnresolvedIntrinsic('str')).toBe(false);
    });

    it('retains resolved RedrivePolicy (ARN already a string)', () => {
      const attrs = service._propertiesToAttributes({
        RedrivePolicy: {
          maxReceiveCount: 3,
          deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
        },
      });
      expect(attrs.RedrivePolicy).toBe(
        JSON.stringify({
          maxReceiveCount: 3,
          deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
        })
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

    it('forwards CloudFormation Properties as SQS Attributes', async () => {
      const captured = [];
      mockSQS.createQueue.mockImplementation((params, callback) => {
        captured.push(params);
        callback(null, { QueueUrl: 'url' });
      });
      jest.spyOn(console, 'log').mockImplementation();

      await service.createQueues([
        {
          key: 'HubspotQueue',
          name: 'my-service--dev-HubspotQueue',
          properties: {
            QueueName: 'my-service--dev-HubspotQueue',
            VisibilityTimeout: 1800,
            MessageRetentionPeriod: 345600,
            RedrivePolicy: {
              maxReceiveCount: 3,
              deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
            },
          },
        },
      ]);

      expect(captured[0]).toEqual({
        QueueName: 'my-service--dev-HubspotQueue',
        Attributes: {
          VisibilityTimeout: '1800',
          MessageRetentionPeriod: '345600',
          RedrivePolicy: JSON.stringify({
            maxReceiveCount: 3,
            deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
          }),
        },
      });
    });

    it('creates queues with defaults when properties are missing (back-compat)', async () => {
      const captured = [];
      mockSQS.createQueue.mockImplementation((params, callback) => {
        captured.push(params);
        callback(null, { QueueUrl: 'url' });
      });
      jest.spyOn(console, 'log').mockImplementation();

      await service.createQueues([
        { key: 'LegacyQueue', name: 'legacy-queue' },
      ]);

      expect(captured[0]).toEqual({ QueueName: 'legacy-queue' });
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
