const mondaySdk = require('monday-sdk-js');
const OAuth2Base = require('../../base/auth/OAuth2Base');

const monday = mondaySdk();

class MondayAPI extends OAuth2Base {
    constructor(params) {
        super(params);

        this.client_id = process.env.MONDAY_CLIENT_ID;
        this.client_secret = process.env.MONDAY_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/monday`;
        this.scopes = process.env.MONDAY_SCOPES;

        this.authorizationUri = encodeURI(
            `https://auth.monday.com/oauth2/authorize?state=app:MONDAY&client_id=${this.client_id}&response_type=code&scope=${this.scopes}&redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = 'https://auth.monday.com/oauth2/token';

        this.access_token = this.getParam(params, 'access_token', null);
        this.refresh_token = this.getParam(params, 'refresh_token', null);
        if (this.access_token) {
            monday.setToken(this.access_token);
        }
    }

    async setTokens(params) {
        await super.setTokens(params);
        monday.setToken(this.access_token);
    }

    async getAccount() {
        return monday.api('{account {id, name}}');
    }

    async query(params) {
        const query = this.getParam(params, 'query');
        const options = this.getParam(params, 'options', {});
        return monday.api(query, options);
    }

    async getBoards() {
        return monday.api('{boards {name, id}}');
    }

    async createColumn(params) {
        const boardId = this.getParam(params, 'boardId');
        const title = this.getParam(params, 'title');
        const type = this.getParam(params, 'type');

        const query = `mutation { 
      create_column (board_id: ${boardId}, title: ${JSON.stringify(
            title
        )}, column_type: ${type}) {
        id, title }}`;
        const res = await monday.api(query);
        return res.data.create_column;
    }

    // TODO this is too specific to the Crossbeam integration. Need to make it a bit more generic,
    //  or describe how it's intended to be helpful
    async createItem(params) {
        const boardId = this.getParam(params, 'boardId');
        const itemName = this.getParam(params, 'itemName');
        const columnValues = this.getParam(params, 'columnValues');

        const columnIdQuery = `query {boards (ids: ${boardId}){columns{id title type}}}`;
        const columnResponse = await monday.api(columnIdQuery);
        const { columns } = columnResponse.data.boards[0];
        const newColumnValues = {};
        Object.keys(columnValues).map((value) => {
            const foundColumn = columns.find((col) => col.title === value);
            if (foundColumn)
                newColumnValues[foundColumn.id] = columnValues[value];
        });

        const query = `mutation { 
      create_item (board_id: ${boardId}, item_name: ${JSON.stringify(
            itemName
        )}, column_values: ${JSON.stringify(JSON.stringify(newColumnValues))}) {
        id }}`;
        return monday.api(query);
    }

    async updateItem(params) {
        const boardId = this.getParam(params, 'boardId');
        const itemId = this.getParam(params, 'itemId');
        const columnValues = this.getParam(params, 'columnValues');

        const columnIdQuery = `query {boards (ids: ${boardId}){columns{id title type}}}`;
        const columnResponse = await monday.api(columnIdQuery);
        const { columns } = columnResponse.data.boards[0];
        const newColumnValues = {};
        Object.keys(columnValues).map((value) => {
            const foundColumn = columns.find((col) => col.title === value);
            if (foundColumn)
                newColumnValues[foundColumn.id] = columnValues[value];
        });

        const query = `mutation { 
      change_multiple_column_values (board_id: ${boardId}, item_id: ${itemId}, column_values: ${JSON.stringify(
            JSON.stringify(newColumnValues)
        )}) {
        id }}`;
        return monday.api(query);
    }

    async createBoard(params) {
        const name = this.getParam(params, 'name');
        const kind = this.getParam(params, 'kind');

        const query =
            'mutation ($boardName: String! $boardKind: BoardKind!) { create_board (board_name: $boardName, board_kind: $boardKind) {id, name}}';
        const options = {
            variables: {
                boardName: name,
                boardKind: kind,
            },
        };
        const res = await monday.api(query, options);
        return res.data.create_board;
    }

    async getBoardColumns(params) {
        const boardId = this.getParam(params, 'boardId');
        const columnIdQuery = `query {boards (ids: ${boardId}){columns{id title type}}}`;
        const columnResponse = await monday.api(columnIdQuery);
        const { columns } = columnResponse.data.boards[0];
        return columns;
    }
}

module.exports = MondayAPI;
