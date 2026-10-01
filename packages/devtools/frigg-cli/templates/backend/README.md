# Frigg Backend

A [Frigg Framework](https://docs.friggframework.org) backend application, scaffolded with `frigg init`.

## Project structure

| File                | Purpose                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.js`          | Your **app definition** — exports `Definition`, which declares integrations, the database, encryption, users, and VPC settings. This is the file you edit. |
| `infrastructure.js` | Serverless entry point consumed by `frigg start` / `frigg build` / `frigg deploy`. Reads `Definition` from `index.js`; you normally never edit it.         |
| `.env.example`      | Local development settings. Copied to `.env` (git-ignored) by `frigg init`.                                                                                |

The `frigg` CLI is provided by the `@friggframework/devtools` dev dependency, so
the npm scripts below work without a global install.

## Getting started

```bash
# 1. Install dependencies (if not already installed by `frigg init`)
npm install

# 2. Start a local PostgreSQL (any reachable instance works; match DATABASE_URL in .env)
docker run --name frigg-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

# 3. Set up the database schema and generate the Prisma client
npm run db:setup

# 4. Run locally (serverless-offline; AWS resource discovery is skipped)
npm start
```

| Script             | Runs             | Purpose                                                      |
| ------------------ | ---------------- | ------------------------------------------------------------ |
| `npm start`        | `frigg start`    | Run the backend locally with serverless-offline              |
| `npm run build`    | `frigg build`    | Package the app without deploying (local mode, no AWS calls) |
| `npm run deploy`   | `frigg deploy`   | Deploy to AWS (`npm run deploy -- --stage prod`)             |
| `npm run db:setup` | `frigg db:setup` | Generate the Prisma client and apply the schema              |
| `npm test`         | `jest`           | Run your tests                                               |

## Adding integrations

Install an API module and scaffold an integration file:

```bash
npx frigg install hubspot
```

Then register the generated integration class in the `integrations` array in `index.js`.

## Configuration

The app definition in `index.js` is validated against the Frigg app-definition schema.

-   **Encryption** — `encryption.fieldLevelEncryptionMethod` is `kms` (default) or
    `aes`. Encryption is automatically bypassed in the `dev`/`test`/`local` stages.
-   **Database** — PostgreSQL that you bring (`management: 'external'`). Locally the
    connection string comes from `DATABASE_URL` in `.env`. To use MongoDB instead,
    set `database: { mongoDB: { enable: true }, postgres: { enable: false } }` and
    point `DATABASE_URL` at a MongoDB replica set (for example a MongoDB Atlas cluster).

## Deployment defaults: $0 while idle, secure by default

Local development never touches AWS: `frigg start` and `frigg build` skip AWS
discovery and every resource below.

The defaults in `index.js` deploy nothing that costs money while idle:

```js
const appDefinition = {
    // ...
    encryption: { fieldLevelEncryptionMethod: 'kms' },
    managementMode: 'managed', // Frigg owns what it creates
    vpcIsolation: 'isolated', // each stage gets its own KMS key
    vpc: { enable: false }, // no VPC, NAT gateway, VPC endpoints or Elastic IP
    database: { postgres: { enable: true, management: 'external' } }, // no RDS/Aurora
    environment: { DATABASE_URL: true },
    ssm: { enable: false },
};
```

### What a deploy creates, and what it costs

| Resource                                                                                        | Cost                                                                        |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Lambda functions, API Gateway (HTTP API), SQS queues, SNS topic, S3 bucket for migration status | Pay per request; $0 while idle (and largely inside the AWS free tier)       |
| CloudWatch logs and one 5xx alarm                                                               | Pay per GB ingested; alarms are free up to 10 per account                   |
| One customer-managed KMS key per stage                                                          | About $1/month, plus $0.03 per 10,000 requests beyond the free tier         |
| Your database                                                                                   | Whatever your provider charges; free tiers exist for PostgreSQL and MongoDB |

There is no NAT gateway (about $33/month), no interface VPC endpoints (about
$15/month each), no public IPv4 address and no Aurora cluster. The KMS key is
retained when you remove the stack (so encrypted data stays readable); schedule its
deletion in the KMS console if you no longer need it.

### Why no VPC is still secure

-   **Nothing to protect inside a VPC.** A VPC isolates resources that live in it,
    such as a database cluster. This setup has none: the database is hosted
    elsewhere, and the Lambdas only call AWS APIs and HTTPS endpoints.
-   **Every AWS call is authenticated and encrypted.** SQS, KMS, EventBridge
    Scheduler and the other AWS APIs are reached over AWS's public endpoints with
    TLS and IAM (SigV4) authentication. The Lambda role only gets the permissions
    the composed template grants. For least-privilege deploy credentials, generate
    a policy with `npx frigg generate-iam`.
-   **Data is encrypted at the field level.** Credentials, tokens and mappings are
    encrypted with the stage's KMS key before they reach the database, so the
    database provider only stores ciphertext for those fields. The key never leaves
    KMS, and every use is IAM-checked and logged in CloudTrail.
-   **The API requires authentication.** Integration and entity routes need an
    authenticated user. `/health/detailed` needs `HEALTH_API_KEY` and the admin
    routes need `ADMIN_API_KEY`; both refuse every request until you add the key to
    `environment` and set it at deploy. `POST /user/create` is open self-signup, and
    each user only sees their own data.

### Your database

Deployed Lambdas connect to the database named by `DATABASE_URL`. Use any hosted
PostgreSQL (several providers have a free tier):

-   **Require TLS.** Add `sslmode=require` to PostgreSQL URLs, for example
    `postgresql://user:password@host:5432/frigg?sslmode=require`. MongoDB Atlas
    always enforces TLS.
-   **Allow the Lambdas in.** Without a VPC and NAT gateway, Lambda egress IP
    addresses are not fixed, so an IP access list cannot pin them. Allow access from
    anywhere (`0.0.0.0/0`) and rely on TLS plus strong, unique database credentials,
    or use a provider that authenticates connections without IP allow-listing. If you
    need a fixed egress IP, see the VPC upgrade below.
-   **Apply the schema** before the first deploy, from your machine or CI:

    ```bash
    DATABASE_URL='postgresql://...?sslmode=require' npx frigg db:setup --stage prod
    ```

`DATABASE_URL` is read from your shell (or CI) when you run `frigg deploy`, falling
back to `.env`. A value in the shell wins, so pass the hosted URL explicitly rather
than deploying the local one:

```bash
DATABASE_URL='postgresql://...?sslmode=require' npm run deploy -- --stage prod
```

The value is stored in the Lambda environment (encrypted at rest by AWS). Anyone
with `lambda:GetFunctionConfiguration` on the functions can read it, so keep those
permissions tight.

Field-level encryption only runs outside the `dev`/`test`/`local` stages, so deploy
real data to a stage such as `prod` or `staging`.

### Upgrades (opt in)

-   **Frigg-managed Aurora Serverless v2 (coming).** Frigg will be able to create and
    manage an Aurora PostgreSQL cluster per stage that scales to zero when idle (see
    ADR-033). Until then, `database: { postgres: { enable: true } }` without
    `management: 'external'` creates an Aurora cluster that requires
    `vpc: { enable: true }` and bills while idle.
-   **Private VPC.** Set `vpc: { enable: true }` when your Lambdas must reach private
    resources (a database inside your VPC, internal services) or need a fixed egress
    IP for a partner's allow list. With `managementMode: 'managed'` and
    `vpcIsolation: 'isolated'`, each stage gets its own VPC, and a NAT gateway with
    an Elastic IP for outbound traffic: about $33/month per stage for the NAT
    gateway plus data processing, and about $15/month for each interface VPC
    endpoint you enable. Set `vpcIsolation: 'shared'` to reuse one VPC across stages.

See the app-definition reference at https://docs.friggframework.org for every option.

## Deploy

```bash
npm run build -- --production                                    # build with AWS resource discovery (needs AWS credentials)
DATABASE_URL='postgresql://...?sslmode=require' npm run deploy -- --stage prod   # deploy via osls
npx frigg doctor <stack-name>                                    # verify the deployed stack
```

## Learn more

-   Documentation: https://docs.friggframework.org
-   Issues & support: https://github.com/friggframework/frigg/issues
