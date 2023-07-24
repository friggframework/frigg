const { OAuth2Requester } = require('@friggframework/module-plugin');
const { get } = require('@friggframework/assertions');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.baseUrl = 'https://www.googleapis.com';
        this.meUrl = 'https://people.googleapis.com/v1/people/me'
        this.URLs = {
            me: '/oauth2/v2/userinfo',
            calendar: (id) => `/calendar/v3/calendars/${id}`,
            calendars: '/calendar/v3/users/me/calendarList'
        };
        this.authorizationUri = encodeURI(
            `https://app.example.com/oauth/authorize?response_type=code` +
            `&scope=${this.scopes}` +
            `&client_id=${this.client_id}` +
            `&redirect_uri=${this.redirect_uri}`
        );
        this.tokenUri = 'https://oauth2.googleapis.com/token';
    }

    getAuthorizationUri() {
        return encodeURI(
            `https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=${this.client_id}&redirect_uri=${this.redirect_uri}&scope=${this.scope}&access_type=offline&include_granted_scopes=true&state=${this.state}&prompt=consent`
        );
    }

    async getUserDetails() {
        const options = {
            url: this.baseUrl + this.URLs.me,
        };
        return this._get(options);
    }

    async getTokenIdentity() {
        const userInfo = await this.getUserDetails();
        return {identifier: userInfo.id, name: userInfo.name}
    }

    async getCalendars() {
        const options = {
            url: this.baseUrl + this.URLs.calendars,
        };
        return this._get(options);
    }
}

module.exports = { Api };
