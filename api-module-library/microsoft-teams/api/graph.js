const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');
class graphApi extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.tenant_id = get(params, 'tenant_id', 'common');
        this.state = get(params, 'state', null);
        this.forceConsent = get(params, 'forceConsent', true);

        // Assuming team id as a param for now
        this.team_id = get(params, 'team_id', null);

        this.generateUrls = ()=> {
            this.baseUrl = 'https://graph.microsoft.com/v1.0';
            this.URLs = {
                userDetails: '/me', //https://graph.microsoft.com/v1.0/me
                orgDetails: '/organization',
                groups: '/groups',
                user: (userId) => `/users/${userId}`,
                createChannel: `/teams/${this.team_id}/channels`,
                channel: (channelId) => `/teams/${this.team_id}/channels/${channelId}/`,
                channelMembers: (channelId) => `/teams/${this.team_id}/channels/${channelId}/members`,
                installedAppsForUser: (userId) => `/users/${userId}/teamwork/installedApps`,
                installedAppsForTeam: (teamId) => `/teams/${teamId}/installedApps`,
                appCatalog: '/appCatalogs/teamsApps',
            };
            this.authorizationUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/authorize`;
            this.tokenUri = `https://login.microsoftonline.com/${this.tenant_id}/oauth2/v2.0/token`;
            this.grantConestUrl = `https://login.microsoftonline.com/${this.tenant_id}/adminconsent?\
            client_id=${this.client_id}&redirect_uri=${this.redirect_uri}`
        }
        this.generateUrls();
    }
    async getAuthUri() {
        const query = {
            client_id: this.client_id,
            response_type: 'code',
            redirect_uri: this.redirect_uri,
            scope: this.scope,
            state: this.state,
        };
        if (this.forceConsent) query.prompt = 'consent';

        return `${this.authorizationUri}?${querystring.stringify(query)}`;
    }

    async getTokenFromClientCredentials() {
        try {
            const url = this.tokenUri;

            let body = new URLSearchParams();
            body.append('scope', 'https://graph.microsoft.com/.default');
            body.append('client_id', this.client_id);
            body.append('client_secret', this.client_secret);
            body.append('grant_type', 'client_credentials');

            const tokenRes = await this._post( {
                url,
                body,
            }, false);

            await this.setTokens(tokenRes);
            return tokenRes;
        } catch {
            await this.notify(this.DLGT_INVALID_AUTH);
        }
    }

    setTenantId(tenantId) {
        this.tenant_id = tenantId;
        this.generateUrls();
    }

    setTeamId(teamId) {
        this.team_id = teamId;
        this.generateUrls();
    }
    async getUser() {
        const options = {
            url: `${this.baseUrl}${this.URLs.userDetails}`
        };
        const response = await this._get(options);
        return response;
    }
    async getOrganization() {
        const options = {
            url: `${this.baseUrl}${this.URLs.orgDetails}`
        };
        const response = await this._get(options);
        return response.value[0];
    }

    async getGroups(query) {
        const options = {
            url: `${this.baseUrl}${this.URLs.groups}`,
            query
        };
        const response = await this._get(options);
        return response;
    }

    async getJoinedTeams(userId) {
        // no userId is only valid for delgated authentication
        const userPart = userId ? this.URLs.user(userId) : this.URLs.userDetails;
        const options = {
            url: `${this.baseUrl}${userPart}/joinedTeams`
        };
        const response = await this._get(options);
        return response;
    }

    async getAppCatalog(query) {
        const options = {
            url: `${this.baseUrl}${this.URLs.appCatalog}`,
            query
        };
        const response = await this._get(options);
        return response;
    }

    async getInstalledAppsForUser(userId, query) {
        //this is also valid for /me but not implementing yet
        const options = {
            url: `${this.baseUrl}${this.URLs.installedAppsForUser(userId)}`,
            query
        };
        const response = await this._get(options);
        return response;
    }

    async installAppForUser(userId, teamsAppId) {
        const options = {
            url: `${this.baseUrl}${this.URLs.installedAppsForUser(userId)}`,
            body: {
                'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${teamsAppId}`
            },
            headers: {
                'Content-Type': 'application/json',
            },
            returnFullRes: true
        };
        const response = await this._post(options);
        return response;
    }

    async removeAppForUser(userId, teamsAppInstallationId) {
        const options = {
            url: `${this.baseUrl}${this.URLs.installedAppsForUser(userId)}/${teamsAppInstallationId}`,
        };
        const response = await this._delete(options);
        return response;
    }

    async getInstalledAppsForTeam(teamId, query) {
        //this is also valid for /me but not implementing yet
        const options = {
            url: `${this.baseUrl}${this.URLs.installedAppsForTeam(teamId)}`,
            query
        };
        const response = await this._get(options);
        return response;
    }

    async installAppForTeam(teamId, teamsAppId) {
        const options = {
            url: `${this.baseUrl}${this.URLs.installedAppsForTeam(teamId)}`,
            body: {
                'teamsApp@odata.bind': `https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/${teamsAppId}`
            },
            headers: {
                'Content-Type': 'application/json',
            },
            returnFullRes: true
        };
        const response = await this._post(options);
        return response;
    }

    async removeAppForTeam(teamId, teamsAppInstallationId) {
        const options = {
            url: `${this.baseUrl}${this.URLs.installedAppsForTeam(teamId)}/${teamsAppInstallationId}`,
        };
        const response = await this._delete(options);
        return response;
    }

    async getChannels(query) {
        const options = {
            url: `${this.baseUrl}${this.URLs.createChannel}`,
            query
        };
        const response = await this._get(options);
        return response;
    }

    async createChannel(body) {
        // creating a private channel as an application requires a member owner to be added at creation
        const options = {
            url : `${this.baseUrl}${this.URLs.createChannel}`,
            body: body,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }
        };
        const response = await this._post(options);
        return response;
    }

    async deleteChannel(channelId) {
        const options = {
            url : `${this.baseUrl}${this.URLs.channel(channelId)}`
        };
        const response = await this._delete(options);
        return response;
    }

    async listChannelMembers(channelId) {
        //TODO: add search odata options
        const options = {
            url : `${this.baseUrl}${this.URLs.channelMembers(channelId)}`
        };
        const response = await this._get(options);
        return response;
    }

    async addUserToChannel(channelId, user) {
        const options = {
            url : `${this.baseUrl}${this.URLs.channelMembers(channelId)}`,
            body: user,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            }
        };
        const response = await this._post(options);
        return response;
    }
}

module.exports = { graphApi };
