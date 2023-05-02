require('dotenv').config();
const chai = require('chai');
const should = chai.should();
const { Api } = require('../api');
const { expect } = require('chai');

describe('Google Drive API Tests', () => {
    const api = new Api({
        apiKey: process.env.GOOGLE_DRIVE_TEST_PI_KEY,
        username: process.env.GOOGLE_DRIVE_TEST_USERNAME,
    });
    it('should work', async () => {
        expect(1 + 1).toEqual(2);
    });
});
