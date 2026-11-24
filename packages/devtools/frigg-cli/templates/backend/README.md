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

| Script             | Runs                     | Purpose                                                                                                                                                                          |
| ------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm start`        | `frigg start`            | Run the backend locally with serverless-offline (reads `.env`)                                                                                                                   |
| `npm run build`    | `frigg build`            | Package the app without deploying (local mode, no AWS calls)                                                                                                                     |
| `npm run deploy`   | `frigg deploy`           | Deploy to AWS (`npm run deploy -- --stage prod`)                                                                                                                                 |
| `npm run db:setup` | `frigg db:setup`         | Generate the Prisma client and apply the schema. The default stage is `development`, which runs `prisma migrate dev` (interactive); any other stage runs `prisma migrate deploy` |
| `npm test`         | `jest --passWithNoTests` | Run your tests                                                                                                                                                                   |

`frigg start`, `frigg build` and `frigg deploy` default to `--stage dev`.

## Adding integrations

Install an API module and scaffold an integration for it:

```bash
npx frigg install hubspot
```

This runs `npm install` for `@friggframework/api-module-hubspot` (its `@next`
release while this app is on a Frigg 2.x prerelease), writes
`src/integrations/HubSpotIntegration.js`, and adds it to the `integrations` array in
`index.js`. If `index.js` no longer has a single `integrations: [...]` array, the
command leaves it alone and prints the two lines to add yourself. Without the CLI:
`npm install @friggframework/api-module-hubspot@next`, write an `IntegrationBase`
subclass under `src/integrations/` whose `Definition.modules` is
`{ hubspot: { definition: require('@friggframework/api-module-hubspot').Definition } }`,
and list it in `integrations`.

## Configuration

`frigg init` checks the generated `index.js` against the Frigg app-definition schema
and prints any problems as warnings. `frigg start`, `build` and `deploy` do not
validate it.

-   **Encryption** — the template sets `encryption.fieldLevelEncryptionMethod: 'kms'`
    explicitly. Keep it: the schema lists `aes` as the default, but nothing applies
    that default, and without the field `frigg deploy` creates no KMS key. Use `aes`
    instead of `kms` only if you manage the key yourself; then add
    `AES_KEY_ID: true` and `AES_KEY: true` to `environment` and set both (a
    32-character key) in the shell that runs `frigg deploy`. See
    [Field-level encryption](#field-level-encryption) for when encryption runs.
-   **Database** — PostgreSQL that you bring (`management: 'external'`). Locally the
    connection string comes from `DATABASE_URL` in `.env`. To use MongoDB instead,
    set `database: { mongoDB: { enable: true }, postgres: { enable: false } }` and
    point `DATABASE_URL` at a MongoDB replica set (for example a MongoDB Atlas cluster).
-   **Users** — `user` enables username/password users. `POST /user/create` (open
    self-signup) and `POST /user/login` both return `{ "token": "..." }`; send it as
    `Authorization: Bearer <token>` to the integration and entity routes. Keep every
    field of the `user` block: core reads it as written, without schema defaults.
-   **Logs** — `logging.retentionInDays: 14` expires each Lambda log group after 14
    days. Without it, log groups keep everything forever.

## Deployment defaults: near $0 while idle

Local development never touches AWS: `frigg start` and `frigg build` skip AWS
discovery and every resource below.

The defaults in `index.js` deploy nothing that bills by the hour:

```js
const appDefinition = {
    // ...
    encryption: { fieldLevelEncryptionMethod: 'kms' },
    managementMode: 'managed', // Frigg owns what it creates
    vpcIsolation: 'isolated', // each stage gets its own KMS key
    vpc: { enable: false }, // no VPC, NAT gateway, VPC endpoints or Elastic IP
    database: { postgres: { enable: true, management: 'external' } }, // no RDS/Aurora
    environment: { DATABASE_URL: true },
    logging: { retentionInDays: 14 },
    ssm: { enable: false },
};
```

### What a deploy creates, and what it costs

A deploy of the scaffolded app (stack `<name>-<stage>`, e.g. `my-app-prod`) creates:

| Resource                                                                                                                                    | Cost                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 Lambda functions (`auth`, `user`, `health`, `dbMigrationWorker`, `dbMigrationRouter`), a Prisma Lambda layer, and an API Gateway HTTP API | Pay per request                                                                                                                                                           |
| 2 SQS queues (`InternalErrorQueue`, `DbMigrationQueue`) and 1 SNS topic                                                                     | Pay per request. The migration worker's SQS trigger polls `DbMigrationQueue` even while idle, and those polls are billed as SQS requests, so idle cost is near $0, not $0 |
| 2 S3 buckets: the migration-status bucket and the osls deployment bucket                                                                    | Storage and requests                                                                                                                                                      |
| CloudWatch log groups (14-day retention) and one 5xx alarm on the HTTP API                                                                  | Per GB ingested and stored; alarm pricing per CloudWatch                                                                                                                  |
| One customer-managed KMS key per stage, with automatic (yearly) rotation                                                                    | $1/month, plus $1/month for each of the first two rotations, so about $3/month from the second rotation on; plus per-request charges beyond the KMS free tier             |
| Your database                                                                                                                               | Whatever your provider charges; free tiers exist for PostgreSQL and MongoDB                                                                                               |

There is no NAT gateway, no VPC endpoint, no public IPv4 address and no Aurora
cluster. EventBridge Scheduler resources are only added when you enable
`scheduler.enable` or add an integration with webhooks.

### What stays after the stack is deleted

Two resources have `DeletionPolicy: Retain` and survive stack removal:

-   **The KMS key.** It keeps billing until you schedule its deletion in the KMS
    console. Retaining it does not make old data readable by a new stack: no KMS
    alias is created, and a new stack for the same stage creates a new key, whose
    ARN is the only one its Lambdas may use. Fields encrypted with the old key stay
    unreadable to the new stack unless you point it at the old key yourself.
-   **The migration-status bucket.** Empty and delete it when you no longer need it.

### Security model

-   **Nothing to protect inside a VPC.** A VPC isolates resources that live in it,
    such as a database cluster. This setup has none: the database is hosted
    elsewhere, and the Lambdas call AWS APIs and your database.
-   **AWS calls are authenticated and encrypted.** SQS, KMS and the other AWS APIs
    are reached over AWS's public endpoints with TLS and IAM (SigV4) authentication.
-   **The database connection is not HTTPS.** Prisma opens a direct TCP connection to
    `DATABASE_URL` using the PostgreSQL wire protocol. It is encrypted only when the
    URL has `sslmode=require`, so always add it (see below).
-   **Field-level encryption.** See the next section.
-   **API authentication.**
    -   Integration and entity routes need `Authorization: Bearer <token>` (from
        `POST /user/create` or `POST /user/login`).
    -   `GET /health` is open. `/health/live`, `/health/ready` and `/health/detailed`
        need the `x-frigg-health-api-key` header to match `HEALTH_API_KEY`.
    -   The template deploys the `/admin/db-migrate` routes, which need the
        `x-frigg-admin-api-key` header to match `ADMIN_API_KEY`.
    -   Both keys refuse every request until you add them to `environment` and set
        them at deploy. Script and report admin routes are only deployed when you
        configure `adminScripts` or `reports`.
-   **Deploy credentials.** `npx frigg generate-iam` writes a CloudFormation template
    (by default `backend/infrastructure/frigg-deployment-iam.yaml`; change it with
    `--output`) that creates an IAM user, its access key and managed policies for
    deploying. Its grants are scoped to resources whose names contain `frigg` or this
    app's `name`. It has not been validated against every resource the composed
    template creates, so review it before relying on it.

### Field-level encryption

These fields are encrypted before they reach the database
(`@friggframework/core/database/encryption/encryption-schema-registry.js`):

-   `Credential.data`: `access_token`, `refresh_token`, `id_token`, `api_key`,
    `apiKey`, `API_KEY_VALUE`, `password`, `client_secret`
-   `IntegrationMapping.mapping`
-   `User.hashword`
-   `Token.token`

Entity data and integration config are **not** encrypted.

With `kms`, encryption is envelope encryption: each value gets a data key from
KMS (`GenerateDataKey`) and is encrypted with it in the Lambda; the encrypted data
key is stored next to the value and decrypted through KMS (`Decrypt`) on read. The
KMS key never leaves KMS, but plaintext data keys exist in Lambda memory while a
value is encrypted or decrypted.

When encryption runs:

-   **Deployed stages always encrypt**, whatever the stage name, including
    `frigg deploy --stage dev`.
-   **A deployed stage without a key fails at startup** with an error, rather than
    writing plaintext. A key is `KMS_KEY_ARN` (set by `frigg deploy` for the KMS key
    it creates) or `AES_KEY_ID` and `AES_KEY`.
-   **Encryption is skipped only when running locally** (`frigg start`,
    serverless-offline) and in tests.

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
    need a fixed egress IP, see the VPC option below.
-   **Apply the schema** before the first deploy, from your machine or CI. A
    non-development stage runs `prisma migrate deploy`:

    ```bash
    DATABASE_URL='postgresql://...?sslmode=require' npx frigg db:setup --stage prod
    ```

#### How `DATABASE_URL` reaches the deployed Lambdas

`frigg deploy` does **not** read `.env`. Each variable listed as `true` in
`environment` (here `DATABASE_URL`) is written into the template as
`${env:DATABASE_URL, ''}`, and osls resolves it from the environment of the shell
(or CI job) that runs `frigg deploy`. So export it, or pass it on the command line:

```bash
DATABASE_URL='postgresql://...?sslmode=require' npm run deploy -- --stage prod
```

If it is not set, the deploy only prints a warning and continues, and the Lambdas
get an empty `DATABASE_URL`. The value is stored in the Lambda environment
(encrypted at rest by AWS); anyone with `lambda:GetFunctionConfiguration` on the
functions can read it, so keep those permissions tight.

### Other options

-   **Frigg-managed Aurora.** `database: { postgres: { enable: true } }` without
    `management: 'external'` creates an Aurora Serverless v2 PostgreSQL cluster. It
    needs `vpc: { enable: true }` (with `vpc.enable: false` the composition fails
    with "Aurora requires 2 private subnets in different AZs"), and it bills while
    idle: the minimum capacity is 0.5 ACU.
-   **Private VPC.** Set `vpc: { enable: true }` when your Lambdas must reach private
    resources (a database inside your VPC, internal services) or need a fixed egress
    IP for a partner's allow list. With `managementMode: 'managed'` and
    `vpcIsolation: 'isolated'`, each stage gets its own VPC and a NAT gateway with an
    Elastic IP for outbound traffic. VPC endpoints are on by default: KMS, Secrets
    Manager and SQS interface endpoints plus an S3 gateway endpoint; turn them off
    with `vpc: { enable: true, enableVPCEndpoints: false }`. The NAT gateway and its
    Elastic IP have `DeletionPolicy: Retain`, so they keep billing after the stack is
    removed until you delete them. `vpcIsolation: 'shared'` reuses an existing VPC
    instead of creating one per stage.

See the app-definition reference at https://docs.friggframework.org for every option.

## Deploy

```bash
npm run build -- --production    # build with AWS resource discovery (needs AWS credentials)
DATABASE_URL='postgresql://...?sslmode=require' npm run deploy -- --stage prod
```

Always pass `--stage`; the default is `dev`. The stack is named
`<Definition.name>-<stage>` (e.g. `my-app-prod`). `frigg deploy` runs `frigg doctor`
on the stack after a successful deploy (skip it with `--skip-doctor`). To run it
again later:

```bash
npx frigg doctor my-app-prod --region us-east-1
```

`frigg deploy` and `frigg doctor` use `AWS_REGION`, or `us-east-1` when it is unset.

## Learn more

-   Documentation: https://docs.friggframework.org
-   Issues & support: https://github.com/friggframework/frigg/issues
