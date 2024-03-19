const _ = require('lodash');
const {Api} = require('./api.js');
const {Entity} = require('./models/entity');
const {Credential} = require('./models/credential.js');
const {
    ModuleManager,
    ModuleConstants,
} = require('@friggframework/core');
const Config = require('./defaultConfig.json');

class Manager extends ModuleManager {
    static Entity = Entity;

    static Credential = Credential;

    constructor(params) {
        super(params);
    }

    //------------------------------------------------------------
    // Required methods
    static getName() {
        return Config.name;
    }

    static async getInstance(params) {
        const instance = new this(params);

        // initializes the Api
        const xbeamParams = {delegate: instance};
        if (params.entityId) {
            instance.entity = await instance.entityMO.get(params.entityId);
            xbeamParams.organization_id = instance.entity.organization_id;
            instance.credential = await instance.credentialMO.get(
                instance.entity.credential
            );
            xbeamParams.access_token = instance.credential.access_token;
            xbeamParams.refresh_token = instance.credential.refresh_token;
        } else if (params.credentialId) {
            instance.credential = await instance.credentialMO.get(
                params.credentialId
            );
            xbeamParams.access_token = instance.credential.access_token;
            xbeamParams.refresh_token = instance.credential.refresh_token;
        }
        instance.api = await new Api(xbeamParams);

        return instance;
    }

    async getAuthorizationRequirements(params) {
        return {
            url: await this.api.authorizationUri,
            type: ModuleConstants.authType.oauth2,
        };
    }

    async processAuthorizationCallback(params) {
        const code = get(params.data, 'code');
        const response = await this.api.getTokenFromCode(code);

        const credentials = await this.credentialMO.list({user: this.userId});

        if (credentials.length === 0) {
            throw new Error('Credential failed to create');
        }
        if (credentials.length > 1) {
            throw new Error('User has multiple credentials???');
        }

        return {
            credential_id: credentials[0]._id,
            entity_id: null,
            type: Manager.getName(),
        };
    }

    async testAuth() {
        await this.api.getUserDetails();
    }

    async getEntityOptions() {
        const userDetails = await this.api.getUserDetails();
        const organizations = userDetails.authorizations.map((auth) => {
            const obj = {};
            obj.value = auth.organization.uuid;
            obj.label = auth.organization.name;
            return obj;
        });
        const options = [
            {
                key: 'organization_id',
                label: 'Organization ID',
                options: organizations,
                required: true,
                type: 'String',
            },
        ];
        return options;
    }

    async findOrCreateEntity(data) {
        const search = await this.entityMO.list({
            organization_id: data.organization_id.value,
        });
        if (search.length === 0) {
            // validate choices!!!
            const userDetails = await this.api.getUserDetails();
            const found = _.find(
                userDetails.authorizations,
                (auth) =>
                    (auth.organization.uuid === data.organization_id.value) &
                    (auth.organization.name === data.organization_id.label)
            );
            if (!found) {
                throw new Error('Invalid organization name or uuid');
            }
            // create entity
            const createObj = {
                credential: data.credential_id,
                user: this.userId,
                name: data.organization_id.label,
                externalId: data.organization_id.value,
                organization_id: data.organization_id.value,
            };
            return this.entityMO.create(createObj);
        }
        if (search.length === 1) {
            return search[0];
        }
        throw new Error(
            `Multiple entities found with the same organization ID: ${data.organization_id}`
        );
    }

    //------------------------------------------------------------

    async deauthorize() {
        // wipe api connection
        this.api = new Api();

        // delete credentials from the database
        const entity = await this.entityMO.getByUserId(this.userId);
        if (entity.credential) {
            await this.credentialMO.delete(entity.credential);
            entity.credential = undefined;
            await entity.save();
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (notifier instanceof Api) {
            if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
                // todo update the database
                const user_info = await this.api.getUserDetails();

                const updatedToken = {
                    user: this.userId.toString(),
                    access_token: this.api.access_token,
                    refresh_token: this.api.refresh_token,
                    expires_at: this.api.accessTokenExpire,
                    crossbeam_user_id: user_info.user.id,
                    // refreshTokenExpire: this.api.refreshTokenExpire,
                };

                Object.keys(updatedToken).forEach(
                    (k) => updatedToken[k] == null && delete updatedToken[k]
                );

                const credentials = await this.credentialMO.list({
                    crossbeam_user_id: updatedToken.crossbeam_user_id,
                });
                let credential;
                if (credentials.length === 1) {
                    credential = credentials[0];
                } else if (credentials.length > 1) {
                    throw new Error('User has multiple credentials???');
                }
                if (!credential) {
                    credential = await this.credentialMO.create(updatedToken);
                } else {
                    credential = await this.credentialMO.update(
                        credential._id,
                        updatedToken
                    );
                }
            }
            if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
                await this.deauthorize();
            }

            if (delegateString === this.api.DLGT_INVALID_AUTH) {
                const credentials = await this.credentialMO.list({
                    user: this.userId,
                });
                if (credentials.length === 1) {
                    return this.credentialMO.update(credentials[0]._id, {
                        auth_is_valid: false,
                    });
                }
                if (credentials.length > 1) {
                    throw new Error('User has multiple credentials???');
                } else if (credentials.length === 0) {
                    throw new Error(
                        'How are we marking nonexistant credentials invalid???'
                    );
                }
            }
        }
    }

    async listAllPartnerPopulations(query = {page: 1, limit: 100}) {
        const results = await this.api.getPartnerPopulations(query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllPartnerPopulations(query);
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }

    async listAllPartners(query = {page: 1, limit: 100}) {
        const results = await this.api.getPartners(query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.getPartners(query);
                results.partner_orgs = results.partner_orgs.concat(next_page);
            }
        }
        return results.partner_orgs;
    }

    async listAllPartnerRecords(query = {page: 1, limit: 100}) {
        const results = await this.api.getPartnerRecords(query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllPartnerRecords(query);
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }

    async listAllPopulations(query = {page: 1, limit: 100}) {
        const results = await this.api.getPopulations(query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllPopulations(query);
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }

    async listAllReports(query = {page: 1, limit: 100}) {
        const results = await this.api.getReports(query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllReports(query);
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }

    async listAllReportData(report_id, query = {page: 1, limit: 100}) {
        const results = await this.api.getReportData(report_id, query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllReportData(
                    report_id,
                    query
                );
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }

    async listAllThreads(query = {page: 1, limit: 100}) {
        const results = await this.api.getThreads(query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllThreads(query);
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }

    async listAllThreadTimelines(thread_id, query = {page: 1, limit: 100}) {
        const results = await this.api.getThreads(thread_id, query);
        if (results.pagination) {
            if (results.pagination.next_href) {
                query.page++;
                const next_page = await this.listAllThreadTimelines(query);
                results.items = results.items.concat(next_page);
            }
        }
        return results.items;
    }
}

module.exports = Manager;
