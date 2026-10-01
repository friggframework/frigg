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

-   **Encryption** — `encryption.fieldLevelEncryptionMethod` is `kms` (recommended
    for production) or `aes`. Encryption is automatically bypassed in the
    `dev`/`test`/`local` stages.
-   **Database** — PostgreSQL is enabled by default. Locally the connection string
    comes from `DATABASE_URL` in `.env`. To use MongoDB instead, replace the
    `database` block with `mongoDB: { enable: true }` and point `DATABASE_URL` at a
    MongoDB replica set.

### Database and network for deployment

Local development never touches these settings: `frigg start` and `frigg build`
skip AWS discovery, so the VPC, KMS and Aurora resources are not composed.

The defaults are chosen so that a first `frigg deploy` works in an empty AWS account:

```js
const appDefinition = {
    // ...
    managementMode: 'managed', // Frigg owns the infrastructure for each stage
    vpcIsolation: 'isolated', // each stage gets its own VPC, KMS key and Aurora cluster
    database: { postgres: { enable: true } },
    vpc: { enable: true },
};
```

On the first deploy of a stage this creates a VPC (with a NAT gateway), a KMS key
and an Aurora Serverless v2 PostgreSQL cluster in that stage's stack; later
deploys reuse them. These resources incur AWS charges even when idle.

To reuse infrastructure that already exists instead:

-   **Share resources across stages** — set `vpcIsolation: 'shared'`. Frigg
    discovers an existing VPC, KMS key and Aurora cluster in the account and only
    creates what it cannot find.
-   **Point at a specific VPC / database** — remove `managementMode` and configure
    each resource explicitly, for example
    `vpc: { enable: true, management: 'use-existing', vpcId: 'vpc-...' }` and
    `database: { postgres: { enable: true, management: 'use-existing', endpoint: '...' } }`.

See the app-definition reference at https://docs.friggframework.org for every option.

## Deploy

```bash
npm run build -- --production        # build with AWS resource discovery (needs AWS credentials)
npm run deploy -- --stage prod       # deploy via osls
npx frigg doctor <stack-name>        # verify the deployed stack
```

## Learn more

-   Documentation: https://docs.friggframework.org
-   Issues & support: https://github.com/friggframework/frigg/issues
