const chai = require('chai');
const should = chai.should();
const Authenticator = require('../../../../test/utils/Authenticator');
const NetXAPI = require('../api');

const TestUtils = require('../../../../test/utils/TestUtils');
const { expect } = require('chai');

const randomString = require('randomstring');

const path = require('path');

describe.only('NetX API class', () => {
    const api = new NetXAPI({
        client_id: process.env.NETX_CLIENT_ID,
    });
    beforeAll(async () => {
        const url = api.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await api.getTokenFromCode(response.data.code);
    });

    describe.skip('Assets', () => {
        it('should get assets in a folder', async () => {
            const folderId = 2;
            const response = await api.getAssetsByFolder(folderId);
            response.result.results[0].should.have.property('id');
            return response.result.results;
        });

        it('should get assets by query', async () => {
            const query = [
                {
                    operator: 'and',
                    exact: {
                        attribute: 'Jonathan Test',
                        value: 'a test asset',
                    },
                },
            ];
            const response = await api.getAssetsByQuery(query);
            response.result.results[0].should.have.property('id');
            return response.result.results;
        });

        it('should be able to find an asset', async () => {
            const assetId = 1;
            const response = await api.getAssets(assetId);
            response.result[0].should.have.property('id');
            return response.result;
        });

        it('should import an asset', async () => {
            const folderId = 2;
            const absolutePath = path.resolve(__dirname, './logotest.png');
            const response = await api.importAsset(
                {
                    filePath: absolutePath,
                },
                folderId
            );

            response.should.have.property('id');
        });

        it('should update an existing asset', async () => {
            const assetId = 1;
            const name = randomString.generate();
            const fileName = `${randomString.generate()}.pdf`;
            const response = await api.updateAsset(assetId, name, fileName);
            response.result.should.have.property('id');
            return response.result;
        });
    });

    describe('Bad Auth', () => {
        it('should refresh bad auth token', async () => {
            api.access_token = 'nolongervalid';
            const response = await api.getAssets(2);
            response.result[0].should.have.property('id');
            return response.result;
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                api.access_token = 'nolongervalid';
                api.refresh_token = 'nolongervalid';
                await api.getAssets(2);
                throw new Error(
                    'NetXAPI -- Error: Error Refreshing Credentials'
                );
            } catch (e) {
                expect(e.message).to.eql(
                    'NetXAPI -- Error: Error Refreshing Credentials'
                );
            }
        });
    });
});
