# Frigg CLI Reference

Every command the `frigg` CLI ships today, with every flag. No roadmap, no wishful thinking: this page is generated from the commands registered in `packages/devtools/frigg-cli/index.js` on the `next` branch.

The `frigg` command comes from the `@friggframework/devtools` package. A `frigg init` app lists it as a dev dependency, so inside an app use `npx frigg <command>` or the npm scripts (`npm start`, `npm run build`, `npm run deploy`, `npm run db:setup`). Run `npx frigg <command> --help` for the same flags straight from the CLI.

{% hint style="info" %}
Looking for `frigg create`, `frigg add` or `frigg config`? Those are in the [CLI design specification](../CLI_SPECIFICATION.md), a roadmap that isn't shipped yet.
{% endhint %}

## Commands

| Command | What it does |
| --- | --- |
| [`frigg init [projectName]`](#frigg-init) | Initialize a new Frigg application |
| [`frigg install [apiModuleName]`](#frigg-install) | Install an API module |
| [`frigg start`](#frigg-start) | Run the backend locally (serverless-offline) |
| [`frigg validate`](#frigg-validate) | Validate the app definition (index.js) against the schema and the runtime rules |
| [`frigg build`](#frigg-build) | Build the serverless application |
| [`frigg deploy`](#frigg-deploy) | Deploy the serverless application |
| [`frigg generate-iam`](#frigg-generate-iam) | Generate IAM CloudFormation template based on app definition |
| [`frigg ui`](#frigg-ui) | Launch the Frigg Management UI |
| [`frigg db:setup`](#frigg-db-setup) | Set up database schema and generate Prisma client |
| [`frigg doctor [stackName]`](#frigg-doctor) | Run health check on deployed CloudFormation stack |
| [`frigg repair <stackName>`](#frigg-repair) | Repair infrastructure issues (import orphaned resources, reconcile property drift) |
| [`frigg ssm`](#frigg-ssm) | Manage SSM Parameter Store offloaded configuration |
| [`frigg ssm push`](#frigg-ssm-push) | Push SSM-offloaded environment values to Parameter Store |
| [`frigg auth`](#frigg-auth) | Test API module authentication |
| [`frigg auth test <module>`](#frigg-auth-test) | Test authentication for an API module |
| [`frigg auth list`](#frigg-auth-list) | List saved credentials |
| [`frigg auth get <module>`](#frigg-auth-get) | Get credentials for a module |
| [`frigg auth delete [module]`](#frigg-auth-delete) | Delete saved credentials |

## frigg init

```
frigg init [projectName] [options]
```

Scaffolds a backend app (PostgreSQL by default), copies `.env.example` to `.env`, and prints numbered next steps. `--mode` accepts `standalone` (default) or `embedded`. `--yes` takes every default, and is implied when stdin isn't a terminal. Walkthrough: [Initialize with frigg init](../tutorials/quick-start/frigg-init.md).

| Flag | Description | Default |
| --- | --- | --- |
| `-n, --name <name>` | project name (alternative to the positional argument) |  |
| `-m, --mode <mode>` | deployment mode: standalone or embedded |  |
| `-y, --yes` | accept the default for every prompt (implied when stdin is not a TTY) |  |
| `--no-install` | skip installing dependencies | on (pass the flag to turn it off) |
| `--no-git` | skip initializing a git repository | on (pass the flag to turn it off) |
| `-f, --force` | scaffold into a non-empty directory and overwrite README.md |  |
| `-v, --verbose` | enable verbose output |  |
| `-t, --template <template>` | legacy template (no longer supported) |  |

## frigg install

```
frigg install [apiModuleName]
```

Runs `npm install` for `@friggframework/api-module-<name>` (the `@next` release while your app is on a Frigg 2.x prerelease), writes `src/integrations/<Label>Integration.js`, and adds it to the `integrations` array in `index.js`. It then lists any environment variables the module needs. No flags. Walkthrough: the [Quick Start Tutorial](../tutorials/quick-start/README.md).

## frigg start

```
frigg start [options]
```

Validates the app definition (problems are reported but don't stop it), then runs `osls offline --config infrastructure.js --stage <stage>`. AWS discovery is skipped. The backend serves on `http://localhost:3001`. The `npm start` script in a `frigg init` app runs this. Walkthrough: [Start Your Frigg App](../tutorials/quick-start/start-your-frigg-app.md).

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --stage <stage>` | deployment stage | `dev` |
| `-v, --verbose` | enable verbose output |  |
| `--skip-validate` | skip app definition validation |  |

## frigg validate

```
frigg validate [options]
```

Checks `index.js` against the app-definition schema and runtime rules. With `--stage`, it also runs that stage's checks (encryption, deploy-time environment). Exits non-zero on errors. `build` and `deploy` run the same validation first and stop on errors unless you pass `--skip-validate`.

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --stage <stage>` | also run the checks for this stage (encryption, deploy-time environment) |  |
| `--json` | print the report as JSON |  |
| `-v, --verbose` | enable verbose output |  |

## frigg build

```
frigg build [options]
```

Validates the app definition, then runs `osls package --config infrastructure.js --stage <stage>` to package the app without deploying. Without `--production`, it stays local and makes no AWS discovery calls.

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --stage <stage>` | deployment stage | `dev` |
| `-v, --verbose` | enable verbose output |  |
| `-p, --production` | build for production (enables AWS discovery) |  |
| `--skip-validate` | skip app definition validation (not recommended) |  |

## frigg deploy

```
frigg deploy [options]
```

Validates the app definition and environment, then runs `osls deploy` for the stage. Unless you pass `--skip-doctor`, it finishes with a `frigg doctor` health check on the stack. `frigg deploy` reads variables such as `DATABASE_URL` from your shell or CI job, not from `.env`.

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --stage <stage>` | deployment stage | `dev` |
| `-v, --verbose` | enable verbose output |  |
| `-f, --force` | force deployment (bypasses caching for layers and functions) |  |
| `--skip-doctor` | skip post-deployment health check |  |
| `--skip-validate` | skip app definition validation (not recommended) |  |

## frigg generate-iam

```
frigg generate-iam [options]
```

Writes a CloudFormation template for a deployment IAM user, based on your app definition, to `<output>/<stack-name>.yaml`.

| Flag | Description | Default |
| --- | --- | --- |
| `-o, --output <path>` | output directory | `backend/infrastructure` |
| `-u, --user <name>` | deployment user name | `frigg-deployment-user` |
| `-s, --stack-name <name>` | CloudFormation stack name | `frigg-deployment-iam` |
| `-v, --verbose` | enable verbose output |  |

## frigg ui

```
frigg ui [options]
```

Starts the Frigg Management UI for the Frigg app in the current folder. Its server listens on `--port` (default 3210), which doesn't clash with `frigg start` on 3001. Unless `NODE_ENV=production`, it also starts a Vite dev server on `http://localhost:5173` and opens that address. Known issue: on 2.0 prereleases it can fail to start in a fresh app; see the [Quick Start Tutorial](../tutorials/quick-start/README.md).

| Flag | Description | Default |
| --- | --- | --- |
| `-p, --port <port>` | port to run the UI on | `3210` |
| `--no-open` | do not open browser automatically | on (pass the flag to turn it off) |

## frigg db:setup

```
frigg db:setup [options]
```

Generates the Prisma client, checks the `DATABASE_URL` connection, and applies the schema. PostgreSQL runs Prisma migrations: `migrate dev` for the `development`, `dev`, `local` and `test` stages, and `migrate deploy` for any other stage. MongoDB and DocumentDB run `prisma db push`.

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --stage <stage>` | deployment stage | `development` |
| `-v, --verbose` | enable verbose output |  |

## frigg doctor

```
frigg doctor [stackName] [options]
```

Runs a health check on a deployed CloudFormation stack. If you omit `stackName`, it asks you to pick one. Exit codes: `0` healthy, `1` unhealthy, `2` degraded.

| Flag | Description | Default |
| --- | --- | --- |
| `-r, --region <region>` | AWS region (defaults to AWS_REGION env var or us-east-1) |  |
| `-f, --format <format>` | output format (console or json) | `console` |
| `-o, --output <path>` | save report to file |  |
| `-v, --verbose` | enable verbose output |  |

## frigg repair

```
frigg repair <stackName> [options]
```

Fixes stack drift. `--import` imports orphaned resources into the stack, and `--reconcile` reconciles property drift; use both to fix everything. It asks for confirmation unless you pass `--yes`.

| Flag | Description | Default |
| --- | --- | --- |
| `-r, --region <region>` | AWS region (defaults to AWS_REGION env var or us-east-1) |  |
| `--import` | import orphaned resources into stack |  |
| `--reconcile` | reconcile property drift |  |
| `--mode <mode>` | reconciliation mode (template or resource) | `template` |
| `-y, --yes` | skip confirmation prompts |  |
| `-v, --verbose` | enable verbose output |  |

## frigg ssm

```
frigg ssm
```

Command group. On its own it does nothing; use `ssm push`.

## frigg ssm push

```
frigg ssm push [options]
```

Writes SSM-offloaded environment values (ADR-027) from your shell environment into Parameter Store. `frigg deploy` runs this automatically. Run it on its own to rotate values without deploying.

| Flag | Description | Default |
| --- | --- | --- |
| `-s, --stage <stage>` | deployment stage | `dev` |
| `-r, --region <region>` | AWS region (defaults to AWS_REGION env var or us-east-1) |  |
| `--allow-empty` | skip (instead of fail on) keys with missing or empty values |  |
| `--tier <tier>` | override tier for all keys: standard (4KB values) or advanced (8KB, billed) |  |

## frigg auth

```
frigg auth
```

Command group for trying out API module authentication locally. Saved credentials live in `.frigg-credentials.json`: the project folder's copy if one exists, otherwise the one in your home directory.

## frigg auth test

```
frigg auth test <module> [options]
```

Runs the module's authentication flow. For OAuth modules it starts a local callback server on `--port`; for API-key modules, pass `--api-key`.

| Flag | Description | Default |
| --- | --- | --- |
| `--api-key <key>` | API key for API-Key authentication |  |
| `--port <port>` | Callback server port | `3333` |
| `--timeout <seconds>` | OAuth callback timeout | `300` |
| `-v, --verbose` | Enable verbose output |  |

## frigg auth list

```
frigg auth list [options]
```

Lists saved credentials.

| Flag | Description | Default |
| --- | --- | --- |
| `--json` | Output as JSON |  |

## frigg auth get

```
frigg auth get <module> [options]
```

Prints the saved credentials for one module. `--export` prints them as environment variable assignments.

| Flag | Description | Default |
| --- | --- | --- |
| `--json` | Output as JSON |  |
| `--export` | Export as environment variables |  |

## frigg auth delete

```
frigg auth delete [module] [options]
```

Deletes saved credentials for one module, or all of them with `--all`.

| Flag | Description | Default |
| --- | --- | --- |
| `--all` | Delete all credentials |  |
| `-y, --yes` | Skip confirmation |  |
