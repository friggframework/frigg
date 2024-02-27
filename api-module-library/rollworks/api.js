const { get, RequiredPropertyError, OAuth2Requester } = require('@friggframework/core');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);

        this.baseUrl = 'https://services.adroll.com';

        this.client_id = process.env.ROLLWORKS_CLIENT_ID;
        this.client_secret = process.env.ROLLWORKS_CLIENT_SECRET;
        this.redirect_uri = `${process.env.REDIRECT_URI}/rollworks`;
        this.scopes = process.env.ROLLWORKS_SCOPES;

        this.URLs = {
            access_token: 'auth/token',
            getOrganization: '/api/v1/organization/get',
            getTargetAccounts: (advertisableEid) =>
                `/audience/v1/target_accounts?advertisable_eid=${advertisableEid}`,
            getTargetAccount: (targetAccountId, advertisableEid) =>
                `/audience/v1/target_accounts/${targetAccountId}?advertisable_eid=${advertisableEid}`,
            createTargetAccount: (advertisableEid) =>
                `/audience/v1/target_accounts?advertisable_eid=${advertisableEid}`,
            deleteTargetAccount: (targetAccountId, advertisableEid) =>
                `/audience/v1/target_accounts/${targetAccountId}?advertisable_eid=${advertisableEid}`,
            populateTargetAccount: (targetAccountId, advertisableEid) =>
                `/audience/v1/target_accounts/${targetAccountId}/tiers/all/items?advertisable_eid=${advertisableEid}`,
        };

        this.authorizationUri = `https://services.adroll.com/auth/authorize?state=&client_id=${this.client_id}&response_type=code&scope=${this.scopes}&redirect_uri=${this.redirect_uri}`;
        this.tokenUri = 'https://services.adroll.com/auth/token';

        this.access_token = get(params, 'access_token', null);
        this.refresh_token = get(params, 'refresh_token', null);
        this.organization_id = get(params, 'organization_id', null);
        this.advertisable_eid = get(params, 'advertisable_eid', null);
    }

    setAdvertisableEid(advertisable_eid) {
        this.advertisable_eid = advertisable_eid;
    }

    getAdvertisableEid() {
        if (
            this.advertisable_eid === undefined ||
            this.advertisable_eid === null ||
            this.advertisable_eid === ''
        ) {
            throw new RequiredPropertyError({
                parent: this,
                key: 'advertisable_eid',
            });
        }
        return this.advertisable_eid;
    }

    async getOrganization() {
        const requestData = {
            url: `${this.baseUrl}${this.URLs.getOrganization}`,
        };
        const res = await this._get(requestData);
        return res;
    }

    async getTargetAccounts() {
        const advertisableEid = this.getAdvertisableEid();
        const requestData = {
            url: `${this.baseUrl}${this.URLs.getTargetAccounts(
                advertisableEid
            )}`,
        };
        const res = await this._get(requestData);
        return res;
    }

    async getTargetAccount(params) {
        const advertisableEid = this.getAdvertisableEid();
        const targetAccountId = get(params, 'targetAccountId');
        const requestData = {
            url: `${this.baseUrl}${this.URLs.getTargetAccount(
                targetAccountId,
                advertisableEid
            )}`,
        };
        const res = await this._get(requestData);
        return res;
    }

    async createTargetAccount(data) {
        const advertisableEid = this.getAdvertisableEid();
        const body = {
            name: getAndVerifyParamType(data, 'name', 'string'),
            domains: this.getArrayParamAndVerifyParamType(
                data,
                'domains',
                'string'
            ),
            advertisable_eid: advertisableEid,
        };
        const requestData = {
            url: `${this.baseUrl}${this.URLs.createTargetAccount(
                advertisableEid
            )}`,
            body,
            headers: { 'Content-Type': 'application/json' },
        };
        const res = await this._post(requestData);
        return res;
    }

    async populateTargetAccount(eid, data) {
        const advertisableEid = this.getAdvertisableEid();
        const domains = get(data, 'domains');
        const domainArr = [];
        for (const index in domains) {
            domainArr.push({ domain: domains[index] });
        }

        const body = {
            items: domainArr,
        };
        const requestData = {
            url: `${this.baseUrl}${this.URLs.populateTargetAccount(
                eid,
                advertisableEid
            )}`,
            body,
            headers: { 'Content-Type': 'application/json' },
        };
        const res = await this._post(requestData);
        return res;
    }

    async deleteTargetAccount(accountId) {
        const advertisableEid = this.getAdvertisableEid();
        const requestData = {
            url: `${this.baseUrl}${this.URLs.deleteTargetAccount(
                accountId,
                advertisableEid
            )}`,
            headers: { 'Content-Type': 'application/json' },
        };
        const res = await this._delete(requestData);
        return res;
    }
}

module.exports = { Api };
