const { get, OAuth2Requester } = require('@friggframework/core');
const { LinearClient } = require('@linear/sdk');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.actor = get(params, 'actor', 'application');
        this.access_token = get(params, 'access_token', null);
        this.authorizationUri = encodeURI(
            `https://linear.app/oauth/authorize?response_type=code` +
            `&scope=${this.scope}` +
            `&client_id=${this.client_id}` +
            `&redirect_uri=${this.redirect_uri}` +
            `&state=${this.state}`+
            `&actor=${this.actor}`
        );
        this.tokenUri = 'https://api.linear.app/oauth/token';
    }

    getClient() {
        if (!this.client) {
            this.client = new LinearClient({accessToken: this.access_token});
        }
        return this.client;
    }


    async getTokenIdentity() {
        const user = await this.getUser();
        const org = await this.getOrganization();
        return {identifier: org.id, name: user.name};
    }

    async getUser() {
        return this.getClient().viewer;
    }

    async getOrganization() {
        return this.getClient().organization;
    }

    async getUsers() {
        return (await this.getClient().users()).nodes;
    }

    async getUserIssues(user){
        return user.assignedIssues();
    }

    async getProjects(){
        return (await this.getClient().projects()).nodes;
    }

}

module.exports = { Api };
