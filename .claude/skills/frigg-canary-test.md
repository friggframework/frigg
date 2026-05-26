# Frigg Canary Test Skill

Test Frigg canary versions against a minimal test harness with **real PostgreSQL database**.

## Usage

```
/frigg-canary-test [canary-version]
```

## What it does

1. Ensures PostgreSQL is running (`sudo service postgresql start`)
2. Updates `/home/user/frigg-canary-test/package.json` with the specified canary version
3. Runs `npm install` to fetch the canary package
4. Runs Prisma migrations to set up the schema
5. Runs `npm test` to execute the test suite against real database
6. Reports results with data shapes

## Test Coverage

### FRI-498: FindIntegrationContextByExternalEntityIdUseCase

Creates real database records:
- User (type=INDIVIDUAL)
- Two Credentials (with api_key data)
- One Entity with externalId (shared between integrations)
- Integration A (config.type='test-api-a')
- Integration B (config.type='test-api-b') with the **same entity**

Tests that:
- `type: 'test-api-a'` returns Integration A ✅
- `type: 'test-api-b'` returns Integration B ✅
- Unknown type throws `INTEGRATION_NOT_FOUND` ✅
- Missing `type` throws `TYPE_REQUIRED` ✅
- Missing `externalId` throws `EXTERNAL_ID_REQUIRED` ✅

## Manual Execution

```bash
# Start PostgreSQL
sudo service postgresql start

# Navigate to test harness
cd /home/user/frigg-canary-test

# Install dependencies
npm install

# Run migrations
npx prisma migrate deploy --schema=./node_modules/@friggframework/core/prisma-postgresql/schema.prisma

# Run tests
npm test
```

## Example

```
/frigg-canary-test 2.0.0--canary.593.a7bacab.0
```

## Adding New Tests

1. Add test cases to `/home/user/frigg-canary-test/test-find-integration-context.js`
2. Or create new test files and add them to package.json scripts
3. Tests should create real database records and clean up after
