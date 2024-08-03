# Deploying to AWS

Frigg is built using Infrastructure As Code, namely via the serverless.com framework. We have tried to stay close to basic as possible with deploy instructions and implementation.

To run a deploy, you can follow the serverless cli commands prompts or setup instructions, though we attempt to capture the basic commands below.

**NOTE-** Support for AWS comes out of the box. Contact Left Hook (or see updated documentation) for more details on how to deploy to stacks other than AWS

## VPC setup

Before you run your first deploy, there are a few things to confirm manually in your serverless.yml. If you'd like to deploy your lambdas behind a VPC out of the box, you'll want to fill in the corresponding security group ids and subnet ids in the custom > \[vpc] section of yaml.

Your lambdas must be allowed to make external API requests, and thus the subnets must be configured to allow access through a NAT Gateway or other similar service. This README cannot cover all of the permutations for AWS networking setups. We can assist on case base case basis, but strongly advise you to use a knowledgeable AWS resource if you choose to leverage VPCs in your setup.

## Secrets Manager for ENVs

Your Frigg Application has been configured to load envs from the secret found at the SECRET\_ARN variable. This is currently set to reference the output of the CloudFormation resource we've provided called "Frigg ENV Secret". We like this approach as it tightly couples a set of secrets/envs for each stage of deploy to the serverless.yml. However, to change this, one just needs to modify the value of SECRET\_ARN to whatever you choose.

Importantly, please review the comments of the serverless.yml around the Lambda Secrets Extension layer; this is a public Lambda Layer provided by AWS aimed at keeping AWS API requests low; you can read [more about it here](https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html#ps-integration-lambda-extensions-add).

## Testing the packaging and running your first deploy

To run your first deploy:

1. Make sure you have proper AWS credentials setup locally or in your CD pipeline. See most recent serverless docs to confirm the recommended level of permissions
2. If you'd like to dry run/confirm your app builds as expected, run the `serverless package` command with your desired `--stage` flag
3. Once you're confident your code runs well locally and the build succeeds, you can deploy with `serverless deploy` and corresponding `--stage` flag

This initial deploy may take a few minutes as the first CloudFormation template creates the requisite resources in correct order. Future deploys will be quicker thanks to both serverless and CloudFormation's approach to updates based on diffs.

## Getting help/logging issues

Any issues that arise during deploy should be considered and addressed. Please raise an issue/bug for your use case. The community of Frigg adopters (and serverless.com framework adopters more broadly) are very likely to have run into the same specific issue before.
