# Frigg Canary Test Skill

Test Frigg canary versions against a minimal test harness.

## Usage

```
/frigg-canary-test [canary-version]
```

## What it does

1. Updates `/home/user/frigg-canary-test/package.json` with the specified canary version
2. Runs `npm install` to fetch the canary package
3. Runs `npm test` to execute the test suite
4. Reports results

## Test Coverage

The test harness currently covers:

### FRI-498: FindIntegrationContextByExternalEntityIdUseCase

Tests that when an entity belongs to multiple integrations of different types:
- Querying with `type: 'test-api-a'` returns Integration A
- Querying with `type: 'test-api-b'` returns Integration B
- Querying with unknown type throws `INTEGRATION_NOT_FOUND`
- Missing `type` parameter throws `TYPE_REQUIRED`
- Missing `externalId` parameter throws `EXTERNAL_ID_REQUIRED`

## Adding New Tests

To test additional fixes:

1. Add test cases to `/home/user/frigg-canary-test/test-find-integration-context.js`
2. Or create new test files and add them to package.json scripts

## Manual Execution

```bash
cd /home/user/frigg-canary-test
npm install
npm test
```

## Example

```
/frigg-canary-test 2.0.0--canary.593.a7bacab.0
```
