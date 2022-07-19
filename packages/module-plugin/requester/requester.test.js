const { Requester } = require('./requester');
//var fetchMock = require('fetch-mock');
jest.mock('./requester'); // comments out  at Requester.addAuthHeaders [as _request] (requester/requester.js:45:38)
const fetch = require('node-fetch');
// import type { FetchMockStatic } from 'fetch-mock';

// We need this import to get the extra jest assertions

require('fetch-mock-jest');

// Mock 'node-fetch' with 'fetch-mock-jest'. Note that using
// require here is important, because jest automatically
// hoists `jest.mock()` calls to the top of the file (before
// imports), so if we were to refer to an imported module, we
// would get a `ReferenceError`

jest.mock('node-fetch', () => require('fetch-mock-jest').sandbox());

// Cast node-fetch as fetchMock so we can access the
// `.mock*()` methods

const fetchMock = fetch; //const fetchMock = (fetch as unknown) as FetchMockStatic;

describe('429 and 5xx testing', () => {
    let backOffArray = [1, 1, 1];
    let requester = new Requester({ backOff: backOffArray });
    let sum = backOffArray.reduce((a, b) => {
        return a + b;
    }, 0);

    test('poc', async () => {
        const url = 'https://southworkswillconquertheworld.com';

        fetchMock.get(url, { value: 1234 });
        let res = await requester._get({ url });

        expect(fetchMock).toHaveFetched(url, { value: 1234 });
        expect(res).toEqual({ value: 1234 });
    });

    it.skip("should retry with 'exponential' back off due to 429", async () => {
        let startTime = await Date.now();
        let res = await requester._get({
            url: 'https://70e18ff0-1967-4fb5-8f96-10477ab6bb9e.mock.pstmn.io//429',
        });
        let endTime = await Date.now();
        let difference = endTime - startTime;
        expect(difference).toBeGreaterThan(sum * 1000);
    });

    it.skip("should retry with 'exponential' back off due to 500", async () => {
        let startTime = await Date.now();
        let res = await requester._get({
            url: 'https://70e18ff0-1967-4fb5-8f96-10477ab6bb9e.mock.pstmn.io//5xx',
        });
        let endTime = await Date.now();
        let difference = endTime - startTime;
        expect(difference).toBeGreaterThan(sum * 1000);
    });
});
