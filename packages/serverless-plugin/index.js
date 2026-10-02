const { QueueEnvironmentMapper } = require('./lib/queue-environment-mapper');
const { LocalStackQueueService } = require('./lib/localstack-queue-service');
const { EsbuildDirectoryManager } = require('./lib/esbuild-directory-manager');

class FriggServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = serverless.getProvider('aws');

    const fs = require('fs');
    const path = require('path');
    const basePath = serverless.config.servicePath || process.cwd();

    const dirManager = new EsbuildDirectoryManager(fs, path);
    try {
      const esbuildDir = dirManager.ensureDirectory(basePath);
      console.log(`✓ Frigg plugin created ${esbuildDir}`);
    } catch (error) {
      console.error(`⚠️  Failed to create esbuild directory:`, error.message);
    }

    this.hooks = {
      initialize: () => this.init(),
      'before:package:initialize': () => this.beforePackageInitialize(),
      'after:package:package': () => this.afterPackage(),
      'before:deploy:deploy': () => this.beforeDeploy(),
    };
  }

  async asyncInit() {
    this.serverless.cli.log('Initializing Frigg Serverless Plugin...');
    console.log('Hello from Frigg Serverless Plugin!');

    const fs = require('fs');
    const path = require('path');
    const basePath = this.serverless.config.servicePath || process.cwd();

    const dirManager = new EsbuildDirectoryManager(fs, path);
    const esbuildDir = dirManager.ensureDirectory(basePath);

    if (this.serverless.processedInput.commands.includes('offline')) {
      console.log('Running in offline mode. Making queues!');
      await this.setupOfflineQueues();
    } else {
      console.log('Running in online mode, doing nothing');
    }
  }

  async setupOfflineQueues() {
    const queues = this.extractQueueDefinitions();
    console.log('Queues to be created:', queues);

    const sqsClient = this.createLocalStackSQSClient();
    const queueService = new LocalStackQueueService(sqsClient);
    const mapper = new QueueEnvironmentMapper();

    const environmentMap = mapper.createMapping(queues);
    const createdQueues = await queueService.createQueues(queues);

    createdQueues.forEach(({ key, url }) => {
      const envKey = mapper.getEnvironmentKey(key, environmentMap);
      this.serverless.extendConfiguration(['provider', 'environment', envKey], url);
      console.log(`Set ${envKey} to ${url}`);
    });
  }

  extractQueueDefinitions() {
    // Each custom.*Queue entry is the resolved QueueName. The matching
    // CloudFormation resource (under resources.Resources) has the same
    // logical ID and carries the Properties block we want to mirror onto
    // LocalStack (VisibilityTimeout, MessageRetentionPeriod,
    // RedrivePolicy, …). Deployed AWS applies those via CloudFormation;
    // locally they'd be silently dropped and LocalStack would fall back
    // to AWS defaults — notably a 30s VisibilityTimeout which
    // re-delivers in-flight messages while a long-running queue worker
    // is still processing them.
    const resources =
      this.serverless.service.resources &&
      this.serverless.service.resources.Resources
        ? this.serverless.service.resources.Resources
        : {};

    return Object.keys(this.serverless.service.custom)
      .filter((key) => key.endsWith('Queue'))
      .map((key) => {
        const resource = resources[key];
        const properties =
          resource &&
          resource.Type === 'AWS::SQS::Queue' &&
          resource.Properties
            ? resource.Properties
            : undefined;
        return {
          key,
          name: this.serverless.service.custom[key],
          ...(properties ? { properties } : {}),
        };
      });
  }

  createLocalStackSQSClient() {
    const AWS = require('aws-sdk');

    AWS.config.update({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'root',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'root',
      s3ForcePathStyle: true,
      sslEnabled: false,
    });

    return new AWS.SQS({ sslEnabled: false });
  }

  async beforePackageInitialize() {
    this.serverless.cli.log('Frigg Serverless Plugin: Pre-package hook');

    const fs = require('fs');
    const path = require('path');
    const basePath = this.serverless.config.servicePath || process.cwd();

    const dirManager = new EsbuildDirectoryManager(fs, path);
    dirManager.ensureDirectory(basePath);
  }

  init() {
    const fs = require('fs');
    const path = require('path');
    const basePath = this.serverless.config.servicePath || process.cwd();

    const dirManager = new EsbuildDirectoryManager(fs, path);
    const esbuildDir = dirManager.ensureDirectory(basePath);
    console.log(`Created ${esbuildDir} directory for serverless-esbuild`);
  }

  afterPackage() {
    console.log('After package hook called');
  }

  beforeDeploy() {
    console.log('Before deploy hook called');
  }
}

module.exports = FriggServerlessPlugin;
