const FriggServerlessPlugin = require('./index');

jest.mock('./lib/queue-environment-mapper');
jest.mock('./lib/localstack-queue-service');
jest.mock('./lib/esbuild-directory-manager');
jest.mock('@aws-sdk/client-sqs', () => ({ SQS: jest.fn() }));

const { QueueEnvironmentMapper } = require('./lib/queue-environment-mapper');
const { LocalStackQueueService } = require('./lib/localstack-queue-service');
const { EsbuildDirectoryManager } = require('./lib/esbuild-directory-manager');
const { SQS } = require('@aws-sdk/client-sqs');

describe('FriggServerlessPlugin', () => {
  let plugin;
  let mockServerless;
  let mockOptions;

  beforeEach(() => {
    mockServerless = {
      config: { servicePath: '/test/path' },
      cli: { log: jest.fn() },
      service: {
        custom: {},
        provider: { environment: {} },
      },
      processedInput: { commands: [] },
      getProvider: jest.fn().mockReturnValue({}),
      extendConfiguration: jest.fn(),
    };

    mockOptions = { stage: 'test' };

    EsbuildDirectoryManager.mockImplementation(() => ({
      ensureDirectory: jest.fn().mockReturnValue('/test/path/.esbuild/.serverless'),
    }));

    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with serverless instance and options', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

      expect(plugin.serverless).toBe(mockServerless);
      expect(plugin.options).toBe(mockOptions);
      expect(plugin.hooks).toBeDefined();
    });

    it('should register required hooks', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

      expect(plugin.hooks).toHaveProperty('initialize');
      expect(plugin.hooks).toHaveProperty('before:package:initialize');
      expect(plugin.hooks).toHaveProperty('after:package:package');
      expect(plugin.hooks).toHaveProperty('before:deploy:deploy');
    });

    it('should create esbuild directory on construction', () => {
      const mockEnsureDir = jest.fn().mockReturnValue('/test/.esbuild/.serverless');
      EsbuildDirectoryManager.mockImplementation(() => ({
        ensureDirectory: mockEnsureDir,
      }));

      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

      expect(mockEnsureDir).toHaveBeenCalledWith('/test/path');
    });
  });

  describe('asyncInit', () => {
    it('should log initialization messages', async () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await plugin.asyncInit();

      expect(mockServerless.cli.log).toHaveBeenCalledWith('Initializing Frigg Serverless Plugin...');
      expect(consoleLogSpy).toHaveBeenCalledWith('Hello from Frigg Serverless Plugin!');

      consoleLogSpy.mockRestore();
    });

    it('should run in online mode when not offline', async () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.processedInput.commands = ['deploy'];

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await plugin.asyncInit();

      expect(consoleLogSpy).toHaveBeenCalledWith('Running in online mode, doing nothing');
      consoleLogSpy.mockRestore();
    });

    it('should setup offline queues when in offline mode', async () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.processedInput.commands = ['offline'];
      mockServerless.service.custom = { AsanaQueue: 'test-queue' };

      const mockMapper = {
        createMapping: jest.fn().mockReturnValue({ AsanaQueue: 'ASANA_QUEUE_URL' }),
        getEnvironmentKey: jest.fn().mockReturnValue('ASANA_QUEUE_URL'),
      };
      QueueEnvironmentMapper.mockImplementation(() => mockMapper);

      const mockQueueService = {
        createQueues: jest.fn().mockResolvedValue([
          { key: 'AsanaQueue', url: 'http://localhost:4566/queue' },
        ]),
      };
      LocalStackQueueService.mockImplementation(() => mockQueueService);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await plugin.asyncInit();

      expect(consoleLogSpy).toHaveBeenCalledWith('Running in offline mode. Making queues!');
      expect(mockQueueService.createQueues).toHaveBeenCalled();
      expect(mockServerless.extendConfiguration).toHaveBeenCalledWith(
        ['provider', 'environment', 'ASANA_QUEUE_URL'],
        'http://localhost:4566/queue'
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('setupOfflineQueues', () => {
    it('should orchestrate queue creation and environment configuration', async () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.service.custom = {
        AsanaQueue: 'test-asana-queue',
        SlackQueue: 'test-slack-queue',
      };

      const mockMapper = {
        createMapping: jest.fn().mockReturnValue({
          AsanaQueue: 'ASANA_QUEUE_URL',
          SlackQueue: 'SLACK_QUEUE_URL',
        }),
        getEnvironmentKey: jest.fn()
          .mockReturnValueOnce('ASANA_QUEUE_URL')
          .mockReturnValueOnce('SLACK_QUEUE_URL'),
      };
      QueueEnvironmentMapper.mockImplementation(() => mockMapper);

      const mockQueueService = {
        createQueues: jest.fn().mockResolvedValue([
          { key: 'AsanaQueue', url: 'http://localhost:4566/asana' },
          { key: 'SlackQueue', url: 'http://localhost:4566/slack' },
        ]),
      };
      LocalStackQueueService.mockImplementation(() => mockQueueService);

      await plugin.setupOfflineQueues();

      expect(mockMapper.createMapping).toHaveBeenCalled();
      expect(mockQueueService.createQueues).toHaveBeenCalled();
      expect(mockServerless.extendConfiguration).toHaveBeenCalledTimes(2);
    });

    it('points environment variables that Ref a created queue at its LocalStack url', async () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      const url = 'http://localhost:4566/admin-script';
      mockServerless.service.custom = { AdminScriptQueue: 'test-AdminScriptQueue' };
      mockServerless.service.provider.environment = {
        ADMIN_SCRIPT_QUEUE_URL: { Ref: 'AdminScriptQueue' },
        OTHER_QUEUE_URL: { Ref: 'OtherQueue' },
        STAGE: 'local',
      };
      mockServerless.service.functions = {
        adminScriptRouter: { environment: { ADMIN_SCRIPT_QUEUE_URL: { Ref: 'AdminScriptQueue' } } },
        auth: {},
      };
      QueueEnvironmentMapper.mockImplementation(() => ({
        createMapping: jest.fn().mockReturnValue({ AdminScriptQueue: 'ADMINSCRIPT_QUEUE_URL' }),
        getEnvironmentKey: jest.fn().mockReturnValue('ADMINSCRIPT_QUEUE_URL'),
      }));
      LocalStackQueueService.mockImplementation(() => ({
        createQueues: jest.fn().mockResolvedValue([{ key: 'AdminScriptQueue', url }]),
      }));

      await plugin.setupOfflineQueues();

      expect(mockServerless.extendConfiguration).toHaveBeenCalledWith(
        ['provider', 'environment', 'ADMIN_SCRIPT_QUEUE_URL'],
        url
      );
      expect(mockServerless.extendConfiguration).toHaveBeenCalledWith(
        ['functions', 'adminScriptRouter', 'environment', 'ADMIN_SCRIPT_QUEUE_URL'],
        url
      );
      expect(mockServerless.extendConfiguration).not.toHaveBeenCalledWith(
        ['provider', 'environment', 'OTHER_QUEUE_URL'],
        expect.anything()
      );
    });
  });

  describe('createLocalStackSQSClient', () => {
    const ENV_KEYS = [
      'AWS_REGION',
      'AWS_ENDPOINT',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ];
    let savedEnv;

    beforeEach(() => {
      savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
      ENV_KEYS.forEach((k) => delete process.env[k]);
    });

    afterEach(() => {
      ENV_KEYS.forEach((k) => {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      });
    });

    it('creates an AWS SDK v3 SQS client pointed at LocalStack by default', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

      const client = plugin.createLocalStackSQSClient();

      expect(SQS).toHaveBeenCalledWith({
        region: 'us-east-1',
        endpoint: 'http://localhost:4566',
        credentials: { accessKeyId: 'root', secretAccessKey: 'root' },
      });
      expect(client).toBeInstanceOf(SQS);
    });

    it('honours AWS_* overrides from the environment', () => {
      process.env.AWS_REGION = 'eu-west-1';
      process.env.AWS_ENDPOINT = 'http://localstack:4566';
      process.env.AWS_ACCESS_KEY_ID = 'key';
      process.env.AWS_SECRET_ACCESS_KEY = 'secret';
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

      plugin.createLocalStackSQSClient();

      expect(SQS).toHaveBeenCalledWith({
        region: 'eu-west-1',
        endpoint: 'http://localstack:4566',
        credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
      });
    });
  });

  describe('extractQueueDefinitions', () => {
    it('should extract queue definitions from custom config', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.service.custom = {
        AsanaQueue: 'test-asana-queue',
        someOtherConfig: 'something-else',
        SlackQueue: 'test-slack-queue',
      };

      const queues = plugin.extractQueueDefinitions();

      expect(queues).toEqual([
        { key: 'AsanaQueue', name: 'test-asana-queue' },
        { key: 'SlackQueue', name: 'test-slack-queue' },
      ]);
    });

    it('should return empty array when no queues defined', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.service.custom = { someConfig: 'value' };

      const queues = plugin.extractQueueDefinitions();

      expect(queues).toEqual([]);
    });

    it('should attach Properties from matching CloudFormation resources', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.service.custom = {
        HubspotQueue: 'svc--dev-HubspotQueue',
      };
      mockServerless.service.resources = {
        Resources: {
          HubspotQueue: {
            Type: 'AWS::SQS::Queue',
            Properties: {
              QueueName: 'svc--dev-HubspotQueue',
              VisibilityTimeout: 1800,
              MessageRetentionPeriod: 345600,
              RedrivePolicy: {
                maxReceiveCount: 3,
                deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
              },
            },
          },
        },
      };

      const queues = plugin.extractQueueDefinitions();

      expect(queues).toHaveLength(1);
      expect(queues[0]).toEqual({
        key: 'HubspotQueue',
        name: 'svc--dev-HubspotQueue',
        properties: {
          QueueName: 'svc--dev-HubspotQueue',
          VisibilityTimeout: 1800,
          MessageRetentionPeriod: 345600,
          RedrivePolicy: {
            maxReceiveCount: 3,
            deadLetterTargetArn: 'arn:aws:sqs:us-east-1:x:dlq',
          },
        },
      });
    });

    it('should omit properties when resources.Resources is absent', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.service.custom = { LegacyQueue: 'legacy-queue' };
      mockServerless.service.resources = undefined;

      const queues = plugin.extractQueueDefinitions();

      expect(queues).toEqual([{ key: 'LegacyQueue', name: 'legacy-queue' }]);
    });

    it('should ignore non-SQS CloudFormation resources with matching logical IDs', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      mockServerless.service.custom = { MisnamedQueue: 'misnamed-queue' };
      mockServerless.service.resources = {
        Resources: {
          MisnamedQueue: {
            Type: 'AWS::SNS::Topic',
            Properties: { TopicName: 'not-an-sqs-queue' },
          },
        },
      };

      const queues = plugin.extractQueueDefinitions();

      expect(queues).toEqual([
        { key: 'MisnamedQueue', name: 'misnamed-queue' },
      ]);
    });
  });

  describe('Hooks', () => {
    it('should execute init hook', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      plugin.init();

      expect(consoleLogSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });

    it('should execute beforePackageInitialize hook', async () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

      await plugin.beforePackageInitialize();

      expect(mockServerless.cli.log).toHaveBeenCalledWith('Frigg Serverless Plugin: Pre-package hook');
    });

    it('should execute afterPackage hook', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      plugin.afterPackage();

      expect(consoleLogSpy).toHaveBeenCalledWith('After package hook called');
      consoleLogSpy.mockRestore();
    });

    it('should execute beforeDeploy hook', () => {
      plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      plugin.beforeDeploy();

      expect(consoleLogSpy).toHaveBeenCalledWith('Before deploy hook called');
      consoleLogSpy.mockRestore();
    });
  });
});

describe('FriggServerlessPlugin.createLocalStackSQSClient (ADR-050)', () => {
  const FriggPlugin = jest.requireActual('./index');
  const ENV_KEYS = ['AWS_REGION', 'AWS_ENDPOINT', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  let savedEnv;

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    ENV_KEYS.forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const build = () =>
    new FriggPlugin(
      {
        config: { servicePath: '/test/path' },
        cli: { log: jest.fn() },
        service: { custom: {}, provider: { environment: {} } },
        processedInput: { commands: ['offline'] },
        getProvider: jest.fn().mockReturnValue({}),
        extendConfiguration: jest.fn(),
      },
      {}
    );

  it('builds a declared AWS SDK v3 SQS client, not SDK v2', async () => {
    const { SQS } = jest.requireActual('@aws-sdk/client-sqs');
    const client = build().createLocalStackSQSClient();

    expect(client).toBeInstanceOf(SQS);
    expect(typeof client.createQueue).toBe('function');
    expect(await client.config.region()).toBe('us-east-1');
    const endpoint = await client.config.endpoint();
    expect(`${endpoint.protocol}//${endpoint.hostname}:${endpoint.port}`).toBe(
      'http://localhost:4566'
    );
    const credentials = await client.config.credentials();
    expect(credentials).toMatchObject({ accessKeyId: 'root', secretAccessKey: 'root' });
  });

  it('honours AWS_REGION, AWS_ENDPOINT and the LocalStack credentials from the environment', async () => {
    process.env.AWS_REGION = 'eu-west-1';
    process.env.AWS_ENDPOINT = 'http://127.0.0.1:4567';
    process.env.AWS_ACCESS_KEY_ID = 'local';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';

    const client = build().createLocalStackSQSClient();

    expect(await client.config.region()).toBe('eu-west-1');
    const endpoint = await client.config.endpoint();
    expect(endpoint.hostname).toBe('127.0.0.1');
    expect(String(endpoint.port)).toBe('4567');
    expect(await client.config.credentials()).toMatchObject({
      accessKeyId: 'local',
      secretAccessKey: 'secret',
    });
  });

  it('does not require the undeclared SDK v2 package', () => {
    const source = require('fs').readFileSync(require.resolve('./index'), 'utf8');
    expect(source).not.toMatch(/require\(['"]aws-sdk['"]\)/);
  });
});
