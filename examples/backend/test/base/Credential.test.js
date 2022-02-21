const chai = require('chai');
const { Schema, Model } = require('../../src/base/models/Credential');

const { expect } = chai;

describe.skip('Credential', async () => {
    it('can be instantiated', async () => {
        new Model();
    });

    it('requires the user field', async function () {
        const credential = new Model();

        try {
            await credential.save();
            throw new Error('Did not catch expected error');
        } catch (error) {
            expect(error).to.have.property('message');
            expect(error.message).to.match(/Path `user` is required/i);
        }
    });
});
