# Frigg Backend

A [Frigg Framework](https://docs.friggframework.org) backend application, scaffolded with `frigg init`.

## Project structure

| File | Purpose |
| --- | --- |
| `index.js` | Your **app definition** — exports `Definition`, which declares integrations, the database, encryption, users, and VPC settings. This is the file you edit. |
| `infrastructure.js` | Serverless entry point consumed by `frigg build` / `frigg deploy`. Reads `Definition` from `index.js`; you normally never edit it. |

## Getting started

```bash
# 1. Install dependencies (if not already installed by `frigg init`)
npm install

# 2. Set up the database schema and generate the Prisma client
frigg db:setup

# 3. Run locally
frigg start
```

Add an integration (installs the API module and scaffolds an integration file):

```bash
frigg install hubspot
```

Then register the generated integration class in the `integrations` array in `index.js`.

## Configuration

The app definition in `index.js` is validated against the Frigg app-definition schema.
Common settings:

- **Database** — enable `postgres` or `mongoDB` under `database`. The connection
  string comes from the `DATABASE_URL` environment variable.
- **Encryption** — `encryption.fieldLevelEncryptionMethod` is `kms` (recommended
  for production) or `aes`. Encryption is automatically bypassed in the
  `dev`/`test`/`local` stages.
- **VPC** — set `vpc.enable` to `true` for production deployments in private subnets.

### Environment variables

Create a `.env` file for local development. Typical values:

```bash
STAGE=dev
AWS_REGION=us-east-1
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/frigg
# For AES encryption in any stage:
# AES_KEY_ID=local-dev-key
# AES_KEY=change-me-to-a-32-character-secret
```

## Deploy

```bash
frigg build --production     # build with AWS resource discovery
frigg deploy --stage prod    # deploy via osls
frigg doctor <stack-name>    # verify the deployed stack
```

## Learn more

- Documentation: https://docs.friggframework.org
- Issues & support: https://github.com/friggframework/frigg/issues
