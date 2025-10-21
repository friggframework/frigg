const { spawn } = require("child_process");

/**
 * Frigg Serverless Plugin - Handles AWS discovery and local development setup
 */
class FriggServerlessPlugin {
  /**
   * Creates an instance of FriggServerlessPlugin
   * @param {Object} serverless - Serverless framework instance
   * @param {Object} options - Plugin options
   */
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = serverless.getProvider("aws");
    this.hooks = {
      initialize: () => this.init(),
      "before:package:initialize": () => this.beforePackageInitialize(),
      "after:package:package": () => this.afterPackage(),
      "before:deploy:deploy": () => this.beforeDeploy(),
    };
  }
  /**
   * Asynchronous initialization for offline mode
   * Creates SQS queues in localstack for local development
   * @returns {Promise<void>}
   */
  async asyncInit() {
    this.serverless.cli.log("Initializing Frigg Serverless Plugin...");
    console.log("Hello from Frigg Serverless Plugin!");
    if (this.serverless.processedInput.commands.includes("offline")) {
      console.log("Running in offline mode. Making queues!");
      const queues = Object.keys(this.serverless.service.custom)
        .filter((key) => key.endsWith("Queue"))
        .map((key) => {
          return {
            key,
            name: this.serverless.service.custom[key],
          };
        });
      console.log("Queues to be created:", queues);

      const AWS = require("aws-sdk");

      const endpointUrl = process.env.AWS_ENDPOINT || "http://localhost:4566"; // LocalStack SQS endpoint
      const region = process.env.AWS_REGION || "us-east-1";
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID || "root"; // LocalStack default
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "root"; // LocalStack default

      // Configure AWS SDK for LocalStack
      AWS.config.update({
        region: region,
        endpoint: endpointUrl,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        s3ForcePathStyle: true, // Required for LocalStack
        sslEnabled: false, // Disable SSL for LocalStack
      });

      const sqs = new AWS.SQS({
        sslEnabled: false, // Disable SSL validation for LocalStack
      });
      // Find the environment variables that we need to override and create an easy map
      const environmentMap = {};
      const environment = this.serverless.service.provider.environment;

      for (const [key, value] of Object.entries(environment)) {
        if (typeof value === "object" && value.Ref) {
          environmentMap[value.Ref] = key;
        }
      }

      const queueCreationPromises = queues.map((queue) => {
        return new Promise((resolve, reject) => {
          const params = {
            QueueName: queue.name,
          };

          sqs.createQueue(params, (err, data) => {
            if (err) {
              console.error(
                `Error creating queue ${queue.name}: ${err.message}`
              );
              reject(err);
            } else {
              const queueUrl = data.QueueUrl;
              console.log(
                `Queue ${queue.name} created successfully. URL: ${queueUrl}`
              );

              const environmentKey = environmentMap[queue.key];
              this.serverless.extendConfiguration(
                ["provider", "environment", environmentKey],
                queueUrl
              );
              console.log(`Set ${environmentKey} to ${queueUrl}`);
              resolve(queueUrl);
            }
          });
        });
      });

      await Promise.all(queueCreationPromises);
    } else {
      console.log("Running in online mode, doing nothing");
    }
  }

  /**
   * Hook that runs before serverless package initialization
   * AWS discovery is now handled in serverless-template.js
   * @returns {Promise<void>}
   */
  async beforePackageInitialize() {
    // AWS discovery is now handled directly in serverless-template.js
    // This hook remains for potential future use or other pre-package tasks
    this.serverless.cli.log("Frigg Serverless Plugin: Pre-package hook");

    // Ensure .esbuild/.serverless directory exists to prevent ENOENT errors
    // serverless-esbuild may try to access this directory during packaging
    const fs = require('fs');
    const path = require('path');
    const esbuildDir = path.join(this.serverless.config.servicePath || process.cwd(), '.esbuild', '.serverless');

    if (!fs.existsSync(esbuildDir)) {
      fs.mkdirSync(esbuildDir, { recursive: true });
    }
  }


  /**
   * Initialization hook - runs very early, before packaging
   * Create .esbuild/.serverless directory to prevent ENOENT errors
   */
  init() {
    // Ensure .esbuild/.serverless directory exists to prevent ENOENT errors
    // serverless-esbuild may try to access this directory during packaging
    const fs = require('fs');
    const path = require('path');
    const esbuildDir = path.join(this.serverless.config.servicePath || process.cwd(), '.esbuild', '.serverless');

    if (!fs.existsSync(esbuildDir)) {
      fs.mkdirSync(esbuildDir, { recursive: true });
      console.log(`Created ${esbuildDir} directory for serverless-esbuild`);
    }
  }
  /**
   * Hook that runs after serverless package
   */
  afterPackage() {
    console.log("After package hook called");
    // // const queues = Object.keys(infrastructure.custom)
    // //     .filter((key) => key.endsWith('Queue'))
    // //     .map((key) => infrastructure.custom[key]);
    // // console.log('Queues to be created:', queues);
    // //
    // // const endpointUrl = 'http://localhost:4566'; // Assuming localstack is running on port 4
    // // const region = 'us-east-1';
    // // const command = 'aws';
    // // queues.forEach((queue) => {
    // //     const args = [
    // //         '--endpoint-url',
    // //         endpointUrl,
    // //         'sqs',
    // //         'create-queue',
    // //         '--queue-name',
    // //         queue,
    // //         '--region',
    // //         region,
    // //         '--output',
    // //         'table',
    // //     ];
    // //
    // //     const childProcess = spawn(command, args, {
    // //         cwd: backendPath,
    // //         stdio: 'inherit',
    // //     });
    // //     childProcess.on('error', (error) => {
    // //         console.error(`Error executing command: ${error.message}`);
    // //     });
    // //
    // //     childProcess.on('close', (code) => {
    // //         if (code !== 0) {
    // //             console.log(`Child process exited with code ${code}`);
    // //         }
    // //     });
    // });
  }
  /**
   * Hook that runs before serverless deploy
   */
  beforeDeploy() {
    console.log("Before deploy hook called");
  }
}

module.exports = FriggServerlessPlugin;
