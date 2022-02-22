/**
 * @group interactive
 */

const Authenticator = require('../utils/Authenticator');
const MondayApiClass = require('../../src/modules/Monday/Api');

describe.skip('Monday API 2', () => {
    const mondayApi = new MondayApiClass();
    beforeAll(async () => {
        const url = mondayApi.authorizationUri;
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        const token = await mondayApi.getTokenFromCode(response.data.code);
    });

    describe('Get Account Info', () => {
        it('should get account info', async () => {
            const response = await mondayApi.getAccount();
            expect(response.data).toHaveProperty('account');
            expect(response.data).toHaveProperty('account.id');
            expect(response.data).toHaveProperty('account.name');
            return response;
        });
    });

    describe('Get List of Boards', () => {
        it('should get board data', async () => {
            const response = await mondayApi.getBoards();
            expect(response).toHaveProperty('account_id');
            expect(response.data).toHaveProperty('boards');
            expect(response.data).toHaveProperty('boards[0].name');

            await mondayApi.query({ query: '{boards { name }}' });

            return response;
        });
    });

    describe('Board Creation', () => {
        let testContext;

        beforeEach(() => {
            testContext = {};
        });

        it('should get create a board', async () => {
            const query =
                'mutation ($boardName: String!) { create_board (board_name: $boardName, board_kind: public) {id, name}}';
            const accountBoard = await mondayApi.query({
                query,
                options: { variables: { boardName: 'Test Board' } },
            });
            testContext.boardId = accountBoard.data.create_board.id;
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
                    boardId: testContext.boardId,
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
                    boardId: testContext.boardId,
                });
            }
        });

        it('should delete/clean up the created board', async () => {});
    });
});
