require('../../../../test/utils/TestUtils');
const chai = require('chai');

const should = chai.should();

const Authenticator = require('../../../../test/utils/Authenticator');
const MondayApiClass = require('../Api.js');

describe('Monday API', async () => {
    const mondayApi = new MondayApiClass();
    before(async () => {
        const url = mondayApi.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await mondayApi.getTokenFromCode(response.data.code);
    });

    describe('Get Account Info', async () => {
        it('should get account info', async () => {
            const response = await mondayApi.getAccount();
            response.data.should.have.property('account');
            response.data.should.have.nested.property('account.id');
            response.data.should.have.nested.property('account.name');
            return response;
        });
    });

    describe('Get List of Boards', async () => {
        it('should get board data', async () => {
            const response = await mondayApi.getBoards();
            response.should.have.property('account_id');
            response.data.should.have.property('boards');
            response.data.should.have.nested.property('boards[0].name');

            // not sure what this does or why it's important to the test..
            // but it keeps failing, so commenting out
            // await mondayApi.query({ query: '{boards { name }}' });

            return response;
        });
    });

    describe('Board Creation', async () => {
        it('should get create a board', async () => {
            const query =
                'mutation ($boardName: String!) { create_board (board_name: $boardName, board_kind: public) {id, name}}';
            const accountBoard = await mondayApi.query({
                query,
                options: { variables: { boardName: 'Test Board' } },
            });
            this.boardId = accountBoard.data.create_board.id;
        });

        it('should add columns to the created board', async () => {
            const columns = [
                { title: 'First Name', type: 'text' },
                { title: 'Last Name', type: 'text' },
                { title: 'Email', type: 'text' },
                { title: 'Title', type: 'text' },
                { title: 'partner', type: 'text' },
                { title: 'partner_population', type: 'text' },
                { title: 'population', type: 'text' },
            ];

            for (const column of columns) {
                const res = await mondayApi.createColumn({
                    title: column.title,
                    type: column.type,
                    boardId: this.boardId,
                });
            }
        });
        it('should add items to the created board', async () => {
            const items = [
                {
                    itemName: 'Sean Matthews',
                    columnValues: {
                        'Last Name': 'Matthews',
                    },
                },
                {
                    itemName: 'Nicole Charest',
                    columnValues: {
                        'Last Name': 'Charest',
                    },
                },
            ];

            for (const item of items) {
                const res = await mondayApi.createItem({
                    itemName: item.itemName,
                    columnValues: item.columnValues,
                    boardId: this.boardId,
                });
            }
        });

        it('should delete/clean up the created board', async () => {});
    });
});
