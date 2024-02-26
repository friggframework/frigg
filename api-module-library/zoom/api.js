const { get, OAuth2Requester } = require('@friggframework/core-rollup');
const moment = require('moment');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.baseUrl = `https://api.zoom.us/v2/`;
        this.client_id = process.env.ZOOM_CLIENT_ID;
        this.client_secret = process.env.ZOOM_CLIENT_SECRET;
        this.redirect_uri = 'https://29a3f7035dbb.ngrok.io';

        this.authorizationUri = encodeURI(
            `https://zoom.us/oauth/authorize?client_id=${this.client_id}&response_type=code&redirect_uri=${this.redirect_uri}`
        );

        this.tokenUri = `https://zoom.us/oauth/token`;

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
    }

    async getTokenFromCode(code) {
        return await this.getTokenFromCodeBasicAuthHeader(code);
    }

    async getUserList() {
        console.log('getUserList');
        let options = {
            url: this.baseUrl + 'users?status=active',
        };
        options = await this.addAuthHeaders(options);
        let res = await this._get(options);
        return res;
    }

    async getMeetingListByUser(userId) {
        console.log('getMeetingListByUser');
        let options = {
            url: this.baseUrl + `users/${userId}/meetings`,
        };
        options = await this.addAuthHeaders(options);
        let res = await this._get(options);
        return res;
    }

    async getMeetingDetails(meetingId) {
        console.log('getMeetingDetails');
        let options = {
            url: this.baseUrl + `meetings/${meetingId}/`,
        };
        options = await this.addAuthHeaders(options);
        let res = await this._get(options);
        return res;
    }

    async changeMeetingTopic(meetingId, topic) {
        console.log('changeMeetingListByUser');
        let url = `meetings/${meetingId}/`;
        let body = {
            topic: `${topic}`,
        };
        let res = await this._authedPatch(url, body);
        return res;
    }

    async createNewMeeting(userId, topic) {
        console.log('createNewMeeting');
        let url = `users/${userId}/meetings`;
        let time = moment().format();
        let startTime = time.slice(0, -6) + 'Z';
        let body = {
            topic: topic,
            type: 2,
            start_time: startTime,
            duration: 1440,
            timezone: 'America/New_York',
        };
        let res = await this._authedPost(url, body);
        return res;
    }

    async deleteMeeting(meetingId) {
        console.log('deleteMeeting');
        let url = `meetings/${meetingId}`;
        let res = await this._authedDelete(url);
        return res;
    }
}

module.exports = { Api };
