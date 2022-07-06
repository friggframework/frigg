const _ = require('lodash');
const moment = require('moment');
const { get } = require('@friggframework/assertions');
const { ModuleManager } = require('@friggframework/module-plugin');
const { Api } = require('./api');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const AuthFields = require('./authFields');
const Config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);

        if (params.userId && !params.entityId) {
            instance.entity = await instance.entityMO.getByUserId(
                params.userId
            );
        }
        // create an entry in the database if it does not exist
        if (!params.entityId && !instance.entity) {
            instance.entity = await instance.entityMO.create({
                user: params.userId,
            });
        }

        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
        }

        // initializes the credentials and the Api
        if (instance.entity.credential) {
            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            instance.api = await new Api(instance.credential);
        } else {
            // instance.api = new Api();
        }

        // let connectWiseParams = {};
        // connectWiseParams.COMPANY_ID = process.env.CONNECT_WISE_COMPANY_ID;
        // connectWiseParams.PUBLIC_KEY = process.env.CONNECT_WISE_PUBLIC_KEY;
        // connectWiseParams.PRIVATE_KEY = process.env.CONNECT_WISE_PRIVATE_KEY;
        // connectWiseParams.clientId = process.env.clientID;

        return instance;
    }

    async processAuthorizationCallback(params) {
        const public_key = get(params.data, 'public_key');
        const private_key = get(params.data, 'private_key');
        const company_id = get(params.data, 'company_id');
        const site = get(params.data, 'site');

        const creds = {
            public_key,
            private_key,
            company_id,
            site,
        };

        // verify credentials
        this.api = new Api(creds);
        const callbacks = await this.api.listCallbacks(); // May have a 401 error we'll need to catch in the route for bad credentials

        let entity = await this.entityMO.getByUserId(this.userId);
        if (!entity) {
            entity = await this.entityMO.create({ user: this.userId });
        }

        let { credential } = entity;
        if (!credential) {
            credential = await this.credentialMO.create(creds);
        } else {
            credential = await this.credentialMO.update(credential, creds);
        }
        await this.entityMO.update(entity.id, { credential });
        return {
            id: entity._id,
            type: Manager.getName(),
        }; // May have a duplicate error we'll need to catch in the route
    }

    async getAuthorizationRequirements(params) {
        // see parent class for docs, but these three fields should be the only top level keys
        return {
            url: null,
            type: 'basic',
            data: {
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async listCompanies() {
        return await this.api.listCompanies();
    }

    async listAllCompanies(limit, page) {
        let companies = await this.api.listCompanies({
            pageSize: limit,
            page: page,
        });
        // for(let i = 0; i < companies.length; i++){
        //     companies.tags =
        // }
        if (companies.length === limit) {
            let nextPages = await this.listAllCompanies(limit, page + 1);
            companies = companies.concat(nextPages);
        }
        return companies;
    }

    // async listCompaniesWithFilter(limit, page, filter){
    //     let companies = await this.api.listCompanies({pageSize: limit, page: page});
    //     // for(let i = 0; i < companies.length; i++){
    //     //     companies.tags =
    //     // }
    //     if(moment(companies[companies.length].createDate).isAfter(filter.startDate)){
    //         let nextPages = await this.listAllCompanies(limit, page + 1);
    //         companies = companies.concat(nextPages);
    //     }
    //     return companies;
    // }

    async createCompany(params) {
        get(params, 'identifier');
        get(params, 'name');
        get(params, 'site');
        get(params, 'status');
        get(params, 'types');
        return await this.api.createCompany(params);
    }

    async getCompanyById(id) {
        return await this.api.getCompanyById(id);
    }

    async deleteCompanyById(id) {
        return await this.api.deleteCompanyById(id);
    }

    async patchCompanyById(id) {
        return await this.api.patchCompanyById(id);
    }

    async createCallback(params) {
        get(params, 'id');
        get(params, 'description');
        get(params, 'url');
        get(params, 'objectId');
        get(params, 'type');
        get(params, 'level');
        get(params, 'memberId');
        get(params, 'payloadVersion');
        get(params, 'inactiveFlag');
        get(params, 'isSoapCallbackFlag');
        get(params, 'isSelfSuppressedFlag');
        return await this.api.createCallback(params);
    }

    async listCallbacks() {
        return await this.api.listCallbacks();
    }

    async getCallbackId(id) {
        return await this.api.getCallbackId(id);
    }

    async deleteCallbackId(id) {
        return await this.api.deleteCallbackId(id);
    }

    async listContacts() {
        return await this.api.listContacts();
    }

    async listAllContacts(limit, page) {
        let contacts = await this.api.listContacts({
            pageSize: limit,
            page: page,
        });
        if (contacts.length === limit) {
            let nextPages = await this.listAllContacts(limit, page + 1);
            contacts = contacts.concat(nextPages);
        }
        return contacts;
    }

    // Don't think we actually need this...
    async listContactsWithFilter(limit, page, filter) {
        let companies = await this.api.listCompanies({
            pageSize: limit,
            page: page,
        });
        // for(let i = 0; i < companies.length; i++){
        //     companies.tags =
        // }
        if (
            moment(companies[companies.length].createDate).isAfter(
                filter.startDate
            )
        ) {
            let nextPages = await this.listAllCompanies(limit, page + 1);
            companies = companies.concat(nextPages);
        }
        return companies;
    }

    async getContactById(id) {
        return await this.api.getContactbyId(id);
    }

    async createContact(params) {
        get(params, 'firstName');
        get(params, 'lastName');
        get(params, 'relationshipOverride');
        get(params, 'inactiveFlag');
        get(params, 'marriedFlag');
        get(params, 'childrenFlag');
        get(params, 'disablePortalLoginFlag');
        get(params, 'unsubscribeFlag');
        get(params, 'mobileGuid');
        get(params, 'defaultBillingFlag');
        get(params, 'defaultFlag');
        get(params, 'types');
        return await this.api.createContact(params);
    }

    async deleteContact(id) {
        return await this.api.deleteContact(id);
    }

    async updateContact(id) {
        return await this.api.updateContact(id);
    }

    async notify(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === 'TOKEN_UPDATE') {
                const updatedToken = {
                    company_id: object.company_id,
                    public_key: object.public_key,
                    private_key: object.private_key,
                    clientID: object.client_id,
                };
                this.credential = await this.credentialMO.update(
                    this.credential.id,
                    updatedToken
                );
            }
        }
    }
}
module.exports = Manager;
