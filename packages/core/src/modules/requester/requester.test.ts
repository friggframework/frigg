import { Requester } from './requester';

describe('429 and 5xx testing', () => {
    const backOffArray = [1, 1, 1];
    const requester = new Requester({ backOff: backOffArray });
    const sum = backOffArray.reduce((a, b) => {
        return a + b;
    }, 0);
    it.skip("should retry with 'exponential' back off due to 429", async () => {
        const startTime = await Date.now();
        const res = await requester._get({
            url: 'https://70e18ff0-1967-4fb5-8f96-10477ab6bb9e.mock.pstmn.io//429',
        });
        const endTime = await Date.now();
        const difference = endTime - startTime;
        expect(difference).toBeGreaterThan(sum * 1000);
    });

    it.skip("should retry with 'exponential' back off due to 500", async () => {
        const startTime = await Date.now();
        const res = await requester._get({
            url: 'https://70e18ff0-1967-4fb5-8f96-10477ab6bb9e.mock.pstmn.io//5xx',
        });
        const endTime = await Date.now();
        const difference = endTime - startTime;
        expect(difference).toBeGreaterThan(sum * 1000);
    });
});
