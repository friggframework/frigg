const chai = require('chai');

const should = chai.should();
const Authenticator = require('../../../../test/utils/Authenticator');
const HugggAPI = require('../Api');

const TestUtils = require('../../../../test/utils/TestUtils');

describe('Huggg API class', async () => {
    const api = new HugggAPI({
        client_id: process.env.HUGGG_CLIENT_ID,
        client_secret: process.env.HUGGG_CLIENT_SECRET,
        username: process.env.HUGGG_TEST_USERNAME,
        password: process.env.HUGGG_TEST_PASSWORD,
        isSandbox: true,
    });

    before(async () => {
        await api.getTokenFromClientCredentials();
        await api.getTokenFromUsernamePassword();
    });

    describe('Get User Info', async () => {
        it('should get user info', async () => {
            const response = await api.getUser();
            response.user.should.have.property('id');
            response.user.should.have.property('name');
            return response;
        });
    });

    describe('Get Wallet', async () => {
        it('should get a wallet', async () => {
            const user = await api.getUser();
            const teamId = user.user.team_id;
            const response = await api.getWallets(teamId);
            response.data[0].should.have.property('id');
            response.data[0].should.have.property('name');
            return response;
        });
    });

    describe('Get Product Info', async () => {
        it('should list all products', async () => {
            const response = await api.listProducts();
            response.data.should.exist;
            response.data.length.should.be.greaterThan(0);
            return response;
        });
    });

    describe('Get Huggg Details', async () => {
        it('should get Huggg Details', async () => {
            const transaction = await api.getTransactions();
            const { id } = transaction.data[0];
            const huggg = await api.getHugggsfromTransaction(id);
            const hugggId = huggg.data[0].id;
            const response = await api.getHugggDetails(hugggId);
            response.data.should.exist;
            return response;
        });

        it('should get transactions', async () => {
            const response = await api.getTransactions();
            response.data.length.should.be.greaterThan(0);
            return response;
        });

        it('should get hugggs from Transaction', async () => {
            const transaction = await api.getTransactions();
            const { id } = transaction.data[0];
            const response = await api.getHugggsfromTransaction(id);
            response.data.should.exist;
            response.data.length.should.be.greaterThan(0);
            return response;
        });

        it('should create a transaction', async () => {
            const user = await api.getUser();
            const teamId = user.user.team_id;
            const wallet = await api.getWallets(teamId);
            const reference = wallet.data[0].id;
            const product = await api.listProducts();
            const product_id = product.data[2].id;
            const transaction = {
                payment: {
                    method: 'walletCommitment',
                    reference,
                },
                purchase: {
                    type: 'huggg',
                    reference: product_id,
                    message: 'Left Hook Core Test',
                    quantity: 1,
                },
            };
            const response = await api.createTransaction(transaction);
            response.data.should.exist;
            response.data.should.have.property('id');
            return response;
        });

        it('should list all purchased hugggs', async () => {
            const response = await api.getPurchasedHugggs();
            response.data.length.should.be.greaterThan(0);
            return response;
        });

        it('should list all redeemed hugggs', async () => {
            const query = 'redeemed';
            const response = await api.search(query);
            response.data.should.exist;
            return response;
        });

        it('should list all the sent hugggs', async () => {
            const query = 'sent';
            const response = await api.search(query);
            response.data.should.exist;
        });

        it('should list all the expired hugggs', async () => {
            const query = 'expired';
            const response = await api.search(query);
            response.data.should.exist;
        });
    });

    describe('Bad Auth', async () => {
        it('should refresh bad auth token', async () => {
            api.access_token = 'nolongervalid';
            await api.listProducts();
        });

        it('should throw error with invalid refresh token', async () => {
            try {
                api.access_token = 'nolongervalid';
                api.refresh_token = 'nolongervalid';
                await api.listProducts();
                throw new Error('did not fail');
            } catch (e) {
                e.message.should.equal(
                    'HugggAPI -- Error: Error Refreshing Credentials'
                );
            }
        });
    });
});
