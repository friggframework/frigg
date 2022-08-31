const { Api } = require('./api');
const config = require('./defaultConfig.json');

describe(`Should fully test the ${config.label} Api Class`, () => {
    let api;
    beforeAll(async () => {
        api = new Api({});
    });

    afterAll(async () => {});

    it('should return authUrl requirements', async () => {
        const url = await api.getAuthUri();
        expect(url).exists;
        console.log(url);
    });
});
