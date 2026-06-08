# Development Workflow Reference

Practices for working on the Frigg framework and API modules.

## Table of Contents

- [Fast Iteration Pattern](#fast-iteration-pattern)
- [TDD](#tdd)
- [Canary Workflow](#canary-workflow)
- [Command System for Database Operations](#command-system-for-database-operations)
- [Event Handling (Delegate Pattern)](#event-handling-delegate-pattern)
- [Local Testing with Docker](#local-testing-with-docker)
- [Debugging Integration Issues](#debugging-integration-issues)
- [Quality Standards](#quality-standards)

## Fast Iteration Pattern

**Core / infrastructure / serverless-plugin changes (~2 min loop):**
1. Edit directly in `node_modules/@friggframework/{core|devtools|serverless-plugin}/`
2. Run `frigg build --production` and inspect compiled output (package sizes, CloudFormation templates)
3. Iterate until the build output is correct
4. Port working changes to the local `frigg/` repo → run affected tests (`npx jest path/to/file.test.js`) → commit/push → canary (~90s) → install canary → deploy and verify

**API module changes:**
1. Edit in `node_modules/@friggframework/api-module-{name}/`, run `frigg start`, run integration tests, iterate
2. Port to `api-module-library/{module}/`, run full suite, commit/push/canary, install canary, deploy

## TDD

Mandatory red → green → refactor for business logic (use cases), bug fixes (test reproduces the bug first), infrastructure changes affecting deployment, and any non-obvious behavior.

Test distribution for a feature:
- Use Cases: 20–40 tests (>90% coverage)
- Repositories: 5–10 tests (adapter logic, >80% coverage)
- Handlers: 2–4 tests (loading/wiring only)

## Canary Workflow

```bash
# Publishing: push to a feature branch -> GitHub Actions builds a canary (~90s)
# Version: 2.0.0--canary.{build}.{commit}.0
npm view @friggframework/core@canary version

# Installing
npm install @friggframework/core@canary
npm install @friggframework/devtools@canary
```

## Command System for Database Operations

Use Frigg commands rather than direct ORM access:

```javascript
const { createFriggCommands } = require("@friggframework/core");

const commands = createFriggCommands({ integrationClass: MyIntegration });

const user = await commands.findUserByAppUserId("external-user-123");
const credential = await commands.createCredential({
  userId: user.id,
  access_token: "token",
  moduleName: "asana",
});
```

For scheduling one-time jobs from integration code, see the scheduler command API in [infrastructure.md](infrastructure.md#scheduler).

## Event Handling (Delegate Pattern)

Current implementation uses a **Delegate** pattern (observer-like) for event propagation, not an EventBus (EventBus migration is planned).

```javascript
const { Delegate } = require("@friggframework/core");

class MyClass extends Delegate {
  constructor(params) {
    super(params);
    this.delegateTypes = ["TOKEN_REFRESHED", "AUTH_FAILED"];
  }
  async onTokenRefresh() {
    await this.notify("TOKEN_REFRESHED", { userId, tokenData });
  }
  async receiveNotification(notifier, delegateString, object) {
    if (delegateString === "TOKEN_REFRESHED") { /* handle */ }
  }
}
```

## Local Testing with Docker

```bash
npm run docker:start    # local MongoDB + LocalStack
npm run frigg:start
```

## Debugging Integration Issues

1. Check Docker services are running
2. Verify `.env` has required credentials
3. Check the integration is registered in the app definition
4. Review the handler implementation
5. Test the API module's `testAuthRequest` method

## Quality Standards

Before committing: tests written first (TDD); all tests passing locally; no linter errors; package sizes verified (infra changes); CloudWatch logs checked (handler changes); docs updated (public API changes). When changing the monorepo, search all packages (core, devtools, API modules, tests, docs) and run the full suite for both databases (MongoDB and PostgreSQL).
