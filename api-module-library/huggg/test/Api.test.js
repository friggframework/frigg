/**
 * @group interactive
 */

const Authenticator = require('../../../../test/utils/Authenticator');
const HugggAPI = require('../api');

const TestUtils = require('../../../../test/utils/TestUtils');

describe('Huggg API class', () => {
    const api = new HugggAPI({
        client_id: process.env.HUGGG_CLIENT_ID,
        client_secret: process.env.HUGGG_CLIENT_SECRET,
        username: process.env.HUGGG_TEST_USERNAME,
        password: process.env.HUGGG_TEST_PASSWORD,
        isSandbox: true,
    });

    beforeAll(async () => {
        await api.getTokenFromClientCredentials();
        await api.getTokenFromUsernamePassword();
    });

    describe('Get User Info', () => {
        it('should get user info', async () => {
            const response = await api.getUser();
            expect(response.user).toHaveProperty('id');
            expect(response.user).toHaveProperty('name');
            return response;
        });
    });

    describe('Get Wallet', () => {
        it('should get a wallet', async () => {
            const user = await api.getUser();
            const teamId = user.user.team_id;
            const response = await api.getWallets(teamId);
            expect(response.data[0]).toHaveProperty('id');
            expect(response.data[0]).toHaveProperty('name');
            return response;
        });
    });

    describe('Get Product Info', () => {
        it('should list all products', async () => {
            const response = await api.listProducts();
            expect(response.data).toBeDefined();
            expect(response.data.length).toBeGreaterThan(0);
            return response;
        });
    });

    describe('Get Huggg Details', () => {
        it('should get Huggg Details', async () => {
            const transaction = await api.getTransactions();
            const { id } = transaction.data[0];
            const huggg = await api.getHugggsfromTransaction(id);
            const hugggId = huggg.data[0].id;
            const response = await api.getHugggDetails(hugggId);
            expect(response.data).toBeDefined();
            return response;
        });

        it('should get transactions', async () => {
            const response = await api.getTransactions();
            expect(response.data.length).toBeGreaterThan(0);
            return response;
        });

        it('should get hugggs from Transaction', async () => {
            const transaction = await api.getTransactions();
            const { id } = transaction.data[0];
            const response = await api.getHugggsfromTransaction(id);
            expect(response.data).toBeDefined();
            expect(response.data.length).toBeGreaterThan(0);
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
            expect(response.data).toBeDefined();
            expect(response.data).toHaveProperty('id');
            return response;
        });

        it('should list all purchased hugggs', async () => {
            const response = await api.getPurchasedHugggs();
            expect(response.data.length).toBeGreaterThan(0);
            return response;
        });

        it('should list all redeemed hugggs', async () => {
            const query = 'redeemed';
            const response = await api.search(query);
            expect(response.data).toBeDefined();
            return response;
        });

        it('should list all the sent hugggs', async () => {
            const query = 'sent';
            const response = await api.search(query);
            expect(response.data).toBeDefined();
        });

        it('should list all the expired hugggs', async () => {
            const query = 'expired';
            const response = await api.search(query);
            expect(response.data).toBeDefined();
        });
    });

    describe('Bad Auth', () => {
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
                expect(e.message).toBe(
                    'HugggAPI -- Error: Error Refreshing Credentials'
                );
            }
        });
    });
});
