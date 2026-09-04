---
name: bootstrap-frigg-integration
description: "Creating a Frigg integration from scratch — the development-time runbook: set up the backend project, install or build the API modules it connects, write the IntegrationBase subclass and its Definition (modules, events, routes), choose a sync mechanism (webhooks, extensions, or scheduled jobs), run it locally, and deploy. Use when starting a new Frigg integration or a new Frigg backend project from zero. Note: the CLI scaffold (create-frigg-app / frigg init) is currently non-functional, so this covers the working manual path. For provisioning/running a deployed integration at runtime via the API, see the frigg-user-actions skill."
---

# Bootstrap a Frigg Integration

The end-to-end, development-time runbook for building a new integration. Each step hands off to a focused skill for depth.

Copy this checklist and track progress:

```
- [ ] 0. Set up the backend project
- [ ] 1. Get the API modules (install or build)
- [ ] 2. Write the integration class + Definition
- [ ] 3. Choose a sync mechanism
- [ ] 4. Run locally
- [ ] 5. Deploy
- [ ] 6. Provision & trigger at runtime
```

## 0. Set up the backend project

There is **no working one-command scaffold** — `npx create-frigg-app` is unpublished/archived and `frigg init` crashes (missing templates). Start manually:

- **Clone an example:** `git clone https://github.com/friggframework/example-frigg-applications`, copy an example, `npm install`. — or —
- **Hand-roll:** `npm init -y` → `npm install @friggframework/core` → create `index.js` exporting an app definition (`createFriggBackend`-style) → add `infrastructure.js`.

See the `frigg` skill (Project Setup + monorepo/quick reference) for the app-definition shape.

## 1. Get the API modules

An integration connects two or more systems, each via an API module.

- **Existing module:** `frigg install <name>` (run inside the backend; no arg → interactive npm picker). This installs the package and scaffolds an integration file.
- **No module yet:** build one — see the **frigg-api-modules** skill (module structure, `OAuth2Requester`/`ApiKeyRequester`, `requiredAuthMethods`, auth forms) and verify it with `frigg auth test`.

## 2. Write the integration class + Definition

Subclass `IntegrationBase` and declare modules, events, and routes:

```javascript
const { IntegrationBase } = require("@friggframework/core");

class MyIntegration extends IntegrationBase {
  static Definition = {
    name: "my-integration",
    version: "1.0.0",
    display: { label: "My Integration", description: "Syncs data", category: "CRM" },
    modules: {
      crm:    require("@friggframework/api-module-hubspot"),
      target: require("@friggframework/api-module-salesforce"),
    },
    routes: [{ path: "/sync", method: "POST", event: "SYNC_CONTACTS" }],
  };

  constructor() {
    super();
    this.events = { SYNC_CONTACTS: { handler: this.syncContacts } };
  }

  async syncContacts() {
    const contacts = await this.crm.api.getContacts();          // this.{module}.api.{method}()
    return await this.target.api.createContacts(contacts);
  }
}

module.exports = MyIntegration;
```

Register the integration in the app definition. Keep business logic in the integration/use-case layer — handlers stay thin (see the `frigg` skill's architecture + golden rule).

## 3. Choose a sync mechanism

| Need | Use | Skill |
| --- | --- | --- |
| Initial / on-demand sync | An action event (e.g. `INITIAL_SYNC`) triggered via the API | frigg-user-actions |
| Per-account inbound webhooks | `Definition.webhooks: true` (write your own receiver) | `frigg` / WEBHOOK-QUICKSTART |
| App-level webhooks fanned to many accounts, or reusable receiver bundles | `Definition.extensions` | **frigg-extensions** |
| Deferred / future-dated jobs, webhook renewals | `createSchedulerCommands` | **frigg-scheduled-jobs** |

## 4. Run locally

```bash
frigg db:setup     # Prisma generate + migrations
frigg start        # serverless-offline
```

For the fast framework-iteration loop, Docker services, and debugging, see **frigg-development-best-practices**.

## 5. Deploy

```bash
frigg build --production    # build with AWS discovery
frigg deploy --stage prod   # deploys via osls
```

Infrastructure (VPC, KMS, Aurora, scheduler, health) is generated automatically — see the `frigg` skill's `references/infrastructure.md`. After deploy, `frigg doctor <stack>` checks for drift.

## 6. Provision & trigger at runtime

A deployed integration is provisioned per app-user through the Management API: authorize modules → create entities → create the integration → trigger an action. The full curl sequence and auth (x-frigg headers vs JWT) are in **frigg-user-actions** and **frigg-management-api**.
