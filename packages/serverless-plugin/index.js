const { spawn } = require("child_process");

class FriggServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = serverless.getProvider("aws");
    this.hooks = {
      initialize: () => this.init(),
      "after:package:package": () => this.afterPackage(),
      "before:deploy:deploy": () => this.beforeDeploy(),
    };
  }
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

      const endpointUrl = "localhost:4566"; // Assuming localstack is running on port 4
      const region = "us-east-1";

      // Configure AWS SDK
      AWS.config.update({
        region: region,
        endpoint: endpointUrl,
      });

      const sqs = new AWS.SQS();
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
  init() {}
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
  beforeDeploy() {
    console.log("Before deploy hook called");
  }
}

module.exports = FriggServerlessPlugin;
