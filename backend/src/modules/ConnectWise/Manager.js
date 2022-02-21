const _ = require('underscore');
const moment = require('moment');
const LHModuleManager = require('../../base/managers/LHModuleManager.js');
const ConnectWiseApi = require('./Api.js');
const Entity = require('./models/Entity');
const Credential = require('./models/Credential');
const ModuleConstants = require('../ModuleConstants');
const AuthFields = require('./AuthFields');

const MANAGER_NAME = 'connectwise';

class Manager extends LHModuleManager {
    static Entity = Entity;
    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    static getName() {
        return MANAGER_NAME;
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
            instance.api = await new ConnectWiseApi(instance.credential);
        } else {
            // instance.api = new ConnectWiseApi();
        }

        // let connectWiseParams = {};
        // connectWiseParams.COMPANY_ID = process.env.CONNECT_WISE_COMPANY_ID;
        // connectWiseParams.PUBLIC_KEY = process.env.CONNECT_WISE_PUBLIC_KEY;
        // connectWiseParams.PRIVATE_KEY = process.env.CONNECT_WISE_PRIVATE_KEY;
        // connectWiseParams.clientId = process.env.clientID;

        return instance;
    }

    async processAuthorizationCallback(params) {
        const public_key = this.getParam(params.data, 'public_key');
        const private_key = this.getParam(params.data, 'private_key');
        const company_id = this.getParam(params.data, 'company_id');
        const site = this.getParam(params.data, 'site');

        const creds = {
            public_key,
            private_key,
            company_id,
            site,
        };

        // verify credentials
        this.api = new ConnectWiseApi(creds);
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
            type: ModuleConstants.authType.basic,
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
        this.getParam(params, 'identifier');
        this.getParam(params, 'name');
        this.getParam(params, 'site');
        this.getParam(params, 'status');
        this.getParam(params, 'types');
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
        this.getParam(params, 'id');
        this.getParam(params, 'description');
        this.getParam(params, 'url');
        this.getParam(params, 'objectId');
        this.getParam(params, 'type');
        this.getParam(params, 'level');
        this.getParam(params, 'memberId');
        this.getParam(params, 'payloadVersion');
        this.getParam(params, 'inactiveFlag');
        this.getParam(params, 'isSoapCallbackFlag');
        this.getParam(params, 'isSelfSuppressedFlag');
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
        this.getParam(params, 'firstName');
        this.getParam(params, 'lastName');
        this.getParam(params, 'relationshipOverride');
        this.getParam(params, 'inactiveFlag');
        this.getParam(params, 'marriedFlag');
        this.getParam(params, 'childrenFlag');
        this.getParam(params, 'disablePortalLoginFlag');
        this.getParam(params, 'unsubscribeFlag');
        this.getParam(params, 'mobileGuid');
        this.getParam(params, 'defaultBillingFlag');
        this.getParam(params, 'defaultFlag');
        this.getParam(params, 'types');
        return await this.api.createContact(params);
    }

    async deleteContact(id) {
        return await this.api.deleteContact(id);
    }

    async updateContact(id) {
        return await this.api.updateContact(id);
    }

    async notify(notifier, delegateString, object = null) {
        if (notifier instanceof ConnectWiseApi) {
            if (delegateString === 'TOKEN_UPDATE') {
                const updatedToken = {
                    company_id: object.company_id,
                    public_key: object.public_key,
                    private_key: object.private_key,
                    clientID: object.client_id,
                };
                this.revIoCredentials = await this.ConnectWiseMO.update(
                    this.revIoCredentials.id,
                    updatedToken
                );
            }
        }
    }
}
module.exports = Manager;
