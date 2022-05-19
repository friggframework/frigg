# Mocked Requests Set Up for Your API Module

## Add Tooling to the Test File

Example code:

```js
const Api = require('./Api');
const { mockApi } = require('../../../../test/utils/mockApi');

const MockedApi = mockApi(Api, {
    authenticationMode: 'browser',
});

describe('DemoNock API', async () => {
    before(async function () {
        await MockedApi.initialize({ test: this.test });
    });

    after(async function () {
        await MockedApi.clean({ test: this.test });
    });

    it('tests a nice thing', async () => {
        const api = await MockedApi.mock();
        const users = await api.getUsers();
        expect(users).to.have.length(2);
    });
});
```

Api - the LH API class that is being tested/mocked

mockApi - tool to record/playback requests and automate login to API

MockedApi - Api class with wrapper around it to record/playback requests and automate login to API. `authenticationMode` sets how to handle authentication when recording requests. Browser means it will require a manual step in the browser (uses Authenticator). Client credentials mode gets a token automcaitcally with machine-to-machine token. Manual means the developer will handle authentication manually, like setting an API key. By default mockApi will use the class name of the mocked API to name the output file. This can be overidden by passing in `displayName`.
test/recorded-requests - the directory where recorded API requests are saved

before - make sure to use the `async function` form here, so we can access mocha's `this` object. The call to `initialize` sets up the tooling for recording/playback

after - same here need to use the `async function` form and pass in `this.test` to `clean`. This stops recording/playback and removes all hooks and other tooling from Node's HTTP code.

test - instead of using `new Api` in your tests, use `await MockedApi.mock`. Any parameters you would normally pass into `new Api` will be passed through with the call to `mock`. The instance of the Api class that is returned will already be authenticated (unless using manual mode).

## Creating new API tests

When running your tests while creating them, use `npm --record-apis=demonock test`.

This tells the tooling to record the requests made while running the tests for the DemoNockApi class.

## Finalizing API tests

When satisified with your tests, run `npm test` without adding the `--record-apis` flag to make sure the recorded requests worked. The tests should pass without needing you to perform a login step in the browser.

## Tests that fail...

Sometimes a "finished" test that was previously working starts to fail. Or, a test passes when it should fail (false negative). There are a few reasons this might happen.

### Test fails after code updates

If you made updates to the code, this may cause a test to fail. In this case the developer doesn't need to update mocks. To make the test pass, the updated code should be fixed, or the test should be updated to reflect the new data shape.

One way to test for this scenario is running `npm test` in the main branch, seeing that all tests pass, and then confirming tests fail in your feature branch. This would show that the test is almost certainly failing due to a change in your branch.

### Test should fail but passes

If a test is passing, but in the "real world" the code is failing, the API response may have changed. Re-record mocks by running tests with `--record-apis=nockdemo`. Hopefully, one or more tests will now fail. These tests and related code should be updated to work with the new API response data shape.

When creating the PR for this update, flag that the mocks were re-recorded so the updated mocks will be sure to be reviewed by another team member as part of code review.

### Mocks in error state

If the recorded files get messed up when updating (sometimes unavoidable under certain error conditions) just `git restore test/recorded-requests` or delete the file(s) in that directory and re-record.

## Miscellaneous Notes

More than one API can be set to record mode at a time: `npm --record-apis=activecampaign,hubspot test`

You can use .only when --record-apis is passed, but only for the root level test suite. Otherwise an error will be thrown to prevent partial recording of the mocks. .skip is fine to use to skip tests that should not be recorded.

CAN UPDATE RECORDED REQUESTS:

```js
describe('Nock Demo API', () => {
    it('does x');
    it.skip('does y');
});
```

CANNOT UPDATE RECORDED REQUESTS:

```js
describe('Nock Demo API', () => {
    it('does x');
    it('does y');
});
```

## Caveats

-   Client credential mode may only work with Crossbeam currently
-   Puppet mode (browser automation) for login is not yet implemented
