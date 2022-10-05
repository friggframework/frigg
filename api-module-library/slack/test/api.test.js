const { Api } = require('../api');
const config = require('../defaultConfig.json');

describe(`Should fully test the ${config.label} API Class`, () => {
    let api;
    beforeAll(async () => {
        api = new Api();
    });

    afterAll(async () => {});

    it('should return auth requirements', async () => {
        const authUri = await api.getAuthUri();
        expect(authUri).exists;
        console.log(authUri);
    });
});
