const chai = require('chai');
const { createApp } = require('../app');

const { expect } = chai;

describe('server (app.js)', async () => {
    it('loads', async () => {
        const app = createApp();
        expect(app).to.be.ok;
    });
});
