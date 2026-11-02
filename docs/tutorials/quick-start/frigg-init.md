# Initialize With frigg init

Every good integration starts with an empty folder and a bit of optimism. Let's fill the folder.

## 1. Scaffold the app

`cd` to wherever you keep projects, then run:

```bash
npx @friggframework/devtools init my-app-integrations --yes
```

`frigg` is the command provided by the `@friggframework/devtools` package, so the line above is the same as `frigg init my-app-integrations --yes` if you already have it installed.

`--yes` accepts the default answer for every prompt (it's also implied when stdin isn't a terminal). Leave it off if you'd rather answer the questions yourself. The defaults are:

| Prompt | Default |
| --- | --- |
| How will you deploy this Frigg application? | Standalone |
| What are you building with Frigg? | Integrations for my own application |
| Do you need to create an API module for your own application? | No |
| Would you like to pick API modules to integrate with? | No |
| Which cloud provider will you use? | AWS Lambda |
| Install dependencies now? | Yes |
| Initialize Git repository? | Yes |

Other flags you might want: `--no-install` (skip `npm install`), `--no-git` (skip `git init`), `--force` (scaffold into a non-empty folder), and `--verbose`. Run `npx @friggframework/devtools init --help` for the full list.

{% hint style="info" %}
**Naming tip:** pick a name that says "this service powers my integrations", like `my-app-integrations`.
{% endhint %}

## 2. Read the next steps it prints

When it finishes, `frigg init` prints a numbered list. It looks like this:

```
📋 Next Steps:

1. Navigate to your project:
   cd my-app-integrations

2. Start PostgreSQL and check DATABASE_URL in .env:
   docker run --name frigg-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16

3. Set up the database:
   npm run db:setup

4. Start the development server:
   npm start
```

The list goes on with `npx frigg install <module>` and a deploy command. We'll get to the first one shortly. You can ignore the deploy line for now; it's for when you ship to AWS. If dependency installation failed or you passed `--no-install`, there's an extra `npm install` step.

## 3. What you got

```bash
cd my-app-integrations
```

| File | What it's for |
| --- | --- |
| `index.js` | Your **app definition**: integrations, database, encryption, environment. This is the file you edit. |
| `infrastructure.js` | Serverless entry point used by `frigg start`, `frigg build` and `frigg deploy`. You normally leave it alone. |
| `.env` | Local settings, copied from `.env.example`. It's git-ignored. |
| `package.json` | npm scripts: `start`, `build`, `deploy`, `db:setup` and `test` run `frigg start`, `frigg build`, `frigg deploy`, `frigg db:setup` and `jest`. |
| `README.md` | A cheat sheet for this app. |

The app definition already says "PostgreSQL that you bring":

```javascript
database: {
    postgres: {
        enable: true,
        management: 'external',
    },
},
```

and `.env` already points at a local database:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/frigg
```

Nothing to edit yet. On to [starting your app](start-your-frigg-app.md).
