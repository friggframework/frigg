const mongoose = require('mongoose');
const Manager = require('./manager');
const config = require('./defaultConfig.json');

describe(`Should fully test the ${config.label} Manager`, () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGO_URI);
    });

    afterEach(async () => {
        await Manager.Credential.deleteMany();
        await Manager.Entity.deleteMany();
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    describe('#getName', () => {
        it('should return manager name', () => {
            expect(Manager.getName()).toEqual('frontify');
        });
    });
});
