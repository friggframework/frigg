const _ = require('underscore');
const moment = require('moment');
const ModuleManager = require('@friggframework/core/managers/ModuleManager.js');
const { Api } = require('./api.js');
const { Entity } = require('./models/entity');
const { Credential } = require('./models/credential');
const ModuleConstants = require('../ModuleConstants');
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

        return instance;
    }

    async processAuthorizationCallback(params) {
        // verify credentials
        const username = get(params.data, 'username');
        const password = get(params.data, 'password');
        const client_code = get(params.data, 'client_code');

        this.api = new Api({ username, password, client_code });
        const billProfile = await this.api.getBillProfile(); // May have a 401 error we'll need to catch in the route for bad credentials

        // add credentials to db
        let entity = await this.entityMO.getByUserId(this.userId);
        if (!entity) {
            entity = await this.entityMO.create({ user: this.userId });
        }

        let { credential } = entity;
        if (!credential) {
            credential = await this.credentialMO.create({
                username,
                password,
                client_code,
            });
        } else {
            credential = await this.credentialMO.update(credential, {
                username,
                password,
                client_code,
            });
        }
        await this.entityMO.update(entity.id, { credential });
        return {
            id: entity._id,
            type: Manager.getName(),
        };
    }

    async getAuthorizationRequirements(params) {
        // see parent docs. only use these three top level keys
        return {
            url: null,
            type: ModuleConstants.authType.basic,
            data: {
                // fields: AuthFields.revioAuthorizationFields,
                jsonSchema: AuthFields.jsonSchema,
                uiSchema: AuthFields.uiSchema,
            },
        };
    }

    async notify(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === 'TOKEN_UPDATE') {
                const updatedToken = {
                    user_name: object.user_name,
                    user_code: object.user_code,
                    password: object.password,
                };
                this.revIoCredentials = await this.RevIoMO.update(
                    this.revIoCredentials.id,
                    updatedToken
                );
            }
        }
    }

    async listAllCustomers(limit, page) {
        const req = await this.api.getCustomers({
            'search.page_size': limit,
            'search.page': page,
        });

        let customers = req.records;
        if (req.has_more) {
            const nextPages = await this.listAllCustomers(limit, page + 1);
            customers = customers.concat(nextPages);
        }
        return customers;
    }

    async listFilteredCustomers(limit, page, filter) {
        const date = moment(filter.startDate).format('YYYY-MM-DDThh:mm:ss');
        const req = await this.api.getCustomers({
            page_size: limit,
            page,
            updated_date_start: date,
        });
        // let req = await this.api.getCustomers({page_size: limit, page: page, created_date_start: date});
        let customers = req.records;
        if (req.has_more) {
            const nextPages = await this.listFilteredCustomers(
                limit,
                page + 1,
                filter
            );
            customers = customers.concat(nextPages);
        }
        return customers;
    }

    async listAllContacts(limit, page) {
        const req = await this.api.getContacts({ page_size: limit, page });
        let contacts = req.records;
        if (req.has_more) {
            const nextPages = await this.listAllContacts(limit, page + 1);
            contacts = contacts.concat(nextPages);
        }
        return contacts;
    }

    async listFilteredContacts(limit, page, filter) {
        const date = moment(filter.startDate).format('YYYY-MM-DDThh:mm:ss');
        const req = await this.api.getContacts({
            page_size: limit,
            page,
            created_date_start: date,
        });
        let contacts = req.records;
        if (req.has_more) {
            const nextPages = await this.listFilteredContacts(
                limit,
                page + 1,
                filter
            );
            contacts = contacts.concat(nextPages);
        }
        return contacts;
    }
}
module.exports = Manager;
